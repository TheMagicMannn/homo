// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISwapRouter02 - Uniswap V3 / PancakeSwap V3 SwapRouter interface
/// @notice Used for exactInputSingle swaps on V3-style AMMs on Base chain
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swaps `amountIn` of one token for as much as possible of another token
    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);
}
