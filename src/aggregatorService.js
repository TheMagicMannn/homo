const axios = require('axios');
const config = require('./config');
const { log, withErrorHandling } = require('./utils');
const dexAggregators = require('./utils/dexAggregators');

// ============================================================
// ODOS - Top DEX Aggregator on Base Chain
// Covers: Uniswap V3, Aerodrome, PancakeSwap, SushiSwap,
//         BaseSwap, Maverick, Curve, Balancer, and 50+ more
// ============================================================

const odosApi = axios.create({
    baseURL: config.aggregatorUrls?.odos || 'https://api.odos.xyz/',
    timeout: 10000,
});

const ODOS_ROUTER_V2 = config.dexAddresses?.odos?.routerV2 || '0x19cEeAd7105607Cd444F5ad10dd51356436095a1';

/**
 * Gets a quote from Odos DEX aggregator.
 * This aggregates across ALL Base chain DEXes for best pricing.
 */
const getOdosQuote = async (fromTokenAddress, toTokenAddress, amount) => {
    await dexAggregators.odos.limiter.acquire();

    const quoteRequestBody = {
        chainId: 8453, // Base mainnet
        inputTokens: [
            {
                tokenAddress: fromTokenAddress,
                amount: amount.toString()
            }
        ],
        outputTokens: [
            {
                tokenAddress: toTokenAddress,
                proportion: 1
            }
        ],
        userAddr: config.contractAddress[config.network] || '0x0000000000000000000000000000000000000000',
        slippageLimitPercent: (config.slippageBuffer || 0.003) * 100,
        referralCode: 0,
        disableRFQs: true,
        compact: true,
    };

    try {
        const response = await odosApi.post('sor/quote/v2', quoteRequestBody);
        if (response.data && response.data.outAmounts && response.data.outAmounts.length > 0) {
            return {
                aggregator: 'odos',
                toTokenAmount: response.data.outAmounts[0],
                pathId: response.data.pathId,
                gasEstimate: response.data.gasEstimate,
                priceImpact: response.data.percentDiff,
                ...response.data,
            };
        }
        return null;
    } catch (error) {
        log(`Odos quote failed: ${error.response?.data?.detail || error.message}`);
        return null;
    }
};

/**
 * Gets the assembled swap transaction data from Odos.
 * This returns ready-to-execute calldata for the Odos Router.
 */
const getOdosAssemble = async (quote) => {
    if (!quote || !quote.pathId) {
        log('Invalid quote for Odos assemble');
        return null;
    }

    await dexAggregators.odos.limiter.acquire();

    const contractAddr = config.contractAddress[config.network];
    if (!contractAddr) {
        log('Contract address not set. Cannot assemble Odos transaction.');
        return null;
    }

    const assembleRequestBody = {
        userAddr: contractAddr,
        pathId: quote.pathId,
        simulate: false,
    };

    try {
        const response = await odosApi.post('sor/assemble', assembleRequestBody);
        if (response.data && response.data.transaction) {
            return {
                to: response.data.transaction.to || ODOS_ROUTER_V2,
                data: response.data.transaction.data,
                value: response.data.transaction.value || '0',
                gasLimit: response.data.transaction.gas,
            };
        }
        return null;
    } catch (error) {
        log(`Odos assemble failed: ${error.response?.data?.detail || error.message}`);
        return null;
    }
};


module.exports = {
    getOdosQuote: withErrorHandling(getOdosQuote),
    getOdosAssemble: withErrorHandling(getOdosAssemble),
    ODOS_ROUTER_V2,
};
