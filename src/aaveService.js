const { ethers } = require('ethers');
const config = require('./config');
const { log, withErrorHandling } = require('./utils');
const provider = require('./provider');

// Aave V3 Pool on Base
const POOL_ADDRESS = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'; // Aave V3 Pool on Base

const poolContract = new ethers.Contract(POOL_ADDRESS, [
    'function getReservesList() external view returns (address[] memory)'
], provider);

/**
 * Fetches the list of all reservable assets from the Aave V3 Pool on Base.
 * These are the assets that can be used for flash loans.
 */
async function getFlashLoanableAssets() {
    log('Fetching flash loanable assets from Aave V3 on Base...');
    try {
        const assets = await poolContract.getReservesList();
        log(`Found ${assets.length} flash loanable assets.`);
        return assets.map(a => a.toLowerCase());
    } catch (error) {
        log(`Failed to fetch Aave assets: ${error.message}`);
        // Fallback to known Aave V3 Base assets
        const fallbackAssets = [
            '0x4200000000000000000000000000000000000006', // WETH
            '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
            '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', // USDbC
            '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI
            '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', // cbETH
        ];
        log(`Using ${fallbackAssets.length} fallback assets.`);
        return fallbackAssets;
    }
}

module.exports = {
    getFlashLoanableAssets: withErrorHandling(getFlashLoanableAssets),
};
