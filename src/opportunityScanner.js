const { ethers } = require('ethers');
const config = require('./config');
const { log, withErrorHandling } = require('./utils');
const aggregatorService = require('./aggregatorService');
const dexService = require('./dexService');
const { calculateNetProfit, isProfitable, simulateTransaction, estimateGasCost } = require('./profitCalculator');
const provider = require('./provider');

/**
 * Gets the best quote for a single hop from all available DEXs and aggregators.
 */
async function getBestHopQuote(fromToken, toToken, amountIn, preferredDex) {
    const quotes = [];

    // Always try direct DEX quotes for speed
    if (!preferredDex || preferredDex === 'uniswap') {
        const uniQuote = await dexService.getUniswapQuote(fromToken, toToken, amountIn);
        if (uniQuote) quotes.push(uniQuote);
    }

    if (!preferredDex || preferredDex === 'aerodrome') {
        const aeroQuote = await dexService.getAerodromeQuote(fromToken, toToken, amountIn);
        if (aeroQuote) quotes.push(aeroQuote);
    }

    // Always try Odos aggregator (covers all Base DEXes)
    const odosQuote = await aggregatorService.getOdosQuote(fromToken, toToken, amountIn);
    if (odosQuote) quotes.push(odosQuote);

    const validQuotes = quotes.filter(q => q && q.toTokenAmount && BigInt(q.toTokenAmount) > 0n);
    if (validQuotes.length === 0) return null;

    // Return the quote with the highest output amount
    return validQuotes.reduce((best, current) =>
        BigInt(current.toTokenAmount) > BigInt(best.toTokenAmount) ? current : best
    );
}

/**
 * Builds swap calldata for a specific quote.
 */
async function buildSwapData(quote, fromToken, toToken, amountIn) {
    if (quote.aggregator === 'odos') {
        // For Odos, get assembled transaction
        const assembled = await aggregatorService.getOdosAssemble(quote);
        return assembled; // Returns { to, data }
    }

    // Calculate minimum output with slippage
    const slippageFactor = BigInt(Math.round((1 - (config.slippageBuffer || 0.003)) * 10000));
    const amountOutMin = (BigInt(quote.toTokenAmount) * slippageFactor) / 10000n;

    if (quote.dex === 'uniswap') {
        return await dexService.getUniswapSwapData(fromToken, toToken, amountIn, amountOutMin, quote.fee);
    }

    if (quote.dex === 'aerodrome') {
        return await dexService.getAerodromeSwapData(fromToken, toToken, amountIn, amountOutMin, quote.stable);
    }

    if (quote.dex === 'pancakeswap') {
        return await dexService.getPancakeSwapSwapData(fromToken, toToken, amountIn, amountOutMin, quote.fee);
    }

    return null;
}

/**
 * Evaluates a multi-hop arbitrage path for profitability.
 */
async function evaluatePath(pathHops, initialAmount, tokenDatabase) {
    const pathSymbols = pathHops.map(hop =>
        tokenDatabase[hop.from]?.symbol || hop.from.slice(0, 8)
    ).join(' -> ') + ` -> ${tokenDatabase[pathHops[pathHops.length - 1].to]?.symbol || pathHops[pathHops.length - 1].to.slice(0, 8)}`;

    log(`Scanning: ${pathSymbols}`);

    let currentAmount = BigInt(initialAmount);
    const executedHops = [];
    const tokens = [pathHops[0].from];

    for (const hop of pathHops) {
        const quote = await getBestHopQuote(hop.from, hop.to, currentAmount.toString(), hop.dex);
        if (!quote) {
            return null; // No viable quote for this hop
        }

        const swapData = await buildSwapData(quote, hop.from, hop.to, currentAmount);
        if (!swapData || !swapData.to || !swapData.data) {
            return null; // Failed to build swap calldata
        }

        executedHops.push({ target: swapData.to, data: swapData.data });
        tokens.push(hop.to);
        currentAmount = BigInt(quote.toTokenAmount);
    }

    const finalAmount = currentAmount;
    const borrowedAmount = BigInt(initialAmount);

    // Calculate net profit (accounting for flash loan premium and gas)
    const gasCostEstimate = ethers.parseUnits('0.0005', 'ether'); // Conservative gas estimate for Base
    const { netProfit, profitPercent } = calculateNetProfit(finalAmount, borrowedAmount, gasCostEstimate);

    const startSymbol = tokenDatabase[tokens[0]]?.symbol || tokens[0].slice(0, 8);
    log(`Result: ${ethers.formatUnits(netProfit, 18)} ${startSymbol} (${profitPercent.toFixed(2)}%)`);

    if (await isProfitable(netProfit, `${tokens[0]}/${tokens[tokens.length - 1]}`)) {
        // Simulate before committing
        const contractAddr = config.contractAddress[config.network];
        if (contractAddr) {
            const ABI = [
                'function executeArb(address[] calldata tokens, tuple(address target, bytes data)[] calldata hops, uint256 amount)'
            ];
            const iface = new ethers.Interface(ABI);
            const calldata = iface.encodeFunctionData('executeArb', [tokens, executedHops, initialAmount]);

            const simSuccess = await simulateTransaction(contractAddr, calldata);
            if (!simSuccess) {
                log('Simulation failed. Skipping opportunity.');
                return null;
            }
        }

        return {
            netProfit,
            profitPercent,
            initialAmount: initialAmount.toString(),
            finalAmount: finalAmount.toString(),
            tokens,
            hops: executedHops,
            pathDescription: pathSymbols,
        };
    }

    return null;
}

/**
 * Scans all cached arbitrage paths for profitable opportunities.
 */
async function scanAllPaths(paths, tokenDatabase) {
    log(`Scanning ${paths.length} paths for arbitrage...`);
    const opportunities = [];

    try {
        const scanAmountStr = config.scanAmount || '1';
        const initialAmount = ethers.parseUnits(scanAmountStr, 'ether').toString();

        // Process paths in batches to avoid overwhelming RPC
        const batchSize = 5;
        for (let i = 0; i < paths.length; i += batchSize) {
            const batch = paths.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map(p => {
                    if (!p || p.length === 0) return Promise.resolve(null);
                    return evaluatePath(p, initialAmount, tokenDatabase);
                })
            );

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    opportunities.push(result.value);
                    log(`PROFITABLE: ${result.value.pathDescription} | ${ethers.formatUnits(result.value.netProfit, 18)} ETH`);
                }
            }
        }
    } catch (error) {
        log(`Error scanning paths: ${error.message}`);
    }

    log(`Found ${opportunities.length} profitable opportunities out of ${paths.length} paths.`);
    return opportunities;
}

module.exports = {
    scanAllPaths: withErrorHandling(scanAllPaths),
    getBestHopQuote: withErrorHandling(getBestHopQuote),
};
