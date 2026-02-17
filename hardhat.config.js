require('dotenv').config();
require("@nomicfoundation/hardhat-toolbox");

const baseRpcUrls = process.env.BASE_RPC_URLS || '';
const firstRpcUrl = baseRpcUrls.split(',')[0] || 'https://mainnet.base.org';

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    base: {
      url: firstRpcUrl,
      accounts: process.env.PRIVATE_KEY && process.env.PRIVATE_KEY !== 'YOUR_WALLET_PRIVATE_KEY_HERE'
        ? [process.env.PRIVATE_KEY]
        : [],
      chainId: 8453,
      gasPrice: 'auto',
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY && process.env.PRIVATE_KEY !== 'YOUR_WALLET_PRIVATE_KEY_HERE'
        ? [process.env.PRIVATE_KEY]
        : [],
      chainId: 84532,
    },
  },
};
