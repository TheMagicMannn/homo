// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ISwapRouter02.sol";

/**
 * @title MockUniswapV3Router
 * @notice Mock implementation of Uniswap V3 SwapRouter02 for testing typed swap execution
 */
contract MockUniswapV3Router {
    // Preset exchange rate: amountOut per swap (set by test)
    mapping(address => mapping(address => uint256)) public presetAmounts;

    function setPresetAmount(address tokenIn, address tokenOut, uint256 amountOut) external {
        presetAmounts[tokenIn][tokenOut] = amountOut;
    }

    function exactInputSingle(
        ISwapRouter02.ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut) {
        amountOut = presetAmounts[params.tokenIn][params.tokenOut];
        require(amountOut > 0, "No preset amount");
        require(amountOut >= params.amountOutMinimum, "Too little received");

        // Pull input tokens
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        // Send output tokens
        IERC20(params.tokenOut).transfer(params.recipient, amountOut);

        return amountOut;
    }
}
