// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {VortexForwarder} from "../src/VortexForwarder.sol";
import {VortexForwarderFactory} from "../src/VortexForwarderFactory.sol";
import {MockERC20, MockOracle, MockRouter} from "./VortexForwarder.t.sol";

/// Randomized action handler. Ghost variables track every token unit entering the
/// system so the invariants below can assert exit-path exhaustiveness (plan §2.3.1):
/// EURe may sit in the forwarder, be consumed by the router, or reach the client's
/// fallback; USDC may only reach destination + feeRecipient; nothing else, ever.
contract ForwarderHandler is Test {
    VortexForwarderFactory public factory;
    VortexForwarder public fwd;
    MockERC20 public eure;
    MockERC20 public usdc;
    MockERC20 public eurc;
    MockOracle public oracle;
    MockRouter public router;

    address public destination = makeAddr("destination");
    address public fallbackAddr = makeAddr("fallbackAddr");
    address public keeper = makeAddr("keeper");
    address public rando = makeAddr("rando");
    address public feeRecipient = makeAddr("feeRecipient");

    uint256 public ghostEureMinted;
    uint256 public ghostUsdcPaidByRouter;
    uint256 public fallbackSweepFailures;
    uint16 public immutable INITIAL_FEE_BPS = 50;

    constructor() {
        eure = new MockERC20("EURe", 18);
        eurc = new MockERC20("EURC", 6);
        usdc = new MockERC20("USDC", 6);
        oracle = new MockOracle();
        router = new MockRouter(eure, usdc);

        factory = new VortexForwarderFactory(
            VortexForwarder.ImmutableConfig({
                eure: address(eure),
                eurc: address(eurc),
                usdc: address(usdc),
                router: address(router),
                oracle: address(oracle),
                attestor: vm.addr(0xA11CE),
                feeRecipient: feeRecipient,
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
        fwd = VortexForwarder(factory.deployForwarder(destination, fallbackAddr, INITIAL_FEE_BPS, bytes32(uint256(1))));
    }

    // ------------------------------------------------------------- actions

    function fund(uint96 raw) external {
        uint256 amount = bound(uint256(raw), 0, 20_000e18);
        eure.mint(address(fwd), amount);
        ghostEureMinted += amount;
    }

    function doPoke() external {
        fwd.poke();
    }

    function warp(uint32 raw) external {
        vm.warp(block.timestamp + bound(uint256(raw), 1, 90 days));
    }

    /// Router pays a randomized amount around the fair oracle value; underpayment
    /// exercises the minOut revert path, overpayment the happy path.
    function keeperSwap(uint96 raw) external {
        _swapAs(keeper, raw);
    }

    function randoSwap(uint96 raw) external {
        _swapAs(rando, raw);
    }

    function _swapAs(address caller, uint96 raw) internal {
        oracle.set(1.14e8, block.timestamp);
        uint256 balance = eure.balanceOf(address(fwd));
        uint256 amountIn = balance > 10_000e18 ? 10_000e18 : balance;
        uint256 fair = (amountIn * 1.14e8) / 1e20;
        // 95%..105% of fair value; below 99% the swap must revert on minOut.
        uint256 payout = bound(uint256(raw), (fair * 95) / 100, (fair * 105) / 100);
        router.setNextOut(payout);

        uint256 routerUsdcBefore = usdc.totalMinted();
        vm.prank(caller);
        try fwd.swapAndForward() {
            ghostUsdcPaidByRouter += usdc.totalMinted() - routerUsdcBefore;
        } catch {}
    }

    function sweepStranded() external {
        try fwd.sweepStrandedEure() {} catch {}
    }

    function guardianPause(bool paused) external {
        fwd.setGuardianPaused(paused); // handler deployed the factory -> handler is guardian
    }

    function clientPause(bool paused) external {
        vm.prank(fallbackAddr);
        fwd.setClientPaused(paused);
    }

    /// The client exit hatch must NEVER fail, including while paused (plan §2.3.4).
    function clientSweepEure() external {
        vm.prank(fallbackAddr);
        try fwd.sweep(address(eure), fallbackAddr) {}
        catch {
            fallbackSweepFailures++;
        }
    }

    function randoTriesPrivilegedCalls(uint8 selector) external {
        vm.startPrank(rando);
        if (selector % 4 == 0) try fwd.setDestination(rando) {} catch {}
        if (selector % 4 == 1) try fwd.setGuardianPaused(true) {} catch {}
        if (selector % 4 == 2) try fwd.setFallbackAddress(rando) {} catch {}
        if (selector % 4 == 3) try fwd.sweep(address(eure), rando) {} catch {}
        vm.stopPrank();
    }
}

contract VortexForwarderInvariantTest is Test {
    ForwarderHandler handler;

    function setUp() public {
        handler = new ForwarderHandler();
        targetContract(address(handler));
    }

    /// Exit-path exhaustiveness for EURe: every unit ever minted into the forwarder is
    /// either still there, consumed by the router (swap), or at the client's fallback.
    function invariant_eureConservation() public view {
        uint256 accounted = handler.eure().balanceOf(address(handler.fwd()))
            + handler.eure().balanceOf(address(handler.router())) + handler.eure().balanceOf(handler.fallbackAddr());
        assertEq(accounted, handler.ghostEureMinted(), "EURe leaked to an unexpected address");
    }

    /// Exit-path exhaustiveness for USDC: everything the router ever paid ends up
    /// split between destination and feeRecipient; the forwarder retains nothing.
    function invariant_usdcOnlyReachesDestinationAndFee() public view {
        uint256 accounted =
            handler.usdc().balanceOf(handler.destination()) + handler.usdc().balanceOf(handler.feeRecipient());
        assertEq(accounted, handler.ghostUsdcPaidByRouter(), "USDC leaked to an unexpected address");
        assertEq(handler.usdc().balanceOf(address(handler.fwd())), 0, "forwarder retained USDC");
    }

    /// feeBps is immutable post-init; rando privileged-call attempts must never mutate config.
    function invariant_configIntegrity() public view {
        assertEq(handler.fwd().feeBps(), handler.INITIAL_FEE_BPS());
        assertEq(handler.fwd().destination(), handler.destination());
        assertEq(handler.fwd().fallbackAddress(), handler.fallbackAddr());
    }

    /// Guardian/global pause must never block the client's exit hatch.
    function invariant_fallbackSweepNeverBlocked() public view {
        assertEq(handler.fallbackSweepFailures(), 0, "client exit hatch was blocked");
    }

    /// The stranding marker never points into the future.
    function invariant_strandedSinceNotInFuture() public view {
        assertLe(handler.fwd().strandedSince(), block.timestamp);
    }
}
