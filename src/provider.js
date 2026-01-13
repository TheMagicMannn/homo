const { ethers } = require('ethers');
const config = require('./config');

// Create a configuration for each provider, specifying a priority and stallTimeout.
// This allows the FallbackProvider to intelligently switch between nodes.
const providerConfigs = config.rpcUrls.map((url, index) => ({
  provider: new ethers.JsonRpcProvider(url),
  priority: index,
  stallTimeout: 1500, // ms
}));

const provider = new ethers.FallbackProvider(providerConfigs);

module.exports = provider;
