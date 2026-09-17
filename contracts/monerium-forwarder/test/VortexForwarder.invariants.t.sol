// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {VortexForwarder, IERC20, IVortexForwarderFactory} from "../src/VortexForwarder.sol";
import {VortexForwarderFactory} from "../src/VortexForwarderFactory.sol";
import {VortexSubsidyVault} from "../src/VortexSubsidyVault.sol";
import {MockERC20, MockOracle, MockRouter} from "./VortexForwarder.t.sol";

/// Randomized action handler. Ghost variables track every token unit entering the
/// system so the invariants below can assert exit-path exhaustiveness (plan §2.3.1):
/// EURe may sit in the forwarder, be consumed by the router, or reach the Vortex
/// recovery wallet; USDC may sit on the forwarder or reach destination, feeRecipient
/// or the recovery wallet (plus vault subsidies, which land on the forwarder first);
/// nothing else, ever. A recovery is only ever possible RECOVERY_DELAY after a batch
/// opened, and a chunk swap never re-times an open batch.
contract ForwarderHandler is Test {
    VortexForwarderFactory public factory;
    VortexForwarder public fwd;
    VortexSubsidyVault public vault;
    MockERC20 public eure;
    MockERC20 public usdc;
    MockERC20 public eurc;
    MockOracle public oracle;
    MockRouter public router;

    address public destination = makeAddr("destination");
    address public recoveryWallet = makeAddr("recoveryWallet");
    address public keeper = makeAddr("keeper");
    address public rando = makeAddr("rando");
    address public feeRecipient = makeAddr("feeRecipient");
    address public treasury = makeAddr("treasury");

    uint256 public ghostEureMinted;
    uint256 public ghostUsdcPaidByRouter;
    uint256 public ghostSubsidyPaid;
    /// Successful swaps whose client net landed below the oracle floor, or keeper swaps
    /// below the policy floor, or fees above MAX_FEE_PPM. Must stay zero.
    uint256 public pricingViolations;
    /// Recoveries that succeeded less than RECOVERY_DELAY after their batch opened. Must stay zero.
    uint256 public earlyRecoveries;
    /// Swaps that changed an already-armed batch marker. Must stay zero.
    uint256 public markerRetimes;
    uint32 public immutable INITIAL_TARGET_PPM = 1_250;
    uint32 public immutable INITIAL_FLOOR_PPM = 1_500;
    uint256 public constant VAULT_FUNDING = 10_000e6;
    uint256 public constant RECOVERY_DELAY = 2 hours;
    uint256 constant REFERENCE = 1.14e8;

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
                recoveryWallet: recoveryWallet,
                maxOracleAge: 52 hours, // P8: covers observed Chainlink weekend gaps up to 48h
                slippageBps: 60,
                maxFeePpm: 10_000,
                maxReferenceDeviationBps: 100,
                recoveryDelay: RECOVERY_DELAY, // registry P3
                triggerDelay: 24 hours,
                recoveryHash: bytes32(0)
            }),
            1e18,
            50_000e18,
            25e18,
            10_000e18,
            abi.encodePacked(address(eure), uint24(500), address(eurc), uint24(500), address(usdc))
        );
        factory.setKeeper(keeper, true);
        vault = new VortexSubsidyVault(
            IERC20(address(usdc)), treasury, IVortexForwarderFactory(address(factory)), 5_000, 200e6
        );
        usdc.mint(address(vault), VAULT_FUNDING);
        factory.setSubsidyVault(address(vault));
        fwd = VortexForwarder(
            factory.deployForwarder(destination, INITIAL_TARGET_PPM, INITIAL_FLOOR_PPM, bytes32(uint256(1)))
        );
        ghostExpectedTargetPpm = INITIAL_TARGET_PPM;
        ghostExpectedFloorPpm = INITIAL_FLOOR_PPM;
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

    /// Router pays a randomized amount around the fair oracle value: far below exercises
    /// the floor/cap reverts, slightly below the subsidy path, above the fee path.
    function keeperSwap(uint96 raw, uint96 rawAmount) external {
        _swapAs(keeper, raw, rawAmount);
    }

    function randoSwap(uint96 raw, uint96 rawAmount) external {
        _swapAs(rando, raw, rawAmount);
    }

    function _swapAs(address caller, uint96 raw, uint96 rawAmount) internal {
        oracle.set(1.14e8, block.timestamp);
        uint256 balance = eure.balanceOf(address(fwd));
        uint256 ceiling = balance > 10_000e18 ? 10_000e18 : balance;
        // Mostly legal amounts; occasionally out of bounds to exercise the reverts.
        uint256 amountIn = bound(uint256(rawAmount), 0, ceiling + 30e18);
        uint256 fair = (amountIn * REFERENCE) / 1e20;
        uint256 payout = bound(uint256(raw), (fair * 95) / 100, (fair * 105) / 100);
        router.setNextOut(payout);

        uint256 routerUsdcBefore = usdc.totalMinted();
        uint256 vaultBefore = usdc.balanceOf(address(vault));
        uint256 cloneBefore = usdc.balanceOf(address(fwd));
        uint256 feeBefore = usdc.balanceOf(feeRecipient);
        uint64 markerBefore = fwd.batchOpenedAt();
        vm.prank(caller);
        try fwd.swap(REFERENCE, 0, amountIn) {
            uint256 paid = usdc.totalMinted() - routerUsdcBefore;
            ghostUsdcPaidByRouter += paid;
            ghostSubsidyPaid += vaultBefore - usdc.balanceOf(address(vault));
            uint256 net = usdc.balanceOf(address(fwd)) - cloneBefore; // fill - fee + subsidy
            if (net < (fair * 9_940) / 10_000) pricingViolations++; // Chainlink - 60 bps
            if (caller == keeper && net < (fair * (1_000_000 - fwd.floorPpm())) / 1_000_000) pricingViolations++;
            if (usdc.balanceOf(feeRecipient) - feeBefore > paid / 100) pricingViolations++; // MAX_FEE_PPM
            if (markerBefore != 0 && fwd.batchOpenedAt() != markerBefore) markerRetimes++;
        } catch {}
    }

    function keeperForward(uint96 raw) external {
        uint256 amount = bound(uint256(raw), 0, usdc.balanceOf(address(fwd)) + 1e6);
        vm.prank(keeper);
        try fwd.forward(amount) {} catch {}
    }

    function forwardAllAs(bool asKeeper) external {
        vm.prank(asKeeper ? keeper : rando);
        try fwd.forwardAll() {} catch {}
    }

    function keeperRecover(uint96 rawEure, uint96 rawUsdc) external {
        uint256 eureAmount = bound(uint256(rawEure), 0, eure.balanceOf(address(fwd)) + 1e18);
        uint256 usdcAmount = bound(uint256(rawUsdc), 0, usdc.balanceOf(address(fwd)) + 1e6);
        uint64 opened = fwd.batchOpenedAt();
        vm.prank(keeper);
        try fwd.recover(eureAmount, usdcAmount) {
            if (opened == 0 || block.timestamp - opened < RECOVERY_DELAY) earlyRecoveries++;
        } catch {}
    }

    function guardianPause(bool paused) external {
        fwd.setGuardianPaused(paused); // handler deployed the factory -> handler is guardian
    }

    /// P11 ghost model: what the fee policy is allowed to be right now. Decreases apply
    /// immediately; increases only after their announced timelock elapses AND
    /// someone calls applyFeePolicy.
    uint32 public ghostExpectedTargetPpm;
    uint32 public ghostExpectedFloorPpm;

    function guardianSetFeePolicy(uint32 rawTarget, uint32 rawFloor) external {
        uint32 target = rawTarget % 11_000;
        uint32 floor = target + rawFloor % 1_500; // sometimes above MAX_FEE_PPM: exercises InvalidFeePolicy
        try fwd.setFeePolicy(target, floor) {
            if (target <= ghostExpectedTargetPpm && floor <= ghostExpectedFloorPpm) {
                ghostExpectedTargetPpm = target; // decrease/cancel: immediate
                ghostExpectedFloorPpm = floor;
            }
            // increase: pending only — ghost updates when applyFeePolicy succeeds
        } catch {}
    }

    function applyFeePolicy() external {
        try fwd.applyFeePolicy() {
            ghostExpectedTargetPpm = fwd.targetPpm(); // apply succeeded past its timelock
            ghostExpectedFloorPpm = fwd.floorPpm();
        } catch {}
    }

    function randoTriesPrivilegedCalls(uint8 selector) external {
        vm.startPrank(rando);
        if (selector % 5 == 0) try fwd.setGuardianPaused(true) {} catch {}
        if (selector % 5 == 1) try fwd.forward(usdc.balanceOf(address(fwd))) {} catch {}
        if (selector % 5 == 2) try fwd.recover(eure.balanceOf(address(fwd)), usdc.balanceOf(address(fwd))) {} catch {}
        if (selector % 5 == 3) try fwd.setFeePolicy(99, 99) {} catch {}
        if (selector % 5 == 4) try vault.setDailyBudget(type(uint256).max) {} catch {}
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
    /// either still there, consumed by the router (swap), or at the recovery wallet.
    function invariant_eureConservation() public view {
        uint256 accounted = handler.eure().balanceOf(address(handler.fwd()))
            + handler.eure().balanceOf(address(handler.router())) + handler.eure().balanceOf(handler.recoveryWallet());
        assertEq(accounted, handler.ghostEureMinted(), "EURe leaked to an unexpected address");
    }

    /// Exit-path exhaustiveness for USDC: everything the router ever paid plus every
    /// subsidy the vault ever paid is either still on the forwarder or split between
    /// destination, feeRecipient and the recovery wallet; the vault only ever shrinks
    /// by what it paid.
    function invariant_usdcOnlyReachesDestinationFeeOrRecovery() public view {
        uint256 accounted = handler.usdc().balanceOf(address(handler.fwd()))
            + handler.usdc().balanceOf(handler.destination()) + handler.usdc().balanceOf(handler.feeRecipient())
            + handler.usdc().balanceOf(handler.recoveryWallet());
        assertEq(
            accounted,
            handler.ghostUsdcPaidByRouter() + handler.ghostSubsidyPaid(),
            "USDC leaked to an unexpected address"
        );
        assertEq(
            handler.usdc().balanceOf(address(handler.vault())),
            handler.VAULT_FUNDING() - handler.ghostSubsidyPaid(),
            "vault balance disagrees with subsidies paid"
        );
    }

    /// Every successful swap respects the pricing bounds: the client's net never sits
    /// below the oracle floor, a keeper swap never below the policy floor, and the fee
    /// never exceeds MAX_FEE_PPM.
    function invariant_pricingBounds() public view {
        assertEq(handler.pricingViolations(), 0, "a swap violated a pricing bound");
    }

    /// A recovery can only ever happen RECOVERY_DELAY after the batch opened: the
    /// contract, not the keeper, enforces the promised window.
    function invariant_recoveryNeverEarly() public view {
        assertEq(handler.earlyRecoveries(), 0, "a recovery ran before RECOVERY_DELAY");
    }

    /// Chunking a payment never restarts its recovery clock.
    function invariant_swapNeverRetimesTheBatch() public view {
        assertEq(handler.markerRetimes(), 0, "a swap re-timed an open batch");
    }

    /// Config changes only through their authorized paths: the fee policy moves
    /// exclusively via the guardian's timelocked setter (P11 ghost model tracks every
    /// legal transition — a rando call or an early apply can never move it), stays
    /// ordered and capped; the destination never changes at all.
    function invariant_configIntegrity() public view {
        assertEq(handler.fwd().targetPpm(), handler.ghostExpectedTargetPpm(), "target moved outside the timelock path");
        assertEq(handler.fwd().floorPpm(), handler.ghostExpectedFloorPpm(), "floor moved outside the timelock path");
        assertLe(handler.fwd().targetPpm(), handler.fwd().floorPpm(), "target above floor");
        assertLe(handler.fwd().floorPpm(), 10_000, "floor exceeded MAX_FEE_PPM");
        assertEq(handler.fwd().destination(), handler.destination());
    }

    /// The batch marker never points into the future.
    function invariant_batchMarkerNotInFuture() public view {
        assertLe(handler.fwd().batchOpenedAt(), block.timestamp);
    }
}
