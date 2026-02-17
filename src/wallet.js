const { ethers } = require('ethers');
const config = require('./config');
const provider = require('./provider');

let wallet;

if (config.auth.privateKey && config.auth.privateKey !== 'YOUR_WALLET_PRIVATE_KEY_HERE') {
    wallet = new ethers.Wallet(config.auth.privateKey, provider);
} else {
    // Create a random wallet for scan-only mode (no real transactions)
    wallet = ethers.Wallet.createRandom().connect(provider);
    console.log('[WALLET] No private key configured. Using random wallet for read-only operations.');
}

module.exports = {
    wallet,
};
