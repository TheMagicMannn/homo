// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IUniswapV2Router02 - Standard V2 AMM Router interface
/// @notice Used for Uniswap V2, BaseSwap, and other V2 forks on Base chain
interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(
        uint amountIn,
        address[] calldata path
    ) external view returns (uint[] memory amounts);

    function factory() external pure returns (address);
    function WETH() external pure returns (address);
}
