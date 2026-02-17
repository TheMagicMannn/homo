// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAerodromeRouter - Aerodrome Finance (Velodrome V2 fork) Router interface
/// @notice Uses Route struct for swap paths on Base chain
interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    /// @notice Swap exact tokens along the specified route
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    /// @notice Get output amounts for a set of routes
    function getAmountsOut(
        uint256 amountIn,
        Route[] calldata routes
    ) external view returns (uint256[] memory amounts);
}
