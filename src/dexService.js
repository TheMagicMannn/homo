const { ethers } = require('ethers');
const config = require('./config');
const { log, withErrorHandling } = require('./utils');
const provider = require('./provider');

// ============================================================
// DEX Type Constants (must match smart contract)
// ============================================================
const DEX_GENERIC = 0;
const DEX_UNISWAP_V3 = 1;
const DEX_AERODROME = 2;
const DEX_PANCAKESWAP_V3 = 3;
const DEX_UNISWAP_V2 = 4;

// ============================================================
// BASE CHAIN DEX ADDRESSES (Verified on Basescan)
// ============================================================

// Uniswap V2 on Base (official deployment)
const UNISWAP_V2_ROUTER = config.dexAddresses?.uniswapV2?.router || '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24';

// Uniswap V3 on Base
const UNISWAP_V3_QUOTER_V2 = config.dexAddresses?.uniswapV3?.quoterV2 || '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const UNISWAP_V3_SWAP_ROUTER_02 = config.dexAddresses?.uniswapV3?.swapRouter02 || '0x2626664c2603336E57B271c5C0b26F421741e481';

// Aerodrome on Base (Velodrome V2 fork)
const AERODROME_ROUTER = config.dexAddresses?.aerodrome?.router || '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43';
const AERODROME_DEFAULT_FACTORY = config.dexAddresses?.aerodrome?.defaultFactory || '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';

// PancakeSwap V3 on Base
const PANCAKESWAP_V3_SMART_ROUTER = config.dexAddresses?.pancakeswapV3?.smartRouter || '0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86';
const PANCAKESWAP_V3_QUOTER_V2 = config.dexAddresses?.pancakeswapV3?.quoterV2 || '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';

// SushiSwap V3 on Base (RouteProcessor4 - aggregator-style)
const SUSHISWAP_ROUTE_PROCESSOR = config.dexAddresses?.sushiswapV3?.routeProcessor4 || '0x709421b58bdcb399c82ef748d76861dc476b7fc7';

// BaseSwap on Base (Uniswap V2 fork)
const BASESWAP_ROUTER = config.dexAddresses?.baseswap?.router || '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86';

// ============================================================
// ABIs
// ============================================================

const V2_ROUTER_ABI = [
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
];

const V3_QUOTER_V2_ABI = [
    'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const AERODROME_ROUTER_ABI = [
    'function getAmountsOut(uint256 amountIn, tuple(address from, address to, bool stable, address factory)[] routes) external view returns (uint256[] memory amounts)',
];

// ============================================================
// Contract Instances
// ============================================================
const uniswapV2Router = new ethers.Contract(UNISWAP_V2_ROUTER, V2_ROUTER_ABI, provider);
const uniswapV3Quoter = new ethers.Contract(UNISWAP_V3_QUOTER_V2, V3_QUOTER_V2_ABI, provider);
const aerodromeRouter = new ethers.Contract(AERODROME_ROUTER, AERODROME_ROUTER_ABI, provider);
const pancakeswapV3Quoter = new ethers.Contract(PANCAKESWAP_V3_QUOTER_V2, V3_QUOTER_V2_ABI, provider);
const baseswapRouter = new ethers.Contract(BASESWAP_ROUTER, V2_ROUTER_ABI, provider);


// ============================================================
// UNISWAP V2 QUOTING (Standard V2 AMM)
// ============================================================
async function getUniswapV2Quote(tokenIn, tokenOut, amountIn) {
    try {
        const amounts = await uniswapV2Router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
        const amountOut = amounts[amounts.length - 1];
        if (amountOut > 0n) {
            return {
                dex: 'uniswapV2',
                dexType: DEX_UNISWAP_V2,
                router: UNISWAP_V2_ROUTER,
                toTokenAmount: amountOut.toString(),
            };
        }
    } catch (error) {
        // No pool exists for this pair
    }
    return null;
}


// ============================================================
// UNISWAP V3 QUOTING (QuoterV2 - all fee tiers)
// ============================================================
async function getUniswapV3Quote(tokenIn, tokenOut, amountIn) {
    const fees = [100, 500, 3000, 10000];
    let bestQuote = 0n;
    let bestFee = 0;

    for (const fee of fees) {
        try {
            const result = await uniswapV3Quoter.quoteExactInputSingle.staticCall({
                tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0
            });
            const amountOut = result.amountOut || result[0];
            if (amountOut > bestQuote) {
                bestQuote = amountOut;
                bestFee = fee;
            }
        } catch (error) { /* Pool doesn't exist for this fee tier */ }
    }

    if (bestQuote > 0n) {
        return {
            dex: 'uniswapV3',
            dexType: DEX_UNISWAP_V3,
            router: UNISWAP_V3_SWAP_ROUTER_02,
            toTokenAmount: bestQuote.toString(),
            fee: bestFee,
        };
    }
    return null;
}


// ============================================================
// AERODROME QUOTING (Route struct - volatile & stable pools)
// ============================================================
async function getAerodromeQuote(tokenIn, tokenOut, amountIn) {
    const poolTypes = [false, true]; // volatile, stable
    let bestQuote = 0n;
    let bestStable = false;

    for (const stable of poolTypes) {
        try {
            const routes = [{ from: tokenIn, to: tokenOut, stable, factory: AERODROME_DEFAULT_FACTORY }];
            const amounts = await aerodromeRouter.getAmountsOut(amountIn, routes);
            const amountOut = amounts[amounts.length - 1];
            if (amountOut > bestQuote) {
                bestQuote = amountOut;
                bestStable = stable;
            }
        } catch (error) { /* Pool doesn't exist */ }
    }

    if (bestQuote > 0n) {
        return {
            dex: 'aerodrome',
            dexType: DEX_AERODROME,
            router: AERODROME_ROUTER,
            toTokenAmount: bestQuote.toString(),
            stable: bestStable,
        };
    }
    return null;
}


// ============================================================
// PANCAKESWAP V3 QUOTING (QuoterV2 - all fee tiers)
// ============================================================
async function getPancakeSwapV3Quote(tokenIn, tokenOut, amountIn) {
    const fees = [100, 500, 2500, 10000]; // PCS uses 0.25% instead of 0.3%
    let bestQuote = 0n;
    let bestFee = 0;

    for (const fee of fees) {
        try {
            const result = await pancakeswapV3Quoter.quoteExactInputSingle.staticCall({
                tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0
            });
            const amountOut = result.amountOut || result[0];
            if (amountOut > bestQuote) {
                bestQuote = amountOut;
                bestFee = fee;
            }
        } catch (error) { /* Pool doesn't exist */ }
    }

    if (bestQuote > 0n) {
        return {
            dex: 'pancakeswapV3',
            dexType: DEX_PANCAKESWAP_V3,
            router: PANCAKESWAP_V3_SMART_ROUTER,
            toTokenAmount: bestQuote.toString(),
            fee: bestFee,
        };
    }
    return null;
}


// ============================================================
// BASESWAP QUOTING (Uniswap V2 fork - standard V2 interface)
// ============================================================
async function getBaseSwapQuote(tokenIn, tokenOut, amountIn) {
    try {
        const amounts = await baseswapRouter.getAmountsOut(amountIn, [tokenIn, tokenOut]);
        const amountOut = amounts[amounts.length - 1];
        if (amountOut > 0n) {
            return {
                dex: 'baseswap',
                dexType: DEX_UNISWAP_V2, // Same interface as Uniswap V2
                router: BASESWAP_ROUTER,
                toTokenAmount: amountOut.toString(),
            };
        }
    } catch (error) { /* No pool */ }
    return null;
}


// ============================================================
// EXPORT ALL QUOTERS
// ============================================================
module.exports = {
    // Quoting functions
    getUniswapV2Quote: withErrorHandling(getUniswapV2Quote),
    getUniswapV3Quote: withErrorHandling(getUniswapV3Quote),
    getAerodromeQuote: withErrorHandling(getAerodromeQuote),
    getPancakeSwapV3Quote: withErrorHandling(getPancakeSwapV3Quote),
    getBaseSwapQuote: withErrorHandling(getBaseSwapQuote),

    // DEX type constants
    DEX_GENERIC,
    DEX_UNISWAP_V3,
    DEX_AERODROME,
    DEX_PANCAKESWAP_V3,
    DEX_UNISWAP_V2,

    // Router addresses (for opportunity scanner swap step building)
    UNISWAP_V2_ROUTER,
    UNISWAP_V3_SWAP_ROUTER_02,
    AERODROME_ROUTER,
    AERODROME_DEFAULT_FACTORY,
    PANCAKESWAP_V3_SMART_ROUTER,
    SUSHISWAP_ROUTE_PROCESSOR,
    BASESWAP_ROUTER,
};
