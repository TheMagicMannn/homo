require('dotenv').config();
const fs = require('fs');
const path = require('path');

function loadConfig() {
    const configPath = path.join(__dirname, '../config/config.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('Configuration file not found at ' + configPath);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey || privateKey === 'YOUR_WALLET_PRIVATE_KEY_HERE') {
        console.warn('[CONFIG] WARNING: PRIVATE_KEY not set. Bot will run in read-only/scan mode.');
    }

    const network = process.env.NETWORK || 'base';
    if (!['base', 'baseSepolia'].includes(network)) {
        throw new Error(`Invalid NETWORK specified in .env: ${network}`);
    }

    const rpcUrls = network === 'base'
        ? (process.env.BASE_RPC_URLS ? process.env.BASE_RPC_URLS.split(',').map(u => u.trim()).filter(Boolean) : [])
        : [process.env.BASE_SEPOLIA_RPC_URL];

    if (!rpcUrls || rpcUrls.length === 0 || !rpcUrls[0]) {
        throw new Error(`RPC URLs for ${network} are not set in the .env file.`);
    }

    const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017';
    const dbName = process.env.BOT_DB_NAME || 'flashbot_dashboard';

    return {
        ...config,
        network,
        rpcUrls,
        mongoUrl,
        dbName,
        auth: {
            privateKey: privateKey || '',
        },
        apiKeys: {
            dexScreener: process.env.DEXSCREENER_API_KEY,
        },
    };
}

module.exports = loadConfig();
