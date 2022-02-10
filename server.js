import * as Redis from 'redis';
import express from 'express';
import * as zksync from "zksync";
import dotenv from "dotenv";
import fetch from "node-fetch";

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

setInterval(updateTokenFees, 180 * 1000)

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
            marketInfo.push(market);
        } catch (e) {
            console.error(e);
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
        marketInfo.id = market_id;
        marketInfo.alias = marketInfo.baseAsset.symbol + "-" + marketInfo.quoteAsset.symbol;

        const redis_key_alias = `zigzag:markets:${marketInfo.zigzagChainId}:${marketInfo.alias}`;
        redis.set(redis_key, JSON.stringify(marketInfo));
        redis.set(redis_key_alias, JSON.stringify(marketInfo));

        if (marketInfo.baseAsset.enabledForFees) {
            await redis.SADD(`tokenfee:${marketInfo.zigzagChainId}`, marketInfo.baseAsset.symbol);
        }
        if (marketInfo.quoteAsset.enabledForFees) {
            await redis.SADD(`tokenfee:${marketInfo.zigzagChainId}`, marketInfo.quoteAsset.symbol);
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

async function updateTokenFees() {
    const chainids = [1,1000];
    for(let i=0; i < chainids.length; i++) {
        const chainid = chainids[i];
        const tokens = await redis.SMEMBERS(`tokenfee:${chainid}`);
        tokens.forEach(async (token) => {
            const fee = await getFeeForToken(token, chainid);
            await redis.set(`tokenfee:${chainid}:${token}`, fee);
        });
    }
}

async function getFeeForToken(tokenId, chainid) {
    try {
        const feeReturn = await syncProvider[chainid].getTransactionFee(
            "Swap",
            '0x88d23a44d07f86b2342b4b06bd88b1ea313b6976',
            tokenId
        );
        return parseFloat(syncProvider[chainid].tokenSet.formatToken(tokenId, feeReturn.totalFee));
    } catch (e) {
        console.log("Can't get fee for: " + tokenId);
        if(e.message.includes("Chosen token is not suitable for paying fees.")) {
            redis.SREM(`tokenfee:${chainid}`, tokenId);
        }
        return null;
    }
}
