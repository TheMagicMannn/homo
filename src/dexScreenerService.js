const axios = require('axios');
const { log, withErrorHandling } = require('./utils');

const DEXSCREENER_API_URL = 'https://api.dexscreener.com/latest/dex/';

/**
 * Fetches trading pairs for a set of DEXes on Base from DexScreener.
 * Builds a comprehensive token database with pair information.
 */
async function fetchAllPairs(dexIds) {
    const tokenDatabase = {};
    log(`Fetching pairs for DEXs: ${dexIds.join(', ')}...`);

    for (const dexId of dexIds) {
        try {
            // Use DexScreener search to find pairs on Base
            const url = `${DEXSCREENER_API_URL}search?q=${encodeURIComponent(dexId + ' base')}`;
            const response = await axios.get(url, { timeout: 15000 });
            const pairs = response.data?.pairs || [];

            // Filter for Base chain pairs only
            const basePairs = pairs.filter(p =>
                p.chainId === 'base' &&
                p.liquidity?.usd > 10000 // Minimum $10k liquidity
            );

            log(`Found ${basePairs.length} Base pairs for ${dexId}`);

            for (const pair of basePairs) {
                const { baseToken, quoteToken, liquidity, dexId: pairDex } = pair;
                if (!baseToken || !quoteToken) continue;

                const baseAddr = baseToken.address.toLowerCase();
                const quoteAddr = quoteToken.address.toLowerCase();

                // Add tokens to database
                [
                    [baseAddr, baseToken],
                    [quoteAddr, quoteToken]
                ].forEach(([addr, token]) => {
                    if (!tokenDatabase[addr]) {
                        tokenDatabase[addr] = {
                            symbol: token.symbol,
                            name: token.name,
                            pairs: {},
                            liquidity: 0,
                        };
                    }
                });

                // Add pair information (bidirectional)
                const dexName = pairDex || dexId;
                tokenDatabase[baseAddr].pairs[quoteAddr] = { dex: dexName };
                tokenDatabase[quoteAddr].pairs[baseAddr] = { dex: dexName };

                // Aggregate liquidity
                const liq = liquidity?.usd || 0;
                tokenDatabase[baseAddr].liquidity += liq;
                tokenDatabase[quoteAddr].liquidity += liq;
            }

            // Rate limit between requests
            await new Promise(r => setTimeout(r, 500));

        } catch (error) {
            log(`Failed to fetch pairs for ${dexId}: ${error.message}`);
        }
    }

    log(`Built database with ${Object.keys(tokenDatabase).length} tokens.`);
    return tokenDatabase;
}

module.exports = {
    fetchAllPairs: withErrorHandling(fetchAllPairs),
};
