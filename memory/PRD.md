# FlashBot - AAVE V3 Flash Loan Arbitrage Bot PRD

## Original Problem Statement
Fix the arbitrage bot using AAVE V3 flash loans with DeFi arbitrage strategies to be a fully functional mainnet production version bot on Base chain.

## Architecture
- **Bot Engine**: Node.js (ethers.js v6) in `/app/src/`
- **Smart Contract**: Solidity 0.8.24 (BaseAlphaArb.sol) - Aave V3 FlashLoanSimpleReceiverBase
- **Dashboard Backend**: Python FastAPI on port 8001
- **Dashboard Frontend**: React + Tailwind CSS on port 3000
- **Database**: MongoDB
- **Target Network**: Base Mainnet (Chain ID: 8453)

## Configured DEXes (Full Pipeline)

| DEX | Type | Contract Type | Router Address |
|-----|------|--------------|----------------|
| Uniswap V2 | V2 AMM | DEX_UNISWAP_V2 (4) | 0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24 |
| Uniswap V3 | V3 CL | DEX_UNISWAP_V3 (1) | 0x2626664c2603336E57B271c5C0b26F421741e481 |
| PancakeSwap V3 | V3 CL | DEX_PANCAKESWAP_V3 (3) | 0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86 |
| Aerodrome | Velo V2 | DEX_AERODROME (2) | 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43 |
| SushiSwap V3 | RouteProcessor4 | DEX_GENERIC (0) | 0x709421b58bdcb399c82ef748d76861dc476b7fc7 |
| BaseSwap | V2 AMM | DEX_UNISWAP_V2 (4) | 0x327Df1E6de05895d2ab08513aaDD9313Fe505d86 |
| Odos | Aggregator | DEX_GENERIC (0) | 0x19cEeAd7105607Cd444F5ad10dd51356436095a1 |

## Smart Contract Features
- Typed DEX interfaces: _swapUniswapV2(), _swapUniswapV3(), _swapAerodrome(), _swapPancakeSwapV3(), _swapGeneric()
- SafeERC20, router whitelisting, per-hop balance checks, per-hop slippage protection
- Path connectivity + circular path validation
- WETH wrap/unwrap, profit withdrawal
- 13 Hardhat tests (including 4-hop multi-DEX: UniV2 -> UniV3 -> Aero -> Odos)

## Flashblocks Integration
- 200ms preconfirmations (free, protocol-level)
- Event-driven scanning on each sub-block
- Set FLASHBLOCKS_WS_URL in .env to enable

## What's Been Implemented
- Feb 17, 2026: Complete bot rewrite with all 7 DEXes configured end-to-end
- Pair/pool fetching from DexScreener for all DEXes
- Path generation with multi-hop across all DEX pairs
- Opportunity scanning queries ALL DEXes in parallel
- Smart contract executes atomic multi-DEX swaps in single transactions
- Monitoring dashboard with adjustable settings

## Prioritized Backlog
### P0 - Deploy to mainnet
### P1 - Telegram alerts, WebSocket dashboard, multi-asset flash loans
### P2 - Mempool monitoring, historical charting, backtesting
