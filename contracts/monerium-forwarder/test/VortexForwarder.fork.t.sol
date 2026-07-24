// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {VortexForwarder} from "../src/VortexForwarder.sol";
import {VortexForwarderFactory} from "../src/VortexForwarderFactory.sol";

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

interface IERC20Meta {
    function balanceOf(address) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// Mainnet fork tests against the real tokens, pools, router, and oracle.
/// Skipped when ETH_RPC_URL is not set. Addresses below are build-time pins —
/// re-verify per registry P10/G0 before any deployment.
contract VortexForwarderForkTest is Test {
    // EURe V2 (Monerium, verified via CoinGecko + Etherscan 2026-07-10). V1 is deprecated.
    address constant EURE_V2 = 0x39b8B6385416f4cA36a20319F70D28621895279D;
    address constant EURE_V1_DEPRECATED = 0x3231Cb76718CDeF2155FC47b5286d82e6eDA273f;
    address constant EURC = 0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant SWAP_ROUTER_02 = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address constant UNIV3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    // Chainlink EUR/USD proxy — verify against data.chain.link before deploy (registry P8).
    address constant CHAINLINK_EUR_USD = 0xb49f677943BC038e9857d61E7d053CaA2C1734C1;

    VortexForwarderFactory factory;
    VortexForwarder fwd;

    address attestor = vm.addr(0xA11CE);
    address destination = makeAddr("destination");
    address fallbackAddr = makeAddr("fallbackAddr");
    address keeper = makeAddr("keeper");

    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("ETH_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // tests will self-skip
        vm.createSelectFork(rpc);
        forked = true;

        factory = new VortexForwarderFactory(
            VortexForwarder.ImmutableConfig({
                eure: EURE_V2,
                eurc: EURC,
                usdc: USDC,
                router: SWAP_ROUTER_02,
                oracle: CHAINLINK_EUR_USD,
                attestor: attestor,
                feeRecipient: makeAddr("feeRecipient"),
                maxOracleAge: 26 hours,
                slippageBps: 100,
                maxFeeBps: 100,
                sweepDelay: 60 days,
                triggerDelay: 24 hours,
                poolFeeEureEurc: 500,
                poolFeeEurcUsdc: 500,
                recoveryHash: bytes32(0)
            }),
            1e18,
            50_000e18,
            25e18,
            10_000e18
        );
        factory.setKeeper(keeper, true);
        fwd = VortexForwarder(factory.deployForwarder(destination, fallbackAddr, 0, bytes32(uint256(1))));
    }

    modifier onlyForked() {
        vm.skip(!forked);
        _;
    }

    function test_fork_oracleIsEurUsdWithPlausiblePrice() public onlyForked {
        assertEq(fwd.ORACLE_DECIMALS(), 8, "EUR/USD feed should have 8 decimals");
        (, int256 answer,, uint256 updatedAt,) = fwd.ORACLE().latestRoundData();
        // Plausibility band: a wrong feed address fails loudly here.
        assertGt(answer, 0.8e8, "EUR/USD implausibly low");
        assertLt(answer, 1.6e8, "EUR/USD implausibly high");
        assertGt(updatedAt, 0);
    }

    function test_fork_pinnedPathUsesV2AndPoolsExist() public onlyForked {
        assertEq(address(fwd.EURE()), EURE_V2);
        assertTrue(address(fwd.EURE()) != EURE_V1_DEPRECATED, "route must never touch deprecated V1 EURe");

        // Both hops of the pinned path must exist on-chain with the pinned fee tiers.
        address hop1 = IUniswapV3Factory(UNIV3_FACTORY).getPool(EURE_V2, EURC, fwd.POOL_FEE_EURE_EURC());
        address hop2 = IUniswapV3Factory(UNIV3_FACTORY).getPool(EURC, USDC, fwd.POOL_FEE_EURC_USDC());
        assertTrue(hop1 != address(0), "EURe/EURC pool missing at pinned fee tier");
        assertTrue(hop2 != address(0), "EURC/USDC pool missing at pinned fee tier");
        // The V2 pool must actually hold V2 tokens (stale-pool trap check).
        assertGt(IERC20Meta(EURE_V2).balanceOf(hop1), 0, "pinned hop1 pool holds no V2 EURe");
    }

    function test_fork_swapAndForward_executesWithinOracleBounds() public onlyForked {
        uint256 amountIn = 1_000e18;
        deal(EURE_V2, address(fwd), amountIn); // stdStorage balance override

        (, int256 answer,,,) = fwd.ORACLE().latestRoundData();
        uint256 fair = (amountIn * uint256(answer)) / 1e20; // 6-dec USDC at oracle rate

        vm.prank(keeper);
        fwd.swapAndForward();

        uint256 received = IERC20Meta(USDC).balanceOf(destination);
        assertGe(received, (fair * 9_900) / 10_000, "below oracle-bounded minOut");
        assertLe(received, (fair * 10_300) / 10_000, "implausibly above oracle rate");
        assertEq(IERC20Meta(EURE_V2).balanceOf(address(fwd)), 0, "EURe left behind");
        assertEq(IERC20Meta(USDC).balanceOf(address(fwd)), 0, "USDC left behind");
    }

    function test_fork_perSwapCapLeavesRemainder() public onlyForked {
        deal(EURE_V2, address(fwd), 12_000e18); // cap is 10k
        vm.prank(keeper);
        fwd.swapAndForward();
        assertEq(IERC20Meta(EURE_V2).balanceOf(address(fwd)), 2_000e18);
        assertGt(IERC20Meta(USDC).balanceOf(destination), 0);
    }
}
