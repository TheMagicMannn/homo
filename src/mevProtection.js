const { ethers } = require('ethers');
const config = require('./config');
const { log, withErrorHandling } = require('./utils');
const provider = require('./provider');
const { wallet } = require('./wallet');

/**
 * MEV Protection for Base Chain
 *
 * Base uses a centralized sequencer operated by Coinbase.
 * There is NO public mempool on Base, which means:
 * - No front-running risk from public mempool searchers
 * - No need for Flashbots (Ethereum-only)
 * - Standard transaction submission is sufficient
 *
 * For additional protection, we:
 * 1. Use tight deadlines on swaps
 * 2. Set reasonable gas price limits
 * 3. Simulate transactions before sending
 * 4. Use nonce management to prevent stuck transactions
 */

let nonce = null;

/**
 * Gets the next nonce, managing it locally for rapid transaction submission.
 */
async function getNextNonce() {
    if (nonce === null) {
        nonce = await wallet.getNonce();
    }
    return nonce++;
}

/**
 * Resets the nonce counter (e.g., after a failed transaction).
 */
async function resetNonce() {
    nonce = await wallet.getNonce();
}

/**
 * Sends a transaction on Base chain.
 * Uses standard submission since Base has no public mempool.
 */
const sendPrivateTransaction = async (tx) => {
    log('Preparing transaction for Base chain...');

    try {
        // Get current fee data for Base chain (EIP-1559)
        const feeData = await provider.getFeeData();

        // Check gas price against configured maximum
        const maxGasGwei = config.maxGasPriceGwei || 0.1;
        const maxGasWei = ethers.parseUnits(maxGasGwei.toString(), 'gwei');
        const currentGas = feeData.maxFeePerGas || feeData.gasPrice;

        if (currentGas > maxGasWei) {
            log(`Gas price ${ethers.formatUnits(currentGas, 'gwei')} gwei exceeds max ${maxGasGwei} gwei. Skipping.`);
            return null;
        }

        // Set EIP-1559 gas parameters
        tx.maxFeePerGas = feeData.maxFeePerGas;
        tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        tx.nonce = await getNextNonce();
        tx.chainId = 8453; // Base mainnet
        tx.type = 2; // EIP-1559

        // Estimate gas with buffer
        if (!tx.gasLimit) {
            const gasEstimate = await provider.estimateGas(tx);
            tx.gasLimit = (gasEstimate * 130n) / 100n; // 30% buffer
        }

        log(`Sending transaction (nonce: ${tx.nonce}, gas: ${ethers.formatUnits(tx.maxFeePerGas, 'gwei')} gwei)`);
        const txResponse = await wallet.sendTransaction(tx);
        log(`Transaction sent: ${txResponse.hash}`);

        return txResponse;
    } catch (error) {
        log(`Transaction failed: ${error.message}`);
        // Reset nonce on failure to prevent stuck transactions
        await resetNonce();
        return null;
    }
};

module.exports = {
    sendPrivateTransaction: withErrorHandling(sendPrivateTransaction),
    resetNonce,
};
