export const getMarket(chainid, market) {
    if (markets[chainid][market]) {
        return markets[chainid][market];
    }
    else {
        return fetch("https://arweave.net/" + market)
            .then(r => r.json())
    }
}

// Markets are keyed by chainid than market alias
export default const markets = {
    1: {
        ETH-USDT: "gc5YxJq6KJ1Ks2daH1iLPm4Roo7o-PAzQhr0BahAhmE",
        ETH-USDC: "Trz9R2BPwQkXhF_NRMsKv2reX_K3-0sE6tXiH8apz_4",
        UNI-USDC: "kbv1tA3R5LXMlnOipHUpczMiJ-AGzHWtEDzuYmQvCmc"
    }
}
