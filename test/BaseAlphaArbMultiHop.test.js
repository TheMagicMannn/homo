const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("BaseAlphaArb Multi-DEX Multi-Hop", function () {
    const DEX_GENERIC = 0;
    const DEX_UNISWAP_V3 = 1;
    const DEX_AERODROME = 2;
    const DEX_UNISWAP_V2 = 4;

    async function deployFixture() {
        const [owner] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
        const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
        const dai = await MockERC20.deploy("Dai Stablecoin", "DAI", 18);
        const aero = await MockERC20.deploy("Aerodrome", "AERO", 18);

        const MockAavePool = await ethers.getContractFactory("MockAavePool");
        const aavePool = await MockAavePool.deploy();
        const MockPoolAddressesProvider = await ethers.getContractFactory("MockPoolAddressesProvider");
        const aaveProvider = await MockPoolAddressesProvider.deploy(aavePool.target);
        await aavePool.setAddressesProvider(aaveProvider.target);

        const BaseAlphaArb = await ethers.getContractFactory("BaseAlphaArb");
        const baseAlphaArb = await BaseAlphaArb.deploy(aaveProvider.target, weth.target);

        const MockAggregator = await ethers.getContractFactory("MockAggregator");
        const mockAggregator = await MockAggregator.deploy();

        const MockUniswapV3Router = await ethers.getContractFactory("MockUniswapV3Router");
        const mockUniV3Router = await MockUniswapV3Router.deploy();

        const MockAerodromeRouter = await ethers.getContractFactory("MockAerodromeRouter");
        const mockAeroRouter = await MockAerodromeRouter.deploy();

        const MockUniswapV2Router = await ethers.getContractFactory("MockUniswapV2Router");
        const mockV2Router = await MockUniswapV2Router.deploy();

        // Whitelist ALL routers
        await baseAlphaArb.setRouterWhitelistBatch(
            [mockAggregator.target, mockUniV3Router.target, mockAeroRouter.target, mockV2Router.target],
            true
        );

        return {
            baseAlphaArb, owner,
            usdc, weth, dai, aero,
            aavePool, mockAggregator, mockUniV3Router, mockAeroRouter, mockV2Router
        };
    }

    // ================================================================
    //  TEST: 3-hop multi-DEX (UniV3 -> Aerodrome -> Generic/Odos)
    //  USDC -[UniV3]-> WETH -[Aero]-> DAI -[Odos]-> USDC
    // ================================================================
    it("Should execute 3-hop arb: UniV3 -> Aerodrome -> Odos (Generic)", async function () {
        const { baseAlphaArb, usdc, weth, dai, aavePool, mockAggregator, mockUniV3Router, mockAeroRouter } = await loadFixture(deployFixture);

        const loanAmount = ethers.parseUnits("10000", 6);
        const profit = ethers.parseUnits("120", 6);
        const wethAmount = ethers.parseUnits("5", 18);
        const daiAmount = ethers.parseUnits("10000", 18);
        const premium = (loanAmount * 9n) / 10000n;

        await usdc.mint(aavePool.target, loanAmount + premium);
        await weth.mint(mockUniV3Router.target, wethAmount);
        await dai.mint(mockAeroRouter.target, daiAmount);
        await usdc.mint(mockAggregator.target, loanAmount + profit + premium);

        await mockUniV3Router.setPresetAmount(usdc.target, weth.target, wethAmount);
        await mockAeroRouter.setPresetAmount(weth.target, dai.target, daiAmount);

        const genericHopData = mockAggregator.interface.encodeFunctionData("swap", [
            dai.target, usdc.target, daiAmount, loanAmount + profit + premium
        ]);

        const aeroFactory = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

        const steps = [
            { dexType: DEX_UNISWAP_V3, router: mockUniV3Router.target, tokenIn: usdc.target, tokenOut: weth.target, fee: 3000, stable: false, factory: ethers.ZeroAddress, amountOutMin: wethAmount, data: "0x" },
            { dexType: DEX_AERODROME, router: mockAeroRouter.target, tokenIn: weth.target, tokenOut: dai.target, fee: 0, stable: false, factory: aeroFactory, amountOutMin: daiAmount, data: "0x" },
            { dexType: DEX_GENERIC, router: mockAggregator.target, tokenIn: dai.target, tokenOut: usdc.target, fee: 0, stable: false, factory: ethers.ZeroAddress, amountOutMin: loanAmount + profit, data: genericHopData },
        ];

        const tx = await baseAlphaArb.executeArb(usdc.target, loanAmount, steps);
        const receipt = await tx.wait();

        expect(await usdc.balanceOf(baseAlphaArb.target)).to.equal(profit);

        // Verify 3 SwapExecuted events
        const swapEvents = receipt.logs.filter(log => {
            try { return baseAlphaArb.interface.parseLog(log)?.name === "SwapExecuted"; } catch { return false; }
        });
        expect(swapEvents.length).to.equal(3);
    });

    // ================================================================
    //  TEST: 4-hop multi-DEX (UniV2 -> UniV3 -> Aerodrome -> Generic)
    //  USDC -[UniV2]-> WETH -[UniV3]-> DAI -[Aero]-> AERO -[Odos]-> USDC
    // ================================================================
    it("Should execute 4-hop arb: UniV2 -> UniV3 -> Aerodrome -> Odos", async function () {
        const { baseAlphaArb, usdc, weth, dai, aero, aavePool, mockAggregator, mockUniV3Router, mockAeroRouter, mockV2Router } = await loadFixture(deployFixture);

        const loanAmount = ethers.parseUnits("5000", 6);
        const profit = ethers.parseUnits("50", 6);
        const wethAmount = ethers.parseUnits("2", 18);
        const daiAmount = ethers.parseUnits("5000", 18);
        const aeroAmount = ethers.parseUnits("1000", 18);
        const premium = (loanAmount * 9n) / 10000n;

        // Fund each DEX mock with the tokens it needs to output
        await usdc.mint(aavePool.target, loanAmount + premium);
        await weth.mint(mockV2Router.target, wethAmount);          // UniV2 outputs WETH
        await dai.mint(mockUniV3Router.target, daiAmount);         // UniV3 outputs DAI
        await aero.mint(mockAeroRouter.target, aeroAmount);        // Aerodrome outputs AERO
        await usdc.mint(mockAggregator.target, loanAmount + profit + premium); // Odos outputs USDC

        // Set exchange rates
        await mockV2Router.setPresetAmount(usdc.target, weth.target, wethAmount);
        await mockUniV3Router.setPresetAmount(weth.target, dai.target, daiAmount);
        await mockAeroRouter.setPresetAmount(dai.target, aero.target, aeroAmount);

        const genericHopData = mockAggregator.interface.encodeFunctionData("swap", [
            aero.target, usdc.target, aeroAmount, loanAmount + profit + premium
        ]);

        const aeroFactory = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

        const steps = [
            { dexType: DEX_UNISWAP_V2, router: mockV2Router.target, tokenIn: usdc.target, tokenOut: weth.target, fee: 0, stable: false, factory: ethers.ZeroAddress, amountOutMin: wethAmount, data: "0x" },
            { dexType: DEX_UNISWAP_V3, router: mockUniV3Router.target, tokenIn: weth.target, tokenOut: dai.target, fee: 500, stable: false, factory: ethers.ZeroAddress, amountOutMin: daiAmount, data: "0x" },
            { dexType: DEX_AERODROME, router: mockAeroRouter.target, tokenIn: dai.target, tokenOut: aero.target, fee: 0, stable: false, factory: aeroFactory, amountOutMin: aeroAmount, data: "0x" },
            { dexType: DEX_GENERIC, router: mockAggregator.target, tokenIn: aero.target, tokenOut: usdc.target, fee: 0, stable: false, factory: ethers.ZeroAddress, amountOutMin: loanAmount + profit, data: genericHopData },
        ];

        const tx = await baseAlphaArb.executeArb(usdc.target, loanAmount, steps);
        const receipt = await tx.wait();

        expect(await usdc.balanceOf(baseAlphaArb.target)).to.equal(profit);

        // Verify 4 SwapExecuted events (one per hop)
        const swapEvents = receipt.logs.filter(log => {
            try { return baseAlphaArb.interface.parseLog(log)?.name === "SwapExecuted"; } catch { return false; }
        });
        expect(swapEvents.length).to.equal(4);
    });

    // ================================================================
    //  TEST: 3-hop all typed swaps (UniV3 -> Aero -> UniV3)
    // ================================================================
    it("Should execute 3-hop with all typed DEX swaps", async function () {
        const { baseAlphaArb, usdc, weth, dai, aavePool, mockUniV3Router, mockAeroRouter } = await loadFixture(deployFixture);

        const loanAmount = ethers.parseUnits("5000", 6);
        const profit = ethers.parseUnits("80", 6);
        const wethAmount = ethers.parseUnits("2", 18);
        const daiAmount = ethers.parseUnits("5000", 18);
        const premium = (loanAmount * 9n) / 10000n;

        await usdc.mint(aavePool.target, loanAmount + premium);
        await weth.mint(mockUniV3Router.target, wethAmount);
        await dai.mint(mockAeroRouter.target, daiAmount);
        await usdc.mint(mockUniV3Router.target, loanAmount + profit + premium);

        await mockUniV3Router.setPresetAmount(usdc.target, weth.target, wethAmount);
        await mockAeroRouter.setPresetAmount(weth.target, dai.target, daiAmount);
        await mockUniV3Router.setPresetAmount(dai.target, usdc.target, loanAmount + profit + premium);

        const aeroFactory = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

        const steps = [
            { dexType: DEX_UNISWAP_V3, router: mockUniV3Router.target, tokenIn: usdc.target, tokenOut: weth.target, fee: 500, stable: false, factory: ethers.ZeroAddress, amountOutMin: wethAmount, data: "0x" },
            { dexType: DEX_AERODROME, router: mockAeroRouter.target, tokenIn: weth.target, tokenOut: dai.target, fee: 0, stable: false, factory: aeroFactory, amountOutMin: daiAmount, data: "0x" },
            { dexType: DEX_UNISWAP_V3, router: mockUniV3Router.target, tokenIn: dai.target, tokenOut: usdc.target, fee: 500, stable: false, factory: ethers.ZeroAddress, amountOutMin: loanAmount + profit, data: "0x" },
        ];

        await baseAlphaArb.executeArb(usdc.target, loanAmount, steps);
        expect(await usdc.balanceOf(baseAlphaArb.target)).to.equal(profit);
    });

    // ================================================================
    //  TEST: Flash loan repay fails when not profitable
    // ================================================================
    it("Should revert when final balance cannot repay flash loan", async function () {
        const { baseAlphaArb, usdc, weth, aavePool, mockUniV3Router } = await loadFixture(deployFixture);

        const loanAmount = ethers.parseUnits("10000", 6);
        const lossAmount = ethers.parseUnits("9000", 6);
        const wethAmount = ethers.parseUnits("5", 18);
        const premium = (loanAmount * 9n) / 10000n;

        await usdc.mint(aavePool.target, loanAmount + premium);
        await weth.mint(mockUniV3Router.target, wethAmount);
        await usdc.mint(mockUniV3Router.target, lossAmount);

        await mockUniV3Router.setPresetAmount(usdc.target, weth.target, wethAmount);
        await mockUniV3Router.setPresetAmount(weth.target, usdc.target, lossAmount);

        const steps = [
            { dexType: DEX_UNISWAP_V3, router: mockUniV3Router.target, tokenIn: usdc.target, tokenOut: weth.target, fee: 3000, stable: false, factory: ethers.ZeroAddress, amountOutMin: 0, data: "0x" },
            { dexType: DEX_UNISWAP_V3, router: mockUniV3Router.target, tokenIn: weth.target, tokenOut: usdc.target, fee: 3000, stable: false, factory: ethers.ZeroAddress, amountOutMin: 0, data: "0x" },
        ];

        await expect(baseAlphaArb.executeArb(usdc.target, loanAmount, steps)).to.be.reverted;
    });
});
