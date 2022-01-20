# ZigZag Markets

Base URL: https://zigzag-markets.herokuapp.com/

## Usage

You can specify one or more aliases and a chain for supported markets

```
curl "https://zigzag-markets.herokuapp.com/markets?id=UNI-USDC&chainid=1"
```

```
curl "https://zigzag-markets.herokuapp.com/markets?id=UNI-USDC,ETH-USDC&chainid=1"
```

Or simply a market ID to grab any market

```
curl "https://zigzag-markets.herokuapp.com/markets?id=Trz9R2BPwQkXhF_NRMsKv2reX_K3-0sE6tXiH8apz_4"
```

You can create markets by uploading market info to Arweave through our frontend:

[https://trade.zigzag.exchange/list-pair](https://trade.zigzag.exchange/list-pair)

## Sample Response

```
curl "https://zigzag-markets.herokuapp.com/markets?id=UNI-USDC&chainid=1"

[
  {
    "baseAssetId": "23",
    "quoteAssetId": "2",
    "baseFee": 0.0001,
    "quoteFee": 1,
    "minSize": "0.01",
    "maxSize": "100",
    "zigzagChainId": 1,
    "pricePrecisionDecimal": 2,
    "baseAsset": {
      "id": 23,
      "address": "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
      "symbol": "UNI",
      "decimals": 18,
      "enabledForFees": true
    },
    "quoteAsset": {
      "id": 2,
      "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "symbol": "USDC",
      "decimals": 6,
      "enabledForFees": true
    },
    "id": "keenBs3m8IykC43dh5GrUmQOnzfJKwNyglQcr7WqtOU",
    "alias": "UNI-USDC"
  }
]
```



