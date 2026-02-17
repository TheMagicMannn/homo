// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IAerodromeRouter.sol";

/**
 * @title MockAerodromeRouter
 * @notice Mock implementation of Aerodrome Router for testing typed swap execution with Route struct
 */
contract MockAerodromeRouter {
    // Preset exchange rates
    mapping(address => mapping(address => uint256)) public presetAmounts;

    function setPresetAmount(address tokenIn, address tokenOut, uint256 amountOut) external {
        presetAmounts[tokenIn][tokenOut] = amountOut;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        IAerodromeRouter.Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(routes.length == 1, "Mock only supports single route");
        require(deadline >= block.timestamp, "Expired");

        address tokenIn = routes[0].from;
        address tokenOut = routes[0].to;

        uint256 amountOut = presetAmounts[tokenIn][tokenOut];
        require(amountOut > 0, "No preset amount");
        require(amountOut >= amountOutMin, "Insufficient output");

        // Pull input tokens
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        // Send output tokens
        IERC20(tokenOut).transfer(to, amountOut);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
        return amounts;
    }

    function getAmountsOut(
        uint256 amountIn,
        IAerodromeRouter.Route[] calldata routes
    ) external view returns (uint256[] memory amounts) {
        require(routes.length == 1, "Mock only supports single route");
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = presetAmounts[routes[0].from][routes[0].to];
        return amounts;
    }
}
