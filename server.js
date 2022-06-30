import * as Redis from 'redis';
import express from 'express';
import * as zksync from "zksync";
import dotenv from "dotenv";
import fetch from "node-fetch";
import ethers from "ethers";
import fs from 'fs';

dotenv.config();

// Connect to Redis
const redis_url = process.env.REDIS_URL;
const redis_use_tls = redis_url.includes("rediss");
const redis = Redis.createClient({
    url: redis_url,
    socket: {
        tls: redis_use_tls,
        rejectUnauthorized: false
    },
});
redis.on('error', (err) => console.log('Redis Client Error', err));
await redis.connect();

// Connect to zksync
const syncProvider = {
    1: await zksync.getDefaultRestProvider("mainnet"),
    1000: await zksync.getDefaultRestProvider("rinkeby"),
}

const zkSyncBaseUrl = {
    1: "https://api.zksync.io/api/v0.2/",
    1000: "https://rinkeby-api.zksync.io/api/v0.2/"
}

// Connect to Infura
const ethersProvider = new ethers.providers.InfuraProvider(
    "mainnet",
    process.env.INFURA_PROJECT_ID,
);
const rinkebyEthersProvider = new ethers.providers.InfuraProvider(
    "rinkeby",
    process.env.INFURA_PROJECT_ID,
);

// Load ERC-20 ABI
const ERC20_ABI = JSON.parse(fs.readFileSync('ERC20.abi'));

// Initiate update loops
setInterval(updateTokenFees, 60000);
setInterval(checkForNewFeeTokens, 86400000);

const app = express();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get("/markets", async function (req, res) {
    const chain_id = req.query.chainid;
    const markets = req.query.id.split(",");
    const marketInfo = [];
    for (let i in markets) {
        const market_id = markets[i];
        try {
            const market = await getMarket(market_id, chain_id)

            const baseFee = await redis.get(`tokenfee:${chain_id}:${market.baseAsset.symbol}`);
            const quoteFee = await redis.get(`tokenfee:${chain_id}:${market.quoteAsset.symbol}`);
            if (baseFee) {
                market.baseFee = baseFee * 1.1;
            }
            if (quoteFee) {
                market.quoteFee = quoteFee * 1.1;
            }
            market.baseAsset.name = await getTokenName(market.baseAsset.address, chain_id, market.baseAsset.symbol);
            market.quoteAsset.name = await getTokenName(market.quoteAsset.address, chain_id, market.quoteAsset.symbol);
            marketInfo.push(market);
        } catch (e) {
            console.error(e);
            marketInfo.push({ error: e.message, market: market_id });
        }
    }
    return res.status(200).json(marketInfo);
});

app.listen(process.env.PORT || 3002);


async function getMarket(market_id, chainid = null) {
    let marketInfo;
    if (market_id.length < 20) {
        if (!chainid) throw new Error("chainid must be set for alias calls");
        const alias = market_id;
        marketInfo = await redis.get(`zigzag:markets:${chainid}:${alias}`);

        if (marketInfo) {
            return JSON.parse(marketInfo);
        }
        else {
            throw new Error("bad alias");
        }
    }

    const redis_key = "zigzag:markets:" + market_id;
    marketInfo = await redis.get(redis_key);
    if (marketInfo) {
        return JSON.parse(marketInfo);
    }
    else {
        marketInfo = await fetch("https://arweave.net/" + market_id)
            .then(r => r.json())

        marketInfo.baseAsset = await getTokenInfo(marketInfo.baseAssetId, marketInfo.zigzagChainId);
        marketInfo.quoteAsset = await getTokenInfo(marketInfo.quoteAssetId, marketInfo.zigzagChainId);
        marketInfo.baseAsset.name = await getTokenName(marketInfo.baseAsset.address, marketInfo.zigzagChainId, marketInfo.baseAsset.symbol);
        marketInfo.quoteAsset.name = await getTokenName(marketInfo.quoteAsset.address, marketInfo.zigzagChainId, marketInfo.quoteAsset.symbol);
        marketInfo.id = market_id;
        marketInfo.alias = marketInfo.baseAsset.symbol + "-" + marketInfo.quoteAsset.symbol;

        const redis_key_alias = `zigzag:markets:${marketInfo.zigzagChainId}:${marketInfo.alias}`;
        redis.set(redis_key, JSON.stringify(marketInfo));
        redis.set(redis_key_alias, JSON.stringify(marketInfo));

        if (marketInfo.baseAsset.enabledForFees) {
            await redis.SADD(`tokenfee:${marketInfo.zigzagChainId}`, marketInfo.baseAsset.symbol);
        } else {
            await redis.SADD(`nottokenfee:${marketInfo.zigzagChainId}`, marketInfo.baseAsset.symbol);
        }
        if (marketInfo.quoteAsset.enabledForFees) {
            await redis.SADD(`tokenfee:${marketInfo.zigzagChainId}`, marketInfo.quoteAsset.symbol);
        } else {
            await redis.SADD(`nottokenfee:${marketInfo.zigzagChainId}`, marketInfo.quoteAsset.symbol);
        }
        return marketInfo;
    }
}

async function getTokenInfo(tokenId, chainid) {
    if (!chainid) throw new Error("chainid not set");
    const redis_key = `tokeninfo:${chainid}:${tokenId}`;
    let tokenInfo = await redis.get(redis_key);
    if (tokenInfo) return JSON.parse(tokenInfo);
    else {
        tokenInfo = await syncProvider[chainid].tokenInfo(tokenId);
        redis.set(redis_key, JSON.stringify(tokenInfo), { 'EX': 86400 });
        return tokenInfo;
    }
}

async function getTokenName(contractAddress, chainid, symbol) {
    const redis_key = `tokenname:${chainid}:${contractAddress}`;

    const cache = await redis.get(redis_key);
    if (cache) return cache;

    let name;
    if (symbol === "ETH") {
        name = "Ethereum";
    }
    else {
        try {
            const contract = new ethers.Contract(contractAddress, ERC20_ABI, ethersProvider);
            name = await contract.name();
        } catch (e) {
            console.error(e);
            name = symbol;
        }
    }

    if (name) redis.set(redis_key, name);
    else redis.set(redis_key, symbol);

    return name;
}

async function updateTokenFees() {
    const chainIds = [1,1000];
    for(let i=0; i < chainIds.length; i++) {
        const chainid = chainIds[i];
        const availableTokens = await redis.SMEMBERS(`tokenfee:${chainid}`);
        availableTokens.forEach(async (token) => {
            const fee = await getFeeForFeeToken(token, chainid);
            if(fee) {
                redis.set(`tokenfee:${chainid}:${token}`, fee, { 'EX': 300 });
            } else {
                redis.del(`tokenfee:${chainid}:${token}`);
            }
        });
        const notAvailableTokens = await redis.SMEMBERS(`nottokenfee:${chainid}`);
        notAvailableTokens.forEach(async (token) => {
            const fee = await getFeeForNotFeeToken(token, chainid);
            if (fee) {
                redis.set(`tokenfee:${chainid}:${token}`, fee, { 'EX': 300 });
            } else {
                redis.del(`tokenfee:${chainid}:${token}`);
            }
        });
    }
}

async function checkForNewFeeTokens() {
    console.log("Checking for new fee tokens:")
    const chainIds = [1,1000];
    for(let i=0; i < chainIds.length; i++) {
        const chainId = chainIds[i];
        const notAvailableTokens = await redis.SMEMBERS(`nottokenfee:${chainId}`);
        notAvailableTokens.forEach(async (token) => {
            const fee = await getFeeForFeeToken(token, chainId);
            if(fee) {
                redis.SADD(`tokenfee:${chainId}`, token);
                redis.SREM(`nottokenfee:${chainId}`, token);
            }
        });
    }
}

async function getFeeForFeeToken(token, chainid) {
    try {
        const feeReturn = await syncProvider[chainid].getTransactionFee(
            "Swap",
            '0x88d23a44d07f86b2342b4b06bd88b1ea313b6976',
            token
        );
        return parseFloat(syncProvider[chainid].tokenSet.formatToken(token, feeReturn.totalFee));
    } catch (e) {
        console.log("Can't get fee for: " + token + ", error: "+e);
        if(e.message.includes("Chosen token is not suitable for paying fees.")) {
            redis.SREM(`tokenfee:${chainid}`, token);
            redis.SADD(`nottokenfee:${chainid}`, token);
        }
        return null;
    }
}