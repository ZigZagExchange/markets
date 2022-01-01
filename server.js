import markets from './markets.js';
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

const app = express();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get("/market", async function (req, res) {
    const chain_id = req.query.chainid;
    const market_id = req.query.id;
    try {
        const market = await getMarket(market_id, chain_id)
        return res.status(200).json(market);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }
});

app.listen(process.env.PORT || 3002);


async function getMarket(market_id, chainid = null) {
    let market_hash;
    if (chainid && !markets[chainid]) throw new Error("Unsupported chainid");
    if (chainid && market_id.length < 20 && !markets[chainid][market_id]) throw new Error("Invalid alias");
    if (chainid && markets[chainid][market_id]) {
        market_hash = markets[chainid][market_id]
    }
    else {
        market_hash = market_id;
    }
    const redis_key = "zigzag:markets:" + market_hash;
    let marketInfo = await redis.get(redis_key);
    if (marketInfo) {
        return JSON.parse(marketInfo);
    }
    else {
        marketInfo = await fetch("https://arweave.net/" + market_hash)
            .then(r => r.json())
        marketInfo.baseAsset = await getTokenInfo(marketInfo.baseAssetId, marketInfo.zigzagChainId);
        marketInfo.quoteAsset = await getTokenInfo(marketInfo.quoteAssetId, marketInfo.zigzagChainId);
        marketInfo.id = market_hash;
        marketInfo.alias = getAliasForHash(market_hash, chainid);
        redis.set(redis_key, JSON.stringify(marketInfo));
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
        redis.set(redis_key, JSON.stringify(tokenInfo));
        return tokenInfo;
    }
}

function getAliasForHash(market_hash, chainid) {
    for (let alias in markets[chainid]) {
        if (market_hash === markets[chainid][alias]) {
            return alias;
        }
    }
    return null;
}
