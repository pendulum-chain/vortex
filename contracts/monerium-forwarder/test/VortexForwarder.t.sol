// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {VortexForwarder, IERC20, ISwapRouter02, IVortexForwarderFactory} from "../src/VortexForwarder.sol";
import {VortexForwarderFactory} from "../src/VortexForwarderFactory.sol";
import {VortexSubsidyVault} from "../src/VortexSubsidyVault.sol";

// Reference rate the keeper passes in the unit tests; equal to the mock oracle price.
uint256 constant REF = 1.14e8;

contract MockERC20 {
    string public name;
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory name_, uint8 decimals_) {
        name = name_;
        decimals = decimals_;
    }

    uint256 public totalMinted;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalMinted += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract MockOracle {
    int256 public answer = 1.14e8; // EUR/USD
    uint256 public updatedAt = block.timestamp;
    uint8 public constant decimals = 8;

    function set(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract MockRouter {
    MockERC20 public immutable eure;
    MockERC20 public immutable usdc;
    uint256 public nextOut;
    bytes public lastPath;

    constructor(MockERC20 eure_, MockERC20 usdc_) {
        eure = eure_;
        usdc = usdc_;
    }

    function setNextOut(uint256 v) external {
        nextOut = v;
    }

    function exactInput(ISwapRouter02.ExactInputParams calldata params) external payable returns (uint256) {
        eure.transferFrom(msg.sender, address(this), params.amountIn);
        lastPath = params.path;
        require(nextOut >= params.amountOutMinimum, "Too little received");
        usdc.mint(params.recipient, nextOut);
        return nextOut;
    }
}

/// Malicious router that tries to re-enter swapAndForward during the swap.
contract MockReentrantRouter {
    function exactInput(ISwapRouter02.ExactInputParams calldata) external payable returns (uint256) {
        VortexForwarder(msg.sender).swapAndForward(REF, 0); // must revert via reentrancy guard
        return 0;
    }
}

contract VortexForwarderTest is Test {
    MockERC20 eure;
    MockERC20 eurc;
    MockERC20 usdc;
    MockOracle oracle;
    MockRouter router;
    VortexForwarderFactory factory;
    VortexForwarder fwd;
    VortexSubsidyVault vault;

    uint256 attestorPk = 0xA11CE;
    address attestor;
    address feeRecipient = makeAddr("feeRecipient");
    address treasury = makeAddr("treasury");
    address destination = makeAddr("destination");
    address fallbackAddr = makeAddr("fallbackAddr");
    address keeper = makeAddr("keeper");
    address rando = makeAddr("rando");

    uint256 constant TRIGGER_DELAY = 24 hours;
    uint256 constant SWEEP_DELAY = 7 days; // registry P3

    // Fee policy defaults (proposal): target 12.5 bps, floor 15 bps below the reference.
    uint32 constant TARGET_PPM = 1_250;
    uint32 constant FLOOR_PPM = 1_500;
    // Vault defaults: 50 bps of the reference value per swap, 200 USDC per day.
    uint32 constant MAX_SUBSIDY_PPM = 5_000;
    uint256 constant DAILY_BUDGET = 200e6;
    // 1000 EURe at 1.14 = 1140 USDC reference value and its derived bounds.
    uint256 constant TARGET_1K = 1_138_575_000; // reference - 12.5 bps
    uint256 constant FLOOR_1K = 1_138_290_000; // reference - 15 bps
    uint256 constant ORACLE_FLOOR_1K = 1_135_440_000; // Chainlink - 40 bps
    uint256 constant TARGET_10K = 11_385_750_000;

    function setUp() public {
        attestor = vm.addr(attestorPk);
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
                attestor: attestor,
                feeRecipient: feeRecipient,
                maxOracleAge: 52 hours, // P8: covers observed Chainlink weekend gaps up to 48h
                slippageBps: 40,
                maxFeePpm: 10_000,
                maxReferenceDeviationBps: 100,
                sweepDelay: SWEEP_DELAY,
                triggerDelay: TRIGGER_DELAY,
                recoveryHash: bytes32(0)
            }),
            1e18, // MIN_SWAP_FLOOR
            50_000e18, // CAP_CEILING
            25e18, // minSwapAmount
            10_000e18, // perSwapCap
            _route(500, 500)
        );
        factory.setKeeper(keeper, true);
        vault = new VortexSubsidyVault(
            IERC20(address(usdc)), treasury, IVortexForwarderFactory(address(factory)), MAX_SUBSIDY_PPM, DAILY_BUDGET
        );
        usdc.mint(address(vault), 1_000e6);
        factory.setSubsidyVault(address(vault));
        fwd = VortexForwarder(
            factory.deployForwarder(destination, fallbackAddr, TARGET_PPM, FLOOR_PPM, bytes32(uint256(1)))
        );
    }

    // ---------------------------------------------------------------- helpers

    /// Uniswap V3 packed path EURe -> EURC -> USDC at the given fee tiers.
    function _route(uint24 tier1, uint24 tier2) internal view returns (bytes memory) {
        return abi.encodePacked(address(eure), tier1, address(eurc), tier2, address(usdc));
    }

    function _attest(address forwarder, bytes32 hash) internal view returns (bytes memory) {
        bytes32 bound = keccak256(abi.encodePacked(block.chainid, forwarder, hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorPk, bound);
        return abi.encodePacked(r, s, v);
    }

    function _fund(uint256 amount) internal {
        eure.mint(address(fwd), amount);
    }

    // ---------------------------------------------------------------- EIP-1271

    function test_linkSignature_valid_eip191Only() public view {
        bytes32 h191 = fwd.LINK_HASH_191();
        assertEq(fwd.isValidSignature(h191, _attest(address(fwd), h191)), bytes4(0x1626ba7e));
        // Raw-keccak variant was removed after G0 sandbox validation confirmed Monerium
        // presents the EIP-191 hash; it must now be rejected even with a valid attestor sig.
        bytes32 hRaw = keccak256(bytes("I hereby declare that I am the address owner."));
        assertEq(fwd.isValidSignature(hRaw, _attest(address(fwd), hRaw)), bytes4(0xffffffff));
    }

    function test_linkSignature_rejectsCrossChainReplay() public {
        bytes32 h = fwd.LINK_HASH_191();
        bytes memory sig = _attest(address(fwd), h); // bound to current chainid
        vm.chainId(999);
        assertEq(fwd.isValidSignature(h, sig), bytes4(0xffffffff));
    }

    function test_linkSignature_rejectsMalleatedAndMalformed() public view {
        bytes32 h = fwd.LINK_HASH_191();
        bytes memory good = _attest(address(fwd), h);
        // Malleate: s' = n - s, v' = flipped — same ECDSA validity, must be rejected.
        (bytes32 r, bytes32 s, uint8 v) = (bytes32(0), bytes32(0), 0);
        assembly {
            r := mload(add(good, 0x20))
            s := mload(add(good, 0x40))
            v := byte(0, mload(add(good, 0x60)))
        }
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory malleated = abi.encodePacked(r, bytes32(n - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        assertEq(fwd.isValidSignature(h, malleated), bytes4(0xffffffff));
        // Wrong lengths.
        assertEq(fwd.isValidSignature(h, abi.encodePacked(r, s)), bytes4(0xffffffff));
        assertEq(fwd.isValidSignature(h, abi.encodePacked(good, uint8(1))), bytes4(0xffffffff));
        // Bad v.
        assertEq(fwd.isValidSignature(h, abi.encodePacked(r, s, uint8(29))), bytes4(0xffffffff));
    }

    function test_recoveryHash_enabledBranch() public {
        bytes32 recoveryHash = keccak256("monerium-recovery-message-placeholder");
        VortexForwarderFactory f2 = new VortexForwarderFactory(
            VortexForwarder.ImmutableConfig({
                eure: address(eure),
                eurc: address(eurc),
                usdc: address(usdc),
                router: address(router),
                oracle: address(oracle),
                attestor: attestor,
                feeRecipient: feeRecipient,
                maxOracleAge: 52 hours, // P8: covers observed Chainlink weekend gaps up to 48h
                slippageBps: 40,
                maxFeePpm: 10_000,
                maxReferenceDeviationBps: 100,
                sweepDelay: SWEEP_DELAY,
                triggerDelay: TRIGGER_DELAY,
                recoveryHash: recoveryHash
            }),
            1e18,
            50_000e18,
            25e18,
            10_000e18,
            _route(500, 500)
        );
        VortexForwarder fwd2 =
            VortexForwarder(f2.deployForwarder(destination, fallbackAddr, TARGET_PPM, FLOOR_PPM, bytes32(uint256(8))));
        // Recovery hash validates with attestor binding; link still validates; others fail.
        bytes32 bound = keccak256(abi.encodePacked(block.chainid, address(fwd2), recoveryHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorPk, bound);
        assertEq(fwd2.isValidSignature(recoveryHash, abi.encodePacked(r, s, v)), bytes4(0x1626ba7e));
        bytes32 h191 = fwd2.LINK_HASH_191();
        bytes32 bound191 = keccak256(abi.encodePacked(block.chainid, address(fwd2), h191));
        (v, r, s) = vm.sign(attestorPk, bound191);
        assertEq(fwd2.isValidSignature(h191, abi.encodePacked(r, s, v)), bytes4(0x1626ba7e));
        bytes32 evil = keccak256("anything else");
        bytes32 boundEvil = keccak256(abi.encodePacked(block.chainid, address(fwd2), evil));
        (v, r, s) = vm.sign(attestorPk, boundEvil);
        assertEq(fwd2.isValidSignature(evil, abi.encodePacked(r, s, v)), bytes4(0xffffffff));
    }

    function test_linkHash191_matchesEip191OfFixedMessage() public view {
        bytes memory msg_ = bytes("I hereby declare that I am the address owner.");
        assertEq(msg_.length, 45);
        assertEq(fwd.LINK_HASH_191(), keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n45", msg_)));
    }

    function test_linkSignature_rejectsForeignHash() public view {
        bytes32 evil = keccak256("Send EUR 100000 to DE00ATTACKER at 2026-07-17T00:00Z");
        assertEq(fwd.isValidSignature(evil, _attest(address(fwd), evil)), bytes4(0xffffffff));
    }

    function test_linkSignature_rejectsWrongSigner() public {
        bytes32 h = fwd.LINK_HASH_191();
        bytes32 bound = keccak256(abi.encodePacked(block.chainid, address(fwd), h));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, bound);
        assertEq(fwd.isValidSignature(h, abi.encodePacked(r, s, v)), bytes4(0xffffffff));
    }

    function test_linkSignature_rejectsCrossCloneReplay() public {
        VortexForwarder other = VortexForwarder(
            factory.deployForwarder(destination, fallbackAddr, TARGET_PPM, FLOOR_PPM, bytes32(uint256(2)))
        );
        bytes32 h = fwd.LINK_HASH_191();
        // Signature bound to `fwd` must not validate on `other`.
        assertEq(other.isValidSignature(h, _attest(address(fwd), h)), bytes4(0xffffffff));
    }

    // ---------------------------------------------------------------- init

    function test_initialize_onlyFactory_andOnce() public {
        vm.expectRevert(VortexForwarder.NotFactory.selector);
        fwd.initialize(rando, rando, 0, 0);

        vm.prank(address(factory));
        vm.expectRevert(VortexForwarder.AlreadyInitialized.selector);
        fwd.initialize(rando, rando, 0, 0);
    }

    function test_implementation_isBricked() public {
        VortexForwarder impl = VortexForwarder(factory.implementation());
        vm.prank(address(factory));
        vm.expectRevert(VortexForwarder.AlreadyInitialized.selector);
        impl.initialize(rando, rando, 0, 0);
    }

    // ---------------------------------------------------------------- swap

    function test_swapAndForward_happyPath_forwardsToDestination() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K); // exactly the target: no fee, no subsidy
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        assertEq(usdc.balanceOf(destination), TARGET_1K);
        assertEq(eure.balanceOf(address(fwd)), 0);
        assertEq(eure.allowance(address(fwd), address(router)), 0);
    }

    function test_swapAndForward_enforcesOracleFloorOnTheNet() public {
        // Permissionless path (no subsidy): a fill below Chainlink - 40 bps must revert in
        // the forwarder's own post-condition, not in the router (its minimum is zero).
        _fund(1_000e18);
        fwd.poke();
        skip(TRIGGER_DELAY + 1);
        oracle.set(1.14e8, block.timestamp);
        router.setNextOut(ORACLE_FLOOR_1K - 1);
        vm.prank(rando);
        vm.expectRevert(VortexForwarder.InsufficientOutput.selector);
        fwd.swapAndForward(REF, 0);

        router.setNextOut(ORACLE_FLOOR_1K);
        vm.prank(rando);
        fwd.swapAndForward(REF, 0);
        assertEq(usdc.balanceOf(destination), ORACLE_FLOOR_1K);
    }

    function test_swapAndForward_revertsOnStaleOracle() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        oracle.set(1.14e8, block.timestamp);
        skip(53 hours); // just past the 52h P8 window
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.StalePrice.selector);
        fwd.swapAndForward(REF, 0);
    }

    function test_swapAndForward_publicOnlyAfterTriggerDelay() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);

        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotAuthorizedYet.selector);
        fwd.swapAndForward(REF, 0);

        fwd.poke();
        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotAuthorizedYet.selector);
        fwd.swapAndForward(REF, 0);

        skip(TRIGGER_DELAY + 1);
        oracle.set(1.14e8, block.timestamp);
        vm.prank(rando);
        fwd.swapAndForward(REF, 0);
        assertEq(usdc.balanceOf(destination), TARGET_1K);
    }

    function test_swapAndForward_revertsOnZeroOrNegativePrice() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        oracle.set(0, block.timestamp);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.InvalidPrice.selector);
        fwd.swapAndForward(REF, 0);
        oracle.set(-1, block.timestamp);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.InvalidPrice.selector);
        fwd.swapAndForward(REF, 0);
    }

    /// Review r1 P2: a perSwapCap remainder must keep its stranding timers armed —
    /// the swap re-arms the marker rather than clearing it when balance stays >= floor.
    function test_swapAndForward_reArmsMarkerForCapRemainder() public {
        _fund(15_000e18); // cap is 10k
        fwd.poke();
        assertGt(fwd.strandedSince(), 0);
        router.setNextOut(TARGET_10K);
        skip(1 hours);
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        assertEq(eure.balanceOf(address(fwd)), 5_000e18);
        assertEq(fwd.strandedSince(), block.timestamp, "remainder must stay armed (fresh timestamp)");
    }

    function test_swapAndForward_respectsPerSwapCap() public {
        _fund(15_000e18); // cap is 10k
        // minOut for 10k at 1.14*0.99 = 11286 USDC
        router.setNextOut(TARGET_10K);
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        assertEq(eure.balanceOf(address(fwd)), 5_000e18); // remainder awaits next execution
    }

    function test_swapAndForward_pausedByGuardianOrClientOrGlobal() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);

        fwd.setGuardianPaused(true); // test contract is factory guardian
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.Paused.selector);
        fwd.swapAndForward(REF, 0);
        fwd.setGuardianPaused(false);

        vm.prank(fallbackAddr);
        fwd.setClientPaused(true);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.Paused.selector);
        fwd.swapAndForward(REF, 0);
        vm.prank(fallbackAddr);
        fwd.setClientPaused(false);

        factory.setGlobalPaused(true);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.Paused.selector);
        fwd.swapAndForward(REF, 0);
    }

    function test_unsolicitedUsdc_forwardedWithNextSwap() public {
        usdc.mint(address(fwd), 500e6); // unsolicited direct transfer (R09)
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        assertEq(usdc.balanceOf(destination), TARGET_1K + 500e6);
    }

    function test_reentrantRouter_blockedByGuard() public {
        MockReentrantRouter evil = new MockReentrantRouter();
        VortexForwarderFactory f2 = new VortexForwarderFactory(
            VortexForwarder.ImmutableConfig({
                eure: address(eure),
                eurc: address(eurc),
                usdc: address(usdc),
                router: address(evil),
                oracle: address(oracle),
                attestor: attestor,
                feeRecipient: feeRecipient,
                maxOracleAge: 52 hours, // P8: covers observed Chainlink weekend gaps up to 48h
                slippageBps: 40,
                maxFeePpm: 10_000,
                maxReferenceDeviationBps: 100,
                sweepDelay: SWEEP_DELAY,
                triggerDelay: TRIGGER_DELAY,
                recoveryHash: bytes32(0)
            }),
            1e18,
            50_000e18,
            25e18,
            10_000e18,
            _route(500, 500)
        );
        f2.setKeeper(keeper, true);
        VortexForwarder fwd2 =
            VortexForwarder(f2.deployForwarder(destination, fallbackAddr, TARGET_PPM, FLOOR_PPM, bytes32(uint256(7))));
        eure.mint(address(fwd2), 1_000e18);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.Reentrancy.selector);
        fwd2.swapAndForward(REF, 0);
    }

    // ---------------------------------------------------------------- recovery

    function test_sweepStrandedEure_afterDelay_toFallbackOnly() public {
        _fund(500e18);
        fwd.poke();

        vm.expectRevert(VortexForwarder.DelayNotElapsed.selector);
        fwd.sweepStrandedEure();

        skip(SWEEP_DELAY + 1);
        vm.prank(rando); // permissionless
        fwd.sweepStrandedEure();
        assertEq(eure.balanceOf(fallbackAddr), 500e18);
        assertEq(fwd.strandedSince(), 0);
    }

    /// Review r1 F1 regression: raising the tunable minSwapAmount above a stranded
    /// balance must NOT let a poke() clear the marker — the dead-man sweep is armed
    /// against the immutable MIN_SWAP_FLOOR and must survive any guardian action.
    function test_guardianCannotDisarmDeadManSweep_byRaisingMinSwap() public {
        _fund(500e18);
        fwd.poke();
        assertGt(fwd.strandedSince(), 0);

        factory.setMinSwapAmount(1_000e18); // guardian raises threshold above balance
        fwd.poke(); // anyone can poke; marker must survive
        assertGt(fwd.strandedSince(), 0, "guardian disarmed the dead-man sweep");

        skip(SWEEP_DELAY + 1);
        fwd.sweepStrandedEure();
        assertEq(eure.balanceOf(fallbackAddr), 500e18);
    }

    function test_fallbackSweep_worksWhilePaused() public {
        _fund(500e18);
        fwd.setGuardianPaused(true);
        vm.prank(fallbackAddr);
        fwd.sweep(address(eure), fallbackAddr);
        assertEq(eure.balanceOf(fallbackAddr), 500e18);
    }

    function test_fallbackEureSweep_resetsDeadManTimer() public {
        _fund(500e18);
        fwd.poke();
        skip(SWEEP_DELAY + 1);

        vm.prank(fallbackAddr);
        fwd.sweep(address(eure), fallbackAddr);
        assertEq(fwd.strandedSince(), 0);

        _fund(500e18);
        vm.expectRevert(VortexForwarder.NotStranded.selector);
        fwd.sweepStrandedEure();
    }

    function test_fallbackAuthority_gated() public {
        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotFallbackAddress.selector);
        fwd.setDestination(rando);

        address newDest = makeAddr("newDest");
        vm.prank(fallbackAddr);
        fwd.setDestination(newDest);
        assertEq(fwd.destination(), newDest);
    }

    function test_guardianPause_gated() public {
        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotGuardian.selector);
        fwd.setGuardianPaused(true);
    }

    // ---------------------------------------------------------------- factory

    function test_predictAddress_matchesDeployment() public {
        bytes32 salt = bytes32(uint256(42));
        address predicted = factory.predictAddress(salt);
        address deployed = factory.deployForwarder(destination, fallbackAddr, TARGET_PPM, FLOOR_PPM, salt);
        assertEq(predicted, deployed);
    }

    function test_factory_paramBounds() public {
        vm.expectRevert(VortexForwarderFactory.OutOfBounds.selector);
        factory.setPerSwapCap(60_000e18); // above ceiling

        vm.expectRevert(VortexForwarderFactory.OutOfBounds.selector);
        factory.setMinSwapAmount(0.5e18); // below floor

        vm.expectRevert(VortexForwarderFactory.OutOfBounds.selector);
        factory.setMinSwapAmount(20_000e18); // above current cap
    }

    // ---------------------------------------------------------------- routes

    function test_routes_initialRouteIsEnabledAndUsed() public {
        (bytes memory path, bool enabled) = factory.route(0);
        assertEq(path, _route(500, 500));
        assertTrue(enabled);
        assertEq(factory.routeCount(), 1);

        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        assertEq(router.lastPath(), _route(500, 500));
    }

    function test_routes_keeperSelectsAmongWhitelistedRoutes() public {
        bytes memory direct = abi.encodePacked(address(eure), uint24(3000), address(usdc));
        uint256 index = factory.addRoute(direct);
        assertEq(index, 1);

        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        vm.prank(keeper);
        fwd.swapAndForward(REF, 1);
        assertEq(router.lastPath(), direct);
    }

    function test_routes_unknownOrDisabledRouteReverts() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);

        vm.prank(keeper);
        vm.expectRevert(VortexForwarderFactory.InvalidRoute.selector);
        fwd.swapAndForward(REF, 7);

        factory.setRouteEnabled(0, false);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.InvalidRoute.selector);
        fwd.swapAndForward(REF, 0);

        vm.expectRevert(VortexForwarderFactory.InvalidRoute.selector);
        factory.setRouteEnabled(7, false);
    }

    function test_routes_validationRejectsAnythingOutsideTheThreeTokens() public {
        address evil = makeAddr("evilToken");
        bytes[6] memory bad = [
            abi.encodePacked(evil, uint24(500), address(eurc), uint24(500), address(usdc)), // wrong start
            abi.encodePacked(address(eure), uint24(500), address(eurc), uint24(500), evil), // wrong end
            abi.encodePacked(address(eure), uint24(500), evil, uint24(500), address(usdc)), // wrong hop
            abi.encodePacked(address(eure), uint24(250), address(eurc), uint24(500), address(usdc)), // bad tier
            abi.encodePacked(address(eure), uint24(500), address(usdc), uint24(500)), // malformed length
            abi.encodePacked(
                address(eure), uint24(500), address(eurc), uint24(500), address(eurc), uint24(500), address(usdc)
            ) // three hops
        ];
        for (uint256 i = 0; i < bad.length; i++) {
            vm.expectRevert(VortexForwarderFactory.InvalidRoute.selector);
            factory.addRoute(bad[i]);
        }
        assertEq(factory.routeCount(), 1);
    }

    function test_routes_guardianOnly() public {
        vm.startPrank(rando);
        vm.expectRevert(VortexForwarderFactory.NotGuardian.selector);
        factory.addRoute(_route(100, 100));
        vm.expectRevert(VortexForwarderFactory.NotGuardian.selector);
        factory.setRouteEnabled(0, false);
        vm.expectRevert(VortexForwarderFactory.NotGuardian.selector);
        factory.setSubsidyVault(rando);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- fee bands

    function test_swap_aboveTarget_surplusIsTheFee() public {
        _fund(1_000e18);
        router.setNextOut(1_145e6);
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        assertEq(usdc.balanceOf(destination), TARGET_1K);
        assertEq(usdc.balanceOf(feeRecipient), 1_145e6 - TARGET_1K);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6);
    }

    function test_swap_feeCappedAtMaxFeePpm() public {
        _fund(1_000e18);
        router.setNextOut(1_200e6); // ~5% above the reference
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        assertEq(usdc.balanceOf(feeRecipient), 12e6); // 1% of the fill, not the whole surplus
        assertEq(usdc.balanceOf(destination), 1_188e6);
    }

    function test_swap_betweenFloorAndTarget_noFeeNoSubsidy() public {
        _fund(1_000e18);
        router.setNextOut(1_138_400_000);
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        assertEq(usdc.balanceOf(destination), 1_138_400_000);
        assertEq(usdc.balanceOf(feeRecipient), 0);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6);
    }

    function test_swap_belowFloor_vaultTopsUpToTheFloor() public {
        _fund(1_000e18);
        router.setNextOut(1_136e6);
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        uint256 subsidy = FLOOR_1K - 1_136e6; // 2.29 USDC
        assertEq(usdc.balanceOf(destination), FLOOR_1K);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6 - subsidy);
        assertEq(vault.spentToday(), subsidy);
        assertEq(usdc.balanceOf(feeRecipient), 0);
        assertEq(usdc.balanceOf(address(fwd)), 0);
    }

    function test_swap_rawFillBelowOracleFloor_isRescuedBySubsidy() public {
        _fund(1_000e18);
        router.setNextOut(1_134e6); // below Chainlink - 40 bps, within the vault's per-swap cap
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        assertEq(usdc.balanceOf(destination), FLOOR_1K);
    }

    function test_swap_subsidyOverCap_revertsTheWholeSwap() public {
        _fund(1_000e18);
        router.setNextOut(1_130e6); // needs 8.29 USDC; the cap is 50 bps of 1140 = 5.7 USDC
        vm.prank(keeper);
        vm.expectRevert(VortexSubsidyVault.SubsidyCapExceeded.selector);
        fwd.swapAndForward(REF, 0);
        assertEq(eure.balanceOf(address(fwd)), 1_000e18);
        assertEq(usdc.balanceOf(destination), 0);
    }

    function test_swap_subsidyOverBudget_reverts() public {
        vault.setDailyBudget(1e6);
        _fund(1_000e18);
        router.setNextOut(1_136e6);
        vm.prank(keeper);
        vm.expectRevert(VortexSubsidyVault.BudgetExhausted.selector);
        fwd.swapAndForward(REF, 0);
    }

    function test_swap_withoutVault_onlyFillsAtOrAboveTheFloorSucceed() public {
        factory.setSubsidyVault(address(0));
        _fund(1_000e18);
        router.setNextOut(1_136e6);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.SubsidyUnavailable.selector);
        fwd.swapAndForward(REF, 0);

        router.setNextOut(1_145e6);
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        assertEq(usdc.balanceOf(destination), TARGET_1K);
    }

    function test_swap_depeggedReference_cannotBePaperedOverBySubsidy() public {
        _fund(1_000e18);
        uint256 lowReference = (REF * 9_910) / 10_000; // 90 bps below Chainlink: inside the band
        // The floor at that reference (~1128.05 USDC) is below Chainlink - 40 bps (1135.44):
        // the vault would top the client up to it, and the swap must still revert.
        router.setNextOut(1_127e6);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.InsufficientOutput.selector);
        fwd.swapAndForward(lowReference, 0);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6, "subsidy transfer must be undone");
    }

    function test_swap_referenceOutsideTheBandReverts() public {
        _fund(1_000e18);
        router.setNextOut(1_150e6);
        vm.startPrank(keeper);
        vm.expectRevert(VortexForwarder.ReferenceOutOfBand.selector);
        fwd.swapAndForward((REF * 10_101) / 10_000, 0); // 101 bps above
        vm.expectRevert(VortexForwarder.ReferenceOutOfBand.selector);
        fwd.swapAndForward((REF * 9_899) / 10_000, 0); // 101 bps below
        vm.expectRevert(VortexForwarder.ReferenceOutOfBand.selector);
        fwd.swapAndForward(0, 0);
        fwd.swapAndForward((REF * 10_100) / 10_000, 0); // exactly 100 bps: allowed
        vm.stopPrank();
        assertGt(usdc.balanceOf(destination), 0);
    }

    function test_swap_permissionless_pricesAgainstChainlinkAndPaysNoSubsidy() public {
        _fund(1_000e18);
        fwd.poke();
        skip(TRIGGER_DELAY + 1);
        oracle.set(1.14e8, block.timestamp);
        router.setNextOut(1_136e6); // below the floor: the client simply gets the fill
        vm.prank(rando);
        fwd.swapAndForward(1, 0); // garbage reference is ignored on this path
        assertEq(usdc.balanceOf(destination), 1_136e6);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6);

        _fund(1_000e18);
        fwd.poke();
        skip(TRIGGER_DELAY + 1);
        oracle.set(1.14e8, block.timestamp);
        router.setNextOut(1_145e6); // above the Chainlink-based target: the fee still applies
        vm.prank(rando);
        fwd.swapAndForward(999, 0);
        assertEq(usdc.balanceOf(feeRecipient), 1_145e6 - TARGET_1K);
    }

    // ------------------------------------------------------- fee policy (P11)

    function test_feePolicy_validatedAtDeploy() public {
        vm.expectRevert(VortexForwarder.InvalidFeePolicy.selector);
        factory.deployForwarder(destination, fallbackAddr, 2_000, 1_500, bytes32(uint256(9))); // target above floor
        vm.expectRevert(VortexForwarder.InvalidFeePolicy.selector);
        factory.deployForwarder(destination, fallbackAddr, 1_000, 10_001, bytes32(uint256(9))); // floor above cap
    }

    function test_setFeePolicy_onlyGuardianAndValidated() public {
        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotGuardian.selector);
        fwd.setFeePolicy(1_000, 1_000);

        vm.expectRevert(VortexForwarder.InvalidFeePolicy.selector);
        fwd.setFeePolicy(1_600, 1_500);
        vm.expectRevert(VortexForwarder.InvalidFeePolicy.selector);
        fwd.setFeePolicy(1_000, 10_001);
    }

    function test_setFeePolicy_increaseIsTimelocked() public {
        fwd.setFeePolicy(2_500, 3_000);
        // Announced, not applied: swaps in the window still use the old policy.
        assertEq(fwd.targetPpm(), TARGET_PPM);
        assertEq(fwd.floorPpm(), FLOOR_PPM);
        assertEq(fwd.pendingTargetPpm(), 2_500);
        assertEq(fwd.pendingFloorPpm(), 3_000);
        assertEq(fwd.pendingFeePolicyEffectiveAt(), uint64(block.timestamp + fwd.FEE_INCREASE_TIMELOCK()));

        vm.expectRevert(VortexForwarder.DelayNotElapsed.selector);
        fwd.applyFeePolicy();

        vm.warp(block.timestamp + 24 hours);
        vm.prank(rando); // apply is permissionless: the announcement is the authorization
        fwd.applyFeePolicy();
        assertEq(fwd.targetPpm(), 2_500);
        assertEq(fwd.floorPpm(), 3_000);
        assertEq(fwd.pendingFeePolicyEffectiveAt(), 0);

        vm.expectRevert(VortexForwarder.NoPendingFeePolicy.selector);
        fwd.applyFeePolicy();
    }

    function test_setFeePolicy_raisingEitherValueIsAnIncrease() public {
        fwd.setFeePolicy(1_000, 1_600); // target down, floor up: timelocked as a whole
        assertEq(fwd.targetPpm(), TARGET_PPM);
        assertEq(fwd.floorPpm(), FLOOR_PPM);
        assertEq(fwd.pendingTargetPpm(), 1_000);
        assertEq(fwd.pendingFloorPpm(), 1_600);
    }

    function test_setFeePolicy_decreaseIsImmediateAndCancelsPending() public {
        fwd.setFeePolicy(2_500, 3_000);
        vm.warp(block.timestamp + 24 hours);
        fwd.applyFeePolicy();

        fwd.setFeePolicy(4_000, 4_000); // announce a further increase
        fwd.setFeePolicy(1_000, 1_200); // decrease before it applies: immediate, cancels
        assertEq(fwd.targetPpm(), 1_000);
        assertEq(fwd.floorPpm(), 1_200);
        assertEq(fwd.pendingFeePolicyEffectiveAt(), 0);
        vm.warp(block.timestamp + 24 hours);
        vm.expectRevert(VortexForwarder.NoPendingFeePolicy.selector);
        fwd.applyFeePolicy();
    }

    function test_setFeePolicy_reannounceReplacesAndRestartsClock() public {
        fwd.setFeePolicy(2_500, 3_000);
        vm.warp(block.timestamp + 12 hours);
        fwd.setFeePolicy(4_000, 4_000); // replaces the pending pair and restarts the 24h clock
        assertEq(fwd.pendingTargetPpm(), 4_000);

        vm.warp(block.timestamp + 12 hours + 1); // 24h after the FIRST announcement only
        vm.expectRevert(VortexForwarder.DelayNotElapsed.selector);
        fwd.applyFeePolicy();

        vm.warp(block.timestamp + 12 hours);
        fwd.applyFeePolicy();
        assertEq(fwd.targetPpm(), 4_000);
        assertEq(fwd.floorPpm(), 4_000);
    }

    function test_setFeePolicy_restatingCurrentCancelsWithoutChange() public {
        fwd.setFeePolicy(2_500, 3_000);
        fwd.setFeePolicy(TARGET_PPM, FLOOR_PPM); // re-state the current values: cancel-only gesture
        assertEq(fwd.targetPpm(), TARGET_PPM);
        assertEq(fwd.floorPpm(), FLOOR_PPM);
        assertEq(fwd.pendingFeePolicyEffectiveAt(), 0);
    }

    function test_swapDuringPendingIncrease_usesOldPolicy() public {
        fwd.setFeePolicy(2_500, 3_000); // pending, not applied
        _fund(1_000e18);
        router.setNextOut(1_145e6);
        vm.prank(keeper);
        fwd.swapAndForward(REF, 0);
        // The fee closes the gap to the OLD target: the announced policy never touches a swap.
        assertEq(usdc.balanceOf(feeRecipient), 1_145e6 - TARGET_1K);
        assertEq(usdc.balanceOf(destination), TARGET_1K);
    }
}
