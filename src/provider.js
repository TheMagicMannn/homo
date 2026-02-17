const { ethers } = require('ethers');
const config = require('./config');
const { log } = require('./utils');

// ============================================================
// Provider Setup with Flashblocks Support
//
// Flashblocks on Base provide 200ms preconfirmations via
// sub-blocks streamed every 200ms (10 per full 2-second block).
// This gives the bot 10x faster state updates and confirmations.
//
// To enable Flashblocks:
// 1. Use a Flashblocks-enabled RPC from QuickNode/Alchemy/Chainstack
// 2. Set FLASHBLOCKS_WS_URL in .env for WebSocket sub-block streaming
// 3. The bot will automatically use pending state for faster quotes
// ============================================================

// Standard HTTP providers with fallback
const providerConfigs = config.rpcUrls.map((url, index) => ({
    provider: new ethers.JsonRpcProvider(url),
    priority: index,
    stallTimeout: 1500,
}));

const provider = new ethers.FallbackProvider(providerConfigs);

// Flashblocks WebSocket provider (optional, for real-time sub-block streaming)
let flashblocksWsProvider = null;
let flashblocksEnabled = false;
let latestFlashblock = null;
const flashblockListeners = [];

/**
 * Initializes the Flashblocks WebSocket connection.
 * Subscribes to `newFlashblocks` for 200ms preconfirmation updates.
 */
async function initFlashblocks() {
    const wsUrl = config.flashblocksWsUrl;
    if (!wsUrl) {
        log('[FLASHBLOCKS] No WebSocket URL configured. Using standard 2-second blocks.');
        log('[FLASHBLOCKS] Set FLASHBLOCKS_WS_URL in .env for 200ms preconfirmations.');
        return false;
    }

    try {
        log(`[FLASHBLOCKS] Connecting to ${wsUrl}...`);
        flashblocksWsProvider = new ethers.WebSocketProvider(wsUrl);

        // Subscribe to newFlashblocks events
        await flashblocksWsProvider.send('eth_subscribe', ['newFlashblocks']);

        flashblocksWsProvider.on('message', (data) => {
            try {
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                if (parsed.params && parsed.params.result) {
                    latestFlashblock = {
                        ...parsed.params.result,
                        receivedAt: Date.now(),
                    };
                    // Notify all listeners
                    for (const listener of flashblockListeners) {
                        try { listener(latestFlashblock); } catch (e) { /* ignore */ }
                    }
                }
            } catch (e) {
                // Not all messages are flashblock updates
            }
        });

        flashblocksWsProvider.on('error', (err) => {
            log(`[FLASHBLOCKS] WebSocket error: ${err.message}`);
        });

        flashblocksWsProvider.on('close', () => {
            log('[FLASHBLOCKS] WebSocket closed. Reconnecting in 5s...');
            flashblocksEnabled = false;
            setTimeout(initFlashblocks, 5000);
        });

        flashblocksEnabled = true;
        log('[FLASHBLOCKS] Connected! 200ms preconfirmations active.');
        return true;
    } catch (error) {
        log(`[FLASHBLOCKS] Failed to connect: ${error.message}`);
        log('[FLASHBLOCKS] Falling back to standard block times.');
        return false;
    }
}

/**
 * Register a callback for new flashblock events.
 * The callback receives the flashblock data on every ~200ms sub-block.
 */
function onFlashblock(callback) {
    flashblockListeners.push(callback);
}

/**
 * Gets the latest state using Flashblocks-aware queries.
 * Uses 'pending' block tag for the most recent flashblock state.
 */
async function getLatestState() {
    if (flashblocksEnabled) {
        // Use pending block tag to get flashblock-aware state
        try {
            const block = await provider.getBlock('pending');
            return block;
        } catch (e) {
            // Fallback to latest
        }
    }
    return await provider.getBlock('latest');
}

/**
 * Waits for a transaction to be included in a flashblock (preconfirmation)
 * or a full block (finality). Flashblocks give ~200ms preconfirmation.
 */
async function waitForFlashblockConfirmation(txHash, timeoutMs = 5000) {
    if (!flashblocksEnabled) {
        // Standard wait - 2 second block time
        const receipt = await provider.waitForTransaction(txHash, 1, timeoutMs);
        return receipt;
    }

    // With Flashblocks, poll more aggressively (every 100ms)
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            const receipt = await provider.getTransactionReceipt(txHash);
            if (receipt) {
                log(`[FLASHBLOCKS] TX confirmed in ~${Date.now() - startTime}ms (preconfirmation)`);
                return receipt;
            }
        } catch (e) { /* not yet */ }
        await new Promise(r => setTimeout(r, 100)); // Poll every 100ms
    }

    // Fallback to standard wait
    log('[FLASHBLOCKS] Preconfirmation timeout, waiting for full block...');
    return await provider.waitForTransaction(txHash, 1, 30000);
}

/**
 * Gets the effective scan interval based on Flashblocks availability.
 * With Flashblocks: scan every ~200ms sub-block
 * Without: use configured interval (default 4000ms)
 */
function getEffectiveScanInterval() {
    if (flashblocksEnabled) {
        // Scan every 200ms (each flashblock sub-block)
        return 200;
    }
    return config.scanIntervalMs || 4000;
}

module.exports = provider;
module.exports.initFlashblocks = initFlashblocks;
module.exports.onFlashblock = onFlashblock;
module.exports.getLatestState = getLatestState;
module.exports.waitForFlashblockConfirmation = waitForFlashblockConfirmation;
module.exports.getEffectiveScanInterval = getEffectiveScanInterval;
module.exports.isFlashblocksEnabled = () => flashblocksEnabled;
