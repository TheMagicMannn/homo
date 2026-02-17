const fs = require('fs/promises');
const path = require('path');
const { log, withErrorHandling } = require('./utils');

class PathGenerator {
    constructor(tokenDatabase, flashLoanAssets) {
        this.tokenDatabase = tokenDatabase;
        // Normalize addresses to lowercase
        this.flashLoanAssets = (flashLoanAssets || []).map(a => a.toLowerCase());
        this.graph = this.buildGraph();
    }

    /**
     * Builds a graph representation from the token database.
     */
    buildGraph() {
        const graph = new Map();
        for (const [tokenAddress, tokenData] of Object.entries(this.tokenDatabase)) {
            const addr = tokenAddress.toLowerCase();
            const neighbors = new Map();
            for (const [pairAddress, pairData] of Object.entries(tokenData.pairs || {})) {
                const pairAddr = pairAddress.toLowerCase();
                if (this.tokenDatabase[pairAddr] || this.tokenDatabase[pairAddress]) {
                    neighbors.set(pairAddr, pairData.dex);
                }
            }
            if (neighbors.size > 0) {
                graph.set(addr, neighbors);
            }
        }
        log(`Built trading graph with ${graph.size} nodes.`);
        return graph;
    }

    /**
     * Finds all circular paths from 2 to 4 hops.
     * Limited to 4 hops for production efficiency (more hops = more gas + slippage).
     */
    generatePaths() {
        const allPaths = [];
        log('Starting path generation...');

        const maxPaths = 5000; // Cap total paths for performance

        for (const startNode of this.flashLoanAssets) {
            if (!this.graph.has(startNode)) continue;
            if (allPaths.length >= maxPaths) break;
            this.findCircularPaths(startNode, [startNode], new Set([startNode]), allPaths, maxPaths);
        }

        log(`Generated ${allPaths.length} potential arbitrage paths.`);
        return this.sortPathsByLiquidity(allPaths).slice(0, 2000); // Keep top 2000
    }

    /**
     * Recursive DFS to find circular paths.
     */
    findCircularPaths(startNode, currentPath, visited, allPaths, maxPaths) {
        const minHops = 2;
        const maxHops = 4; // Reduced from 6 for production (gas efficiency)

        if (currentPath.length > maxHops || allPaths.length >= maxPaths) return;

        const lastNode = currentPath[currentPath.length - 1];
        const neighbors = this.graph.get(lastNode);
        if (!neighbors) return;

        for (const [neighbor, dex] of neighbors.entries()) {
            if (allPaths.length >= maxPaths) return;

            if (neighbor === startNode && currentPath.length >= minHops) {
                const finalPath = [...currentPath, neighbor];
                allPaths.push(this.formatPath(finalPath));
            } else if (!visited.has(neighbor) && currentPath.length < maxHops) {
                visited.add(neighbor);
                this.findCircularPaths(startNode, [...currentPath, neighbor], visited, allPaths, maxPaths);
                visited.delete(neighbor);
            }
        }
    }

    /**
     * Formats a path to include the DEX for each hop.
     */
    formatPath(pathNodes) {
        const formattedPath = [];
        for (let i = 0; i < pathNodes.length - 1; i++) {
            const fromToken = pathNodes[i];
            const toToken = pathNodes[i + 1];
            const dex = this.graph.get(fromToken)?.get(toToken) || 'unknown';
            formattedPath.push({ from: fromToken, to: toToken, dex });
        }
        return formattedPath;
    }

    /**
     * Sorts paths based on the minimum liquidity of any token in the path.
     */
    sortPathsByLiquidity(paths) {
        const getPathLiquidity = (pathHops) => {
            let minLiquidity = Infinity;
            const uniqueTokens = new Set(pathHops.flatMap(hop => [hop.from, hop.to]));
            for (const tokenAddress of uniqueTokens) {
                const tokenData = this.tokenDatabase[tokenAddress] || this.tokenDatabase[tokenAddress.toLowerCase()];
                if (tokenData && tokenData.liquidity < minLiquidity) {
                    minLiquidity = tokenData.liquidity;
                }
            }
            return minLiquidity === Infinity ? 0 : minLiquidity;
        };
        return paths.sort((a, b) => getPathLiquidity(b) - getPathLiquidity(a));
    }
}

async function generateAndCachePaths(config, tokenDatabase) {
    const pathsPath = path.join(__dirname, '../config/paths.json');

    try {
        const pathGenerator = new PathGenerator(tokenDatabase, config.hubAssets);
        const paths = pathGenerator.generatePaths();

        await fs.writeFile(pathsPath, JSON.stringify(paths, null, 2));
        log(`Saved ${paths.length} paths to ${pathsPath}`);
        return paths;
    } catch (error) {
        log(`Error generating paths: ${error.message}`);
        return [];
    }
}

module.exports = {
    generateAndCachePaths: withErrorHandling(generateAndCachePaths),
    PathGenerator,
};
