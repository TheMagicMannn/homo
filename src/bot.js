const { ethers } = require('ethers');
const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { wallet } = require('./wallet');
const { log, sleep, withErrorHandling } = require('./utils');
const { getFlashLoanableAssets } = require('./aaveService');
const { fetchAllPairs } = require('./dexScreenerService');
const { generateAndCachePaths } = require('./pathGenerator');
const { scanAllPaths } = require('./opportunityScanner');
const { sendPrivateTransaction } = require('./mevProtection');

const SCAN_INTERVAL = config.scanIntervalMs || 4000;
let scanCount = 0;
let isRunning = false;

/**
 * Handles a profitable opportunity by preparing and executing the transaction.
 */
async function handleOpportunity(opportunity) {
    log(`=== EXECUTING OPPORTUNITY ===`);
    log(`Path: ${opportunity.pathDescription || 'multi-hop'}`);
    log(`Estimated profit: ${ethers.formatUnits(opportunity.netProfit, 18)} ETH`);

    const { tokens, hops, initialAmount } = opportunity;

    if (!tokens || !hops || !initialAmount) {
        log('Invalid opportunity data.');
        return null;
    }

    const contractAddress = config.contractAddress[config.network];
    if (!contractAddress) {
        log('ERROR: Contract address not set. Cannot execute trade.');
        return null;
    }

    try {
        // Build the transaction calldata
        const ABI = [
            'function executeArb(address[] calldata tokens, tuple(address target, bytes data)[] calldata hops, uint256 amount)'
        ];
        const contract = new ethers.Contract(contractAddress, ABI, wallet);

        const tx = await contract.executeArb.populateTransaction(
            tokens,
            hops,
            initialAmount
        );

        // Estimate gas with safety buffer
        try {
            const gasEstimate = await wallet.provider.estimateGas({
                ...tx,
                from: wallet.address,
            });
            tx.gasLimit = (gasEstimate * 130n) / 100n;
        } catch (gasError) {
            log(`Gas estimation failed: ${gasError.message}. Using safe default.`);
            tx.gasLimit = 500000n;
        }

        log('Sending transaction...');
        const txResponse = await sendPrivateTransaction(tx);

        if (txResponse) {
            log(`TX Hash: ${txResponse.hash}`);
            log('Waiting for confirmation...');

            const receipt = await txResponse.wait(1); // Wait for 1 confirmation
            if (receipt && receipt.status === 1) {
                log(`CONFIRMED in block ${receipt.blockNumber}!`);
                log(`Gas used: ${receipt.gasUsed.toString()}`);
                return {
                    success: true,
                    txHash: txResponse.hash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed.toString(),
                };
            } else {
                log('Transaction REVERTED on-chain.');
                return { success: false, txHash: txResponse.hash, reason: 'reverted' };
            }
        }
    } catch (error) {
        log(`Execution error: ${error.message}`);
        return { success: false, reason: error.message };
    }

    return null;
}

/**
 * The main scanning loop.
 */
async function startScanning(paths, tokenDatabase) {
    log(`Starting scanner with ${paths.length} paths...`);
    isRunning = true;

    while (isRunning) {
        scanCount++;
        log(`--- Scan #${scanCount} ---`);

        try {
            const opportunities = await scanAllPaths(paths, tokenDatabase);

            if (opportunities && opportunities.length > 0) {
                // Sort by net profit descending
                opportunities.sort((a, b) => {
                    const profitA = BigInt(a.netProfit?.toString() || '0');
                    const profitB = BigInt(b.netProfit?.toString() || '0');
                    return profitB > profitA ? 1 : profitB < profitA ? -1 : 0;
                });

                log(`Found ${opportunities.length} profitable opportunities. Best: ${opportunities[0].pathDescription}`);

                // Execute the best opportunity
                const result = await handleOpportunity(opportunities[0]);
                if (result?.success) {
                    log(`Trade successful! TX: ${result.txHash}`);
                }
            } else {
                log('No profitable opportunities found this scan.');
            }
        } catch (error) {
            log(`Scan error: ${error.message}`);
        }

        await sleep(SCAN_INTERVAL);
    }
}

/**
 * The main entry point for the bot.
 */
async function main() {
    log('==========================================');
    log('  BaseAlphaBot - AAVE V3 Flash Loan Arb');
    log('  Network: Base Mainnet (Chain ID: 8453)');
    log('==========================================');

    // Check wallet configuration
    if (!config.auth.privateKey || config.auth.privateKey === 'YOUR_WALLET_PRIVATE_KEY_HERE') {
        log('WARNING: No private key configured. Running in SCAN-ONLY mode.');
        log('Set PRIVATE_KEY in .env to enable trade execution.');
    } else {
        log(`Wallet: ${wallet.address}`);
        try {
            const balance = await wallet.provider.getBalance(wallet.address);
            log(`Balance: ${ethers.formatEther(balance)} ETH`);
        } catch (e) {
            log('Could not fetch wallet balance.');
        }
    }

    // Fetch flash loanable assets from Aave V3
    log('Fetching Aave V3 flash loanable assets...');
    config.hubAssets = await getFlashLoanableAssets();
    if (!config.hubAssets || config.hubAssets.length === 0) {
        log('WARNING: No flash loanable assets found. Using common tokens as fallback.');
        config.hubAssets = Object.values(config.commonTokens || {});
    }
    log(`Hub assets: ${config.hubAssets.length}`);

    // Build the token and pair database
    const tokenDbPath = path.join(__dirname, '../config/tokenDatabase.json');
    let tokenDatabase;
    try {
        const dbData = await fs.readFile(tokenDbPath, 'utf-8');
        tokenDatabase = JSON.parse(dbData);
        log(`Token database loaded: ${Object.keys(tokenDatabase).length} tokens`);
    } catch (error) {
        log('Building token database from DexScreener...');
        const dexIds = ['aerodrome', 'uniswap', 'pancakeswap'];
        tokenDatabase = await fetchAllPairs(dexIds);
        if (tokenDatabase && Object.keys(tokenDatabase).length > 0) {
            await fs.writeFile(tokenDbPath, JSON.stringify(tokenDatabase, null, 2));
            log(`Token database saved: ${Object.keys(tokenDatabase).length} tokens`);
        } else {
            log('ERROR: Failed to build token database.');
            return;
        }
    }

    // Generate and cache arbitrage paths
    const pathsPath = path.join(__dirname, '../config/paths.json');
    let needsUpdate = true;
    try {
        const stats = await fs.stat(pathsPath);
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (stats.mtime.getTime() > oneDayAgo) {
            needsUpdate = false;
        }
    } catch (error) {
        // File doesn't exist
    }

    if (needsUpdate) {
        log('Generating arbitrage paths...');
        await generateAndCachePaths(config, tokenDatabase);
    } else {
        log('Arbitrage paths are up to date.');
    }

    // Load the generated paths
    let paths;
    try {
        const pathsData = await fs.readFile(pathsPath, 'utf-8');
        paths = JSON.parse(pathsData);
    } catch (error) {
        log('ERROR: Could not load arbitrage paths.');
        return;
    }

    log(`Loaded ${paths.length} arbitrage paths.`);

    // Contract address check
    if (!config.contractAddress[config.network]) {
        log('WARNING: Contract not deployed. Deploy with: npx hardhat run scripts/deploy.js --network base');
    }

    // Graceful shutdown
    const shutdown = () => {
        log('Shutting down gracefully...');
        isRunning = false;
        process.exit();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start the scanning loop
    try {
        await startScanning(paths, tokenDatabase);
    } catch (error) {
        log(`Fatal error: ${error.message}`);
        log('Restarting in 10 seconds...');
        await sleep(10000);
        main();
    }
}

main();
