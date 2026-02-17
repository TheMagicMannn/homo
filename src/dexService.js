const { ethers } = require('ethers');
const config = require('./config');
const { log, withErrorHandling } = require('./utils');
const provider = require('./provider');

// ============================================================
// BASE CHAIN DEX ADDRESSES (Verified on Basescan)
// ============================================================

// Uniswap V3 on Base
const UNISWAP_V3_QUOTER_V2 = config.dexAddresses?.uniswapV3?.quoterV2 || "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const UNISWAP_V3_SWAP_ROUTER_02 = config.dexAddresses?.uniswapV3?.swapRouter02 || "0x2626664c2603336E57B271c5C0b26F421741e481";

// Aerodrome on Base (Velodrome V2 fork - uses Route struct)
const AERODROME_ROUTER = config.dexAddresses?.aerodrome?.router || "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const AERODROME_DEFAULT_FACTORY = config.dexAddresses?.aerodrome?.defaultFactory || "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

// PancakeSwap V3 on Base
const PANCAKESWAP_V3_SMART_ROUTER = config.dexAddresses?.pancakeswapV3?.smartRouter || "0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86";

// ============================================================
// UNISWAP V3 - Using QuoterV2 (correct Base chain contract)
// ============================================================

const UNISWAP_V3_QUOTER_V2_ABI = [
    "function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
];

const UNISWAP_V3_ROUTER_ABI = [
    "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
];

const uniswapV3Quoter = new ethers.Contract(UNISWAP_V3_QUOTER_V2, UNISWAP_V3_QUOTER_V2_ABI, provider);
const uniswapV3Router = new ethers.Contract(UNISWAP_V3_SWAP_ROUTER_02, UNISWAP_V3_ROUTER_ABI, provider);

async function getUniswapQuote(tokenIn, tokenOut, amountIn) {
    const fees = [100, 500, 3000, 10000]; // All V3 fee tiers (0.01%, 0.05%, 0.3%, 1%)
    let bestQuote = 0n;
    let bestFee = 0;

    for (const fee of fees) {
        try {
            // QuoterV2 uses staticCall since the function modifies state then reverts
            const result = await uniswapV3Quoter.quoteExactInputSingle.staticCall({
                tokenIn,
                tokenOut,
                amountIn,
                fee,
                sqrtPriceLimitX96: 0
            });
            const amountOut = result.amountOut || result[0];
            if (amountOut > bestQuote) {
                bestQuote = amountOut;
                bestFee = fee;
            }
        } catch (error) {
            // Pool doesn't exist for this fee tier, skip
        }
    }

    if (bestQuote > 0n) {
        return {
            dex: 'uniswap',
            toTokenAmount: bestQuote.toString(),
            fee: bestFee,
        };
    }
    return null;
}

async function getUniswapSwapData(tokenIn, tokenOut, amountIn, amountOutMinimum, fee) {
    const contractAddr = config.contractAddress[config.network];
    if (!contractAddr) {
        log('Contract address not set. Cannot generate swap data.');
        return null;
    }

    const params = {
        tokenIn,
        tokenOut,
        fee,
        recipient: contractAddr,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0,
    };

    try {
        const iface = new ethers.Interface(UNISWAP_V3_ROUTER_ABI);
        const data = iface.encodeFunctionData('exactInputSingle', [params]);
        return {
            to: UNISWAP_V3_SWAP_ROUTER_02,
            data: data,
        };
    } catch (error) {
        log(`Failed to encode Uniswap swap data: ${error.message}`);
        return null;
    }
}


// ============================================================
// AERODROME - Uses Route struct (Velodrome V2 fork on Base)
// ============================================================

const AERODROME_ROUTER_ABI = [
    "function getAmountsOut(uint256 amountIn, tuple(address from, address to, bool stable, address factory)[] routes) external view returns (uint256[] memory amounts)",
    "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, tuple(address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline) external returns (uint256[] memory amounts)"
];

const aerodromeRouter = new ethers.Contract(AERODROME_ROUTER, AERODROME_ROUTER_ABI, provider);

async function getAerodromeQuote(tokenIn, tokenOut, amountIn) {
    // Try both stable and volatile pools
    const poolTypes = [false, true]; // volatile first, then stable
    let bestQuote = 0n;
    let bestStable = false;

    for (const stable of poolTypes) {
        try {
            const routes = [{
                from: tokenIn,
                to: tokenOut,
                stable: stable,
                factory: AERODROME_DEFAULT_FACTORY
            }];
            const amounts = await aerodromeRouter.getAmountsOut(amountIn, routes);
            const amountOut = amounts[amounts.length - 1];
            if (amountOut > bestQuote) {
                bestQuote = amountOut;
                bestStable = stable;
            }
        } catch (error) {
            // Pool doesn't exist for this type
        }
    }

    if (bestQuote > 0n) {
        return {
            dex: 'aerodrome',
            toTokenAmount: bestQuote.toString(),
            stable: bestStable,
        };
    }
    return null;
}

async function getAerodromeSwapData(tokenIn, tokenOut, amountIn, amountOutMinimum, stable) {
    const contractAddr = config.contractAddress[config.network];
    if (!contractAddr) {
        log('Contract address not set. Cannot generate swap data.');
        return null;
    }

    const routes = [{
        from: tokenIn,
        to: tokenOut,
        stable: stable || false,
        factory: AERODROME_DEFAULT_FACTORY
    }];

    const deadline = Math.floor(Date.now() / 1000) + 60 * 5; // 5 minutes

    try {
        const iface = new ethers.Interface(AERODROME_ROUTER_ABI);
        const data = iface.encodeFunctionData('swapExactTokensForTokens', [
            amountIn,
            amountOutMinimum,
            routes,
            contractAddr,
            deadline
        ]);
        return {
            to: AERODROME_ROUTER,
            data: data,
        };
    } catch (error) {
        log(`Failed to encode Aerodrome swap data: ${error.message}`);
        return null;
    }
}


// ============================================================
// PANCAKESWAP V3 - Using SmartRouter on Base
// ============================================================

const PANCAKESWAP_V3_ROUTER_ABI = [
    "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
];

// For PancakeSwap quoting on Base, we use Odos aggregator as the quoter
// since PCS QuoterV2 on Base is not reliably documented
async function getPancakeSwapQuote(tokenIn, tokenOut, amountIn) {
    // PancakeSwap V3 uses same fee tiers as Uniswap V3
    // But since we can't reliably quote on-chain without confirmed QuoterV2,
    // this function is kept as a fallback. Odos aggregator covers PCS pools.
    return null;
}

async function getPancakeSwapSwapData(tokenIn, tokenOut, amountIn, amountOutMinimum, fee) {
    const contractAddr = config.contractAddress[config.network];
    if (!contractAddr) return null;

    const params = {
        tokenIn,
        tokenOut,
        fee: fee || 2500,
        recipient: contractAddr,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0,
    };

    try {
        const iface = new ethers.Interface(PANCAKESWAP_V3_ROUTER_ABI);
        const data = iface.encodeFunctionData('exactInputSingle', [params]);
        return {
            to: PANCAKESWAP_V3_SMART_ROUTER,
            data: data,
        };
    } catch (error) {
        log(`Failed to encode PancakeSwap swap data: ${error.message}`);
        return null;
    }
}


module.exports = {
    getUniswapQuote: withErrorHandling(getUniswapQuote),
    getAerodromeQuote: withErrorHandling(getAerodromeQuote),
    getPancakeSwapQuote: withErrorHandling(getPancakeSwapQuote),
    getUniswapSwapData: withErrorHandling(getUniswapSwapData),
    getAerodromeSwapData: withErrorHandling(getAerodromeSwapData),
    getPancakeSwapSwapData: withErrorHandling(getPancakeSwapSwapData),
};
