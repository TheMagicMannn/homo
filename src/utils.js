const { ethers } = require('ethers');

/**
 * Logs a message with a timestamp.
 */
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * A simple sleep utility.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * A simple error handling wrapper for async functions.
 * Logs the error and returns undefined instead of throwing.
 */
function withErrorHandling(fn) {
    return async function(...args) {
        try {
            return await fn(...args);
        } catch (error) {
            log(`Error in ${fn.name}: ${error.message}`);
            return undefined;
        }
    };
}

module.exports = {
    log,
    sleep,
    withErrorHandling,
};
