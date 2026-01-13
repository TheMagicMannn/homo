const RateLimiter = require("./rateLimiter");

// The RPC load balancing is now handled by ethers.FallbackProvider in src/provider.js.
// We keep the rate limiter here for general use.
const rpcRateLimiter = new RateLimiter(10, 1000); // General rate limit: 10 requests per second

module.exports = {
    rpcRateLimiter
};
