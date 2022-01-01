# ZigZag Markets

Base URL: https://zigzag-markets.herokuapp.com/

## Usage

You can specify an alias and a chain for supported markets

```
curl "https://zigzag-markets.herokuapp.com/market?id=UNI-USDC&chainid=1"
```

Or simply a market ID to grab any market

```
curl "https://zigzag-markets.herokuapp.com/market?id=Trz9R2BPwQkXhF_NRMsKv2reX_K3-0sE6tXiH8apz_4"
```

You can create markets by uploading market info to Arweave through our frontend:

[https://trade.zigzag.exchange/list-pair](https://trade.zigzag.exchange/list-pair)
