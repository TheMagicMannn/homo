const axios = require('axios');
const { log, withErrorHandling } = require('./utils');

const dexScreenerApi = axios.create({
    baseURL: 'https://api.dexscreener.com/latest/',
    timeout: 10000,
});

/**
 * Fetches historical price data for a token pair from DexScreener.
 * @param {string} pairAddress The address of the token pair.
 * @returns {Promise<Array<number>>} A list of historical prices.
 */
const getHistoricalData = async (pairAddress) => {
    try {
        const response = await dexScreenerApi.get(`dex/pairs/base/${pairAddress}`);
        const pair = response.data?.pair || response.data?.pairs?.[0];
        if (!pair) return null;

        // DexScreener doesn't provide granular price history in basic API
        // Use available price data points for Z-score calculation
        const prices = [];
        if (pair.priceUsd) prices.push(parseFloat(pair.priceUsd));
        if (pair.priceChange) {
            // Reconstruct approximate price history from change percentages
            const currentPrice = parseFloat(pair.priceUsd);
            if (pair.priceChange.h1) {
                prices.push(currentPrice / (1 + pair.priceChange.h1 / 100));
            }
            if (pair.priceChange.h6) {
                prices.push(currentPrice / (1 + pair.priceChange.h6 / 100));
            }
            if (pair.priceChange.h24) {
                prices.push(currentPrice / (1 + pair.priceChange.h24 / 100));
            }
        }
        return prices.length >= 2 ? prices : null;
    } catch (error) {
        log(`Failed to fetch historical data for ${pairAddress}: ${error.message}`);
        return null;
    }
};

/**
 * Computes the Z-score for a given token pair.
 * z = (current_spread - mean_spread) / std_dev
 */
const computeZScore = async (pair, window = 100) => {
    const [token0Symbol, token1Symbol] = pair.split('/');

    // Search for the pair on DexScreener
    try {
        const response = await dexScreenerApi.get(`dex/search?q=${token0Symbol} ${token1Symbol} base`);
        const pairs = response.data?.pairs || [];
        const basePair = pairs.find(p => p.chainId === 'base');
        if (!basePair) return null;

        const historicalData = await getHistoricalData(basePair.pairAddress);
        if (!historicalData || historicalData.length < 2) return null;

        const currentPrice = historicalData[0]; // Most recent
        const mean = historicalData.reduce((a, b) => a + b, 0) / historicalData.length;
        const squaredDiffs = historicalData.map(val => (val - mean) ** 2);
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / historicalData.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev === 0) return 0;
        return (currentPrice - mean) / stdDev;
    } catch (error) {
        return null;
    }
};

/**
 * Checks if a token pair represents a high-conviction opportunity.
 */
const isHighConviction = async (pair, threshold = 2.5) => {
    const zScore = await computeZScore(pair);
    if (zScore === null) return false;
    return Math.abs(zScore) > threshold;
};

module.exports = {
    computeZScore: withErrorHandling(computeZScore),
    isHighConviction: withErrorHandling(isHighConviction),
};
