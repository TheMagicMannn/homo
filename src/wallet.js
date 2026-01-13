const { ethers } = require('ethers');
const config = require('./config');
const provider = require('./provider');

const wallet = new ethers.Wallet(config.auth.privateKey, provider);

module.exports = {
    wallet,
};
