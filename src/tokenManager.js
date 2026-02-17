const axios = require('axios');
const config = require('./config');
const { log, withErrorHandling } = require('./utils');

const dexScreenerApi = axios.create({
    baseURL: 'https://api.dexscreener.com/latest/',
    timeout: 10000,
});

let volatileTokens = [];

/**
 * Fetches trending tokens on Base from DexScreener.
 */
const fetchTrendingTokens = async () => {
    log('Fetching trending Base tokens from DexScreener...');
    try {
        const response = await dexScreenerApi.get('dex/search?q=base');
        const pairs = response.data?.pairs || [];

        // Filter for Base chain only
        const basePairs = pairs.filter(p => p.chainId === 'base');

        const tokenMap = new Map();
        basePairs.forEach(pair => {
            if (pair.baseToken) {
                tokenMap.set(pair.baseToken.address.toLowerCase(), {
                    address: pair.baseToken.address.toLowerCase(),
                    symbol: pair.baseToken.symbol,
                });
            }
            if (pair.quoteToken) {
                tokenMap.set(pair.quoteToken.address.toLowerCase(), {
                    address: pair.quoteToken.address.toLowerCase(),
                    symbol: pair.quoteToken.symbol,
                });
            }
        });

        log(`Found ${tokenMap.size} trending tokens on Base.`);
        return Array.from(tokenMap.values());
    } catch (error) {
        log(`Failed to fetch trending tokens: ${error.message}`);
        return [];
    }
};

/**
 * Updates the list of volatile tokens.
 */
const updateVolatileList = async () => {
    const newTokens = await fetchTrendingTokens();
    if (newTokens && newTokens.length > 0) {
        volatileTokens = newTokens;
        log(`Volatile token list updated: ${volatileTokens.length} tokens`);
    }
};

const getVolatileTokens = () => volatileTokens;

const getTokenAddress = (symbol) => {
    // Check config common tokens first
    if (config.commonTokens) {
        const addr = config.commonTokens[symbol.toUpperCase()];
        if (addr) return addr.toLowerCase();
    }
    const token = volatileTokens.find(t => t.symbol.toLowerCase() === symbol.toLowerCase());
    return token ? token.address : null;
};

/**
 * Gets the pair address for two token symbols from DexScreener.
 */
const getPairAddress = async (token0Symbol, token1Symbol) => {
    try {
        const query = `${token0Symbol} ${token1Symbol} base`;
        const response = await dexScreenerApi.get(`dex/search?q=${encodeURIComponent(query)}`);
        const pairs = response.data?.pairs || [];
        const basePair = pairs.find(p => p.chainId === 'base');
        if (basePair) return basePair.pairAddress;
        return null;
    } catch (error) {
        log(`Failed to get pair address for ${token0Symbol}/${token1Symbol}: ${error.message}`);
        return null;
    }
};

module.exports = {
    fetchTrendingTokens: withErrorHandling(fetchTrendingTokens),
    updateVolatileList: withErrorHandling(updateVolatileList),
    getVolatileTokens,
    getTokenAddress,
    getPairAddress: withErrorHandling(getPairAddress),
};
