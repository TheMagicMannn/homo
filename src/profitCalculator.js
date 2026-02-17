const { ethers } = require('ethers');
const config = require('./config');
const { log, withErrorHandling } = require('./utils');
const provider = require('./provider');

// Aave V3 flash loan premium on Base is 0.05% (5 bps) for most assets
// Some assets have 0% premium. Using 0.05% as default to be safe.
const AAVE_PREMIUM_BPS = 5n; // 0.05% = 5 basis points
const BPS_DENOMINATOR = 10000n;

/**
 * Calculates the net profit of a potential arbitrage trade.
 * @param {BigInt} grossOutput The gross output from the trade.
 * @param {BigInt} borrowedAmount The amount borrowed in the flash loan.
 * @param {BigInt} gasEstimate The estimated gas cost in wei.
 * @returns {object} An object containing the net profit and other details.
 */
function calculateNetProfit(grossOutput, borrowedAmount, gasEstimate) {
    // Flash loan premium (0.05%)
    const premium = (borrowedAmount * AAVE_PREMIUM_BPS) / BPS_DENOMINATOR;
    const repayAmount = borrowedAmount + premium;

    // Adjust output for slippage
    const slippageBps = BigInt(Math.round((config.slippageBuffer || 0.003) * 10000));
    const slippageAdjustedOutput = grossOutput - (grossOutput * slippageBps) / BPS_DENOMINATOR;

    // Net profit = adjusted output - repay amount - gas cost
    const netProfit = slippageAdjustedOutput - repayAmount - gasEstimate;

    // Profit percentage (basis points for precision)
    const profitBps = borrowedAmount > 0n
        ? Number((netProfit * BPS_DENOMINATOR) / borrowedAmount)
        : 0;

    return {
        netProfit,
        profitPercent: profitBps / 100, // Convert bps to percentage
        repayAmount,
        premium,
        slippageAdjustedOutput,
    };
}

/**
 * Determines if a trade is profitable based on configured threshold.
 */
async function isProfitable(netProfit, pair) {
    const thresholdEth = config.minProfitThresholdEth || config.profitThreshold || 0.001;
    const threshold = ethers.parseUnits(thresholdEth.toString(), 'ether');
    return netProfit > threshold;
}

/**
 * Simulates a transaction off-chain to verify its outcome.
 */
async function simulateTransaction(contractAddress, calldata) {
    log('Simulating transaction...');
    try {
        await provider.call({
            to: contractAddress,
            data: calldata,
        });
        log('Simulation passed.');
        return true;
    } catch (error) {
        log(`Simulation failed: ${error.reason || error.message}`);
        return false;
    }
}

/**
 * Estimates the gas cost of a transaction in wei.
 */
async function estimateGasCost(tx) {
    try {
        const [gasLimit, feeData] = await Promise.all([
            provider.estimateGas(tx),
            provider.getFeeData()
        ]);
        const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 0n;
        return gasLimit * gasPrice;
    } catch (error) {
        // Return a conservative default if estimation fails
        return ethers.parseUnits('0.0005', 'ether');
    }
}

module.exports = {
    calculateNetProfit,
    isProfitable: withErrorHandling(isProfitable),
    simulateTransaction: withErrorHandling(simulateTransaction),
    estimateGasCost: withErrorHandling(estimateGasCost),
};
