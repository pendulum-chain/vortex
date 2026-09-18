// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {VortexForwarder, IERC20, ISwapRouter02, IVortexForwarderFactory} from "../src/VortexForwarder.sol";
import {VortexForwarderFactory} from "../src/VortexForwarderFactory.sol";
import {VortexSubsidyVault} from "../src/VortexSubsidyVault.sol";

// Reference rate the keeper passes in the unit tests; equal to the mock oracle price.
uint256 constant REF = 1.14e8;
// "No keeper tier": lets the vault's own cap decide, as the tests did before A+.
uint256 constant NO_CAP = type(uint256).max;

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

/// Malicious router that tries to re-enter swap during the swap.
contract MockReentrantRouter {
    function exactInput(ISwapRouter02.ExactInputParams calldata) external payable returns (uint256) {
        VortexForwarder(msg.sender).swap(REF, 0, 1_000e18, NO_CAP); // must revert via reentrancy guard
        return 0;
    }
}

/// Vault that accepts pay() and transfers nothing: what a misconfigured or hostile
/// guardian-set vault looks like from the forwarder's side.
contract NoopVault {
    function pay(address, uint256, uint256) external {}
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
    address recoveryWallet = makeAddr("recoveryWallet");
    address keeper = makeAddr("keeper");
    address rando = makeAddr("rando");

    uint256 constant TRIGGER_DELAY = 24 hours;
    uint256 constant RECOVERY_DELAY = 2 hours; // registry P3: the promised conversion window

    // Fee policy defaults (proposal): target 12.5 bps, floor 15 bps below the reference.
    uint32 constant TARGET_PPM = 1_250;
    uint32 constant FLOOR_PPM = 1_500;
    // Vault defaults: 50 bps of the reference value per swap, 200 USDC per day.
    uint32 constant MAX_SUBSIDY_PPM = 5_000;
    uint256 constant DAILY_BUDGET = 200e6;
    // 1000 EURe at 1.14 = 1140 USDC reference value and its derived bounds.
    uint256 constant TARGET_1K = 1_138_575_000; // reference - 12.5 bps
    uint256 constant FLOOR_1K = 1_138_290_000; // reference - 15 bps
    uint256 constant ORACLE_FLOOR_1K = 1_133_160_000; // Chainlink - 60 bps
    uint256 constant TARGET_10K = 11_385_750_000;

    function setUp() public {
        attestor = vm.addr(attestorPk);
        eure = new MockERC20("EURe", 18);
        eurc = new MockERC20("EURC", 6);
        usdc = new MockERC20("USDC", 6);
        oracle = new MockOracle();
        router = new MockRouter(eure, usdc);

        factory = new VortexForwarderFactory(
            _config(address(router), bytes32(0)),
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
        fwd = VortexForwarder(factory.deployForwarder(destination, TARGET_PPM, FLOOR_PPM, bytes32(uint256(1))));
    }

    // ---------------------------------------------------------------- helpers

    function _config(address router_, bytes32 recoveryHash)
        internal
        view
        returns (VortexForwarder.ImmutableConfig memory)
    {
        return VortexForwarder.ImmutableConfig({
            eure: address(eure),
            eurc: address(eurc),
            usdc: address(usdc),
            router: router_,
            oracle: address(oracle),
            attestor: attestor,
            feeRecipient: feeRecipient,
            recoveryWallet: recoveryWallet,
            maxOracleAge: 52 hours, // P8: covers observed Chainlink weekend gaps up to 48h
            slippageBps: 60, // P1: tolerates ~45 bps of weekend drift under a stale Chainlink round
            maxFeePpm: 10_000,
            maxReferenceDeviationBps: 100,
            recoveryDelay: RECOVERY_DELAY,
            triggerDelay: TRIGGER_DELAY,
            recoveryHash: recoveryHash
        });
    }

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

    function _keeperSwap(uint256 amountIn) internal {
        vm.prank(keeper);
        fwd.swap(REF, 0, amountIn, NO_CAP);
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
            _config(address(router), recoveryHash), 1e18, 50_000e18, 25e18, 10_000e18, _route(500, 500)
        );
        VortexForwarder fwd2 =
            VortexForwarder(f2.deployForwarder(destination, TARGET_PPM, FLOOR_PPM, bytes32(uint256(8))));
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
        VortexForwarder other =
            VortexForwarder(factory.deployForwarder(destination, TARGET_PPM, FLOOR_PPM, bytes32(uint256(2))));
        bytes32 h = fwd.LINK_HASH_191();
        // Signature bound to `fwd` must not validate on `other`.
        assertEq(other.isValidSignature(h, _attest(address(fwd), h)), bytes4(0xffffffff));
    }

    // ---------------------------------------------------------------- init

    function test_initialize_onlyFactory_andOnce() public {
        vm.expectRevert(VortexForwarder.NotFactory.selector);
        fwd.initialize(rando, 0, 0);

        vm.prank(address(factory));
        vm.expectRevert(VortexForwarder.AlreadyInitialized.selector);
        fwd.initialize(rando, 0, 0);
    }

    function test_implementation_isBricked() public {
        VortexForwarder impl = VortexForwarder(factory.implementation());
        vm.prank(address(factory));
        vm.expectRevert(VortexForwarder.AlreadyInitialized.selector);
        impl.initialize(rando, 0, 0);
    }

    function test_deploy_rejectsRecoveryWalletAsDestination() public {
        vm.expectRevert(VortexForwarder.InvalidConfigAddress.selector);
        factory.deployForwarder(recoveryWallet, TARGET_PPM, FLOOR_PPM, bytes32(uint256(3)));
    }

    function test_implementation_rejectsZeroRecoveryWallet() public {
        VortexForwarder.ImmutableConfig memory cfg = _config(address(router), bytes32(0));
        cfg.recoveryWallet = address(0);
        vm.expectRevert(VortexForwarder.ZeroAddress.selector);
        new VortexForwarderFactory(cfg, 1e18, 50_000e18, 25e18, 10_000e18, _route(500, 500));
    }

    // ---------------------------------------------------------------- swap + forward

    function test_swap_keepsUsdcOnTheClone_untilForward() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K); // exactly the target: no fee, no subsidy
        _keeperSwap(1_000e18);
        assertEq(usdc.balanceOf(address(fwd)), TARGET_1K, "USDC must accumulate on the clone");
        assertEq(usdc.balanceOf(destination), 0);
        assertEq(eure.balanceOf(address(fwd)), 0);
        assertEq(eure.allowance(address(fwd), address(router)), 0);

        vm.prank(keeper);
        fwd.forward(TARGET_1K);
        assertEq(usdc.balanceOf(destination), TARGET_1K);
        assertEq(usdc.balanceOf(address(fwd)), 0);
        assertEq(fwd.batchOpenedAt(), 0, "an emptied clone closes its batch");
    }

    /// One bank payment, several chunks, one transfer: the partner's 1:1 mapping.
    function test_chunkedPayment_forwardedAsOneTransfer() public {
        _fund(25_000e18); // cap is 10k: three chunks
        router.setNextOut(TARGET_10K);
        _keeperSwap(10_000e18);
        _keeperSwap(10_000e18);
        router.setNextOut(5 * TARGET_1K);
        _keeperSwap(5_000e18);
        uint256 total = 2 * TARGET_10K + 5 * TARGET_1K;
        assertEq(usdc.balanceOf(address(fwd)), total);
        assertEq(usdc.balanceOf(destination), 0, "nothing reaches the client before the whole payment is converted");

        vm.prank(keeper);
        fwd.forward(total);
        assertEq(usdc.balanceOf(destination), total);
    }

    function test_swap_enforcesOracleFloorOnTheNet() public {
        // Permissionless path (no subsidy): a fill below Chainlink - 60 bps must revert in
        // the forwarder's own post-condition, not in the router (its minimum is zero).
        _fund(1_000e18);
        fwd.poke();
        skip(TRIGGER_DELAY + 1);
        oracle.set(1.14e8, block.timestamp);
        router.setNextOut(ORACLE_FLOOR_1K - 1);
        vm.prank(rando);
        vm.expectRevert(VortexForwarder.InsufficientOutput.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);

        router.setNextOut(ORACLE_FLOOR_1K);
        vm.prank(rando);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);
        assertEq(usdc.balanceOf(address(fwd)), ORACLE_FLOOR_1K);
    }

    function test_swap_revertsOnStaleOracle() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        oracle.set(1.14e8, block.timestamp);
        skip(53 hours); // just past the 52h P8 window
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.StalePrice.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);
    }

    function test_swap_publicOnlyAfterTriggerDelay() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);

        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotAuthorizedYet.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);

        fwd.poke();
        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotAuthorizedYet.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);

        skip(TRIGGER_DELAY + 1);
        oracle.set(1.14e8, block.timestamp);
        vm.prank(rando);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);
        assertEq(usdc.balanceOf(address(fwd)), TARGET_1K);
    }

    function test_swap_revertsOnZeroOrNegativePrice() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        oracle.set(0, block.timestamp);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.InvalidPrice.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);
        oracle.set(-1, block.timestamp);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.InvalidPrice.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);
    }

    function test_swap_amountBounds() public {
        _fund(15_000e18); // cap is 10k, minimum 25
        router.setNextOut(TARGET_10K);
        vm.startPrank(keeper);
        vm.expectRevert(VortexForwarder.BelowMinimum.selector);
        fwd.swap(REF, 0, 24e18, NO_CAP);
        vm.expectRevert(VortexForwarder.InvalidAmount.selector);
        fwd.swap(REF, 0, 10_000e18 + 1, NO_CAP); // above the cap
        fwd.swap(REF, 0, 10_000e18, NO_CAP);
        vm.expectRevert(VortexForwarder.InvalidAmount.selector);
        fwd.swap(REF, 0, 5_000e18 + 1, NO_CAP); // above the balance
        vm.stopPrank();
        assertEq(eure.balanceOf(address(fwd)), 5_000e18); // remainder awaits the next chunk
    }

    /// A partial swap must never restart the recovery clock: the marker keeps the time
    /// the batch opened, whatever remains on the clone.
    function test_swap_neverRetimesTheBatchMarker() public {
        _fund(15_000e18); // cap is 10k
        fwd.poke();
        uint64 opened = fwd.batchOpenedAt();
        assertGt(opened, 0);
        router.setNextOut(TARGET_10K);
        skip(1 hours);
        _keeperSwap(10_000e18);
        assertEq(eure.balanceOf(address(fwd)), 5_000e18);
        assertEq(fwd.batchOpenedAt(), opened, "a chunk swap re-timed the batch");
    }

    function test_swap_armsTheBatchMarkerWhenNobodyPoked() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        skip(3 hours);
        _keeperSwap(1_000e18);
        assertEq(fwd.batchOpenedAt(), block.timestamp);
    }

    function test_swapAndForward_pausedByGuardianOrGlobal() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        _keeperSwap(1_000e18);

        fwd.setGuardianPaused(true); // test contract is factory guardian
        vm.startPrank(keeper);
        vm.expectRevert(VortexForwarder.Paused.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);
        vm.expectRevert(VortexForwarder.Paused.selector);
        fwd.forward(TARGET_1K);
        vm.expectRevert(VortexForwarder.Paused.selector);
        fwd.forwardAll();
        vm.stopPrank();
        fwd.setGuardianPaused(false);

        factory.setGlobalPaused(true);
        vm.startPrank(keeper);
        vm.expectRevert(VortexForwarder.Paused.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);
        vm.expectRevert(VortexForwarder.Paused.selector);
        fwd.forward(TARGET_1K);
        vm.stopPrank();
    }

    function test_forward_keeperOnly_andBounded() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        _keeperSwap(1_000e18);

        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotKeeper.selector);
        fwd.forward(TARGET_1K);

        vm.startPrank(keeper);
        vm.expectRevert(VortexForwarder.InvalidAmount.selector);
        fwd.forward(0);
        vm.expectRevert(VortexForwarder.InvalidAmount.selector);
        fwd.forward(TARGET_1K + 1);
        fwd.forward(TARGET_1K - 1); // an explicit amount leaves the rest for a later forward
        vm.stopPrank();
        assertEq(usdc.balanceOf(destination), TARGET_1K - 1);
        assertEq(usdc.balanceOf(address(fwd)), 1);
        assertGt(fwd.batchOpenedAt(), 0, "USDC left behind keeps a batch open");
    }

    /// A forward closes the previous batch: whatever a younger payment left behind is
    /// timed from now, never from the older payment's arrival.
    function test_forward_retimesTheMarkerForRemainingFunds() public {
        _fund(1_000e18);
        fwd.poke();
        router.setNextOut(TARGET_1K);
        _keeperSwap(1_000e18);
        skip(1 hours);
        _fund(500e18); // a younger payment lands while the first is being forwarded
        vm.prank(keeper);
        fwd.forward(TARGET_1K);
        assertEq(fwd.batchOpenedAt(), block.timestamp, "remaining EURe belongs to a new batch");
    }

    function test_unsolicitedUsdc_forwardAllPushesEverything() public {
        usdc.mint(address(fwd), 500e6); // unsolicited direct transfer (R09)
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        _keeperSwap(1_000e18);
        vm.prank(keeper);
        fwd.forwardAll();
        assertEq(usdc.balanceOf(destination), TARGET_1K + 500e6);
        assertEq(fwd.batchOpenedAt(), 0);
    }

    function test_forwardAll_publicOnlyAfterTriggerDelay() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        _keeperSwap(1_000e18); // arms the marker

        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotAuthorizedYet.selector);
        fwd.forwardAll();

        skip(TRIGGER_DELAY + 1);
        vm.prank(rando);
        fwd.forwardAll(); // liveness fallback: a dead Vortex cannot trap converted funds
        assertEq(usdc.balanceOf(destination), TARGET_1K);

        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotAuthorizedYet.selector);
        fwd.forwardAll(); // the emptied clone closed its batch: the public path is armed again only by new funds
    }

    function test_reentrantRouter_blockedByGuard() public {
        MockReentrantRouter evil = new MockReentrantRouter();
        VortexForwarderFactory f2 = new VortexForwarderFactory(
            _config(address(evil), bytes32(0)), 1e18, 50_000e18, 25e18, 10_000e18, _route(500, 500)
        );
        f2.setKeeper(keeper, true);
        VortexForwarder fwd2 =
            VortexForwarder(f2.deployForwarder(destination, TARGET_PPM, FLOOR_PPM, bytes32(uint256(7))));
        eure.mint(address(fwd2), 1_000e18);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.Reentrancy.selector);
        fwd2.swap(REF, 0, 1_000e18, NO_CAP);
    }

    // ---------------------------------------------------------------- recovery

    function test_recover_keeperOnly_afterRecoveryDelay_toRecoveryWalletOnly() public {
        _fund(1_500e18); // 1000 converted, 500 stuck unconverted
        router.setNextOut(TARGET_1K);
        _keeperSwap(1_000e18);
        uint64 opened = fwd.batchOpenedAt();

        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotKeeper.selector);
        fwd.recover(500e18, TARGET_1K);

        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.DelayNotElapsed.selector);
        fwd.recover(500e18, TARGET_1K);

        vm.warp(opened + RECOVERY_DELAY - 1);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.DelayNotElapsed.selector);
        fwd.recover(500e18, TARGET_1K);

        vm.warp(opened + RECOVERY_DELAY);
        vm.prank(keeper);
        fwd.recover(500e18, TARGET_1K);
        assertEq(eure.balanceOf(recoveryWallet), 500e18);
        assertEq(usdc.balanceOf(recoveryWallet), TARGET_1K);
        assertEq(usdc.balanceOf(destination), 0, "a recovered payment never reaches the client");
        assertEq(fwd.batchOpenedAt(), 0);
    }

    function test_recover_requiresAnOpenBatch() public {
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.DelayNotElapsed.selector);
        fwd.recover(1, 0); // marker never armed: no batch to recover
    }

    function test_recover_amountsAreExplicitAndBounded() public {
        _fund(1_000e18);
        fwd.poke();
        skip(RECOVERY_DELAY);
        vm.startPrank(keeper);
        vm.expectRevert(VortexForwarder.InvalidAmount.selector);
        fwd.recover(0, 0);
        vm.expectRevert(VortexForwarder.InvalidAmount.selector);
        fwd.recover(1_000e18 + 1, 0);
        vm.expectRevert(VortexForwarder.InvalidAmount.selector);
        fwd.recover(0, 1);
        fwd.recover(400e18, 0); // only this payment's share: a younger payment may share the clone
        vm.stopPrank();
        assertEq(eure.balanceOf(recoveryWallet), 400e18);
        assertEq(eure.balanceOf(address(fwd)), 600e18);
        assertEq(fwd.batchOpenedAt(), block.timestamp, "what remains is timed as a new batch");
    }

    function test_recover_worksWhilePaused() public {
        _fund(1_000e18);
        fwd.poke();
        skip(RECOVERY_DELAY);
        fwd.setGuardianPaused(true);
        factory.setGlobalPaused(true);
        vm.prank(keeper);
        fwd.recover(1_000e18, 0); // pause-then-recover is the incident sequence
        assertEq(eure.balanceOf(recoveryWallet), 1_000e18);
    }

    /// Review r1 F1 regression, carried over: raising the tunable minSwapAmount above a
    /// funded balance must NOT let a poke() clear the marker — the batch is timed against
    /// the immutable MIN_SWAP_FLOOR and must survive any guardian action.
    function test_guardianCannotDisarmTheBatchMarker_byRaisingMinSwap() public {
        _fund(500e18);
        fwd.poke();
        uint64 opened = fwd.batchOpenedAt();
        assertGt(opened, 0);

        factory.setMinSwapAmount(1_000e18); // guardian raises threshold above balance
        skip(1 hours);
        fwd.poke(); // anyone can poke; marker must survive, un-retimed
        assertEq(fwd.batchOpenedAt(), opened, "guardian disarmed or re-timed the batch");
    }

    function test_poke_clearsAnArmedMarkerOnlyWhenEmpty() public {
        _fund(1_000e18);
        fwd.poke();
        assertGt(fwd.batchOpenedAt(), 0);
        fwd.poke();
        assertGt(fwd.batchOpenedAt(), 0);
        skip(RECOVERY_DELAY);
        vm.prank(keeper);
        fwd.recover(1_000e18, 0);
        assertEq(fwd.batchOpenedAt(), 0);
        usdc.mint(address(fwd), 1); // any USDC opens a batch: it must be forwarded or recovered
        fwd.poke();
        assertEq(fwd.batchOpenedAt(), block.timestamp);
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
        address deployed = factory.deployForwarder(destination, TARGET_PPM, FLOOR_PPM, salt);
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
        _keeperSwap(1_000e18);
        assertEq(router.lastPath(), _route(500, 500));
    }

    function test_routes_keeperSelectsAmongWhitelistedRoutes() public {
        bytes memory direct = abi.encodePacked(address(eure), uint24(3000), address(usdc));
        uint256 index = factory.addRoute(direct);
        assertEq(index, 1);

        _fund(1_000e18);
        router.setNextOut(TARGET_1K);
        vm.prank(keeper);
        fwd.swap(REF, 1, 1_000e18, NO_CAP);
        assertEq(router.lastPath(), direct);
    }

    function test_routes_unknownOrDisabledRouteReverts() public {
        _fund(1_000e18);
        router.setNextOut(TARGET_1K);

        vm.prank(keeper);
        vm.expectRevert(VortexForwarderFactory.InvalidRoute.selector);
        fwd.swap(REF, 7, 1_000e18, NO_CAP);

        factory.setRouteEnabled(0, false);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.InvalidRoute.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);

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
        _keeperSwap(1_000e18);
        assertEq(usdc.balanceOf(address(fwd)), TARGET_1K);
        assertEq(usdc.balanceOf(feeRecipient), 1_145e6 - TARGET_1K);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6);
    }

    function test_swap_feeCappedAtMaxFeePpm() public {
        _fund(1_000e18);
        router.setNextOut(1_200e6); // ~5% above the reference
        _keeperSwap(1_000e18);
        assertEq(usdc.balanceOf(feeRecipient), 12e6); // 1% of the fill, not the whole surplus
        assertEq(usdc.balanceOf(address(fwd)), 1_188e6);
    }

    function test_swap_betweenFloorAndTarget_noFeeNoSubsidy() public {
        _fund(1_000e18);
        router.setNextOut(1_138_400_000);
        _keeperSwap(1_000e18);
        assertEq(usdc.balanceOf(address(fwd)), 1_138_400_000);
        assertEq(usdc.balanceOf(feeRecipient), 0);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6);
    }

    function test_swap_belowFloor_vaultTopsUpTheCloneToTheFloor() public {
        _fund(1_000e18);
        router.setNextOut(1_136e6);
        _keeperSwap(1_000e18);
        uint256 subsidy = FLOOR_1K - 1_136e6; // 2.29 USDC
        assertEq(usdc.balanceOf(address(fwd)), FLOOR_1K, "the subsidy lands on the clone, forwarded with the payment");
        assertEq(usdc.balanceOf(destination), 0);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6 - subsidy);
        assertEq(vault.spentToday(), subsidy);
        assertEq(usdc.balanceOf(feeRecipient), 0);
    }

    function test_swap_rawFillBelowOracleFloor_isRescuedBySubsidy() public {
        _fund(1_000e18);
        router.setNextOut(1_133e6); // below Chainlink - 60 bps, within the vault's per-swap cap
        _keeperSwap(1_000e18);
        assertEq(usdc.balanceOf(address(fwd)), FLOOR_1K);
    }

    /// A+: the keeper's tier binds at execution. A fill that needs more than the caller
    /// allowed reverts the whole swap, whatever the vault would have paid.
    function test_swap_subsidyAboveKeeperCap_revertsTheWholeSwap() public {
        _fund(1_000e18);
        router.setNextOut(1_136e6); // needs 2.29 USDC
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.SubsidyAboveCap.selector);
        fwd.swap(REF, 0, 1_000e18, 2_290_000 - 1);
        assertEq(eure.balanceOf(address(fwd)), 1_000e18);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6);

        vm.prank(keeper);
        fwd.swap(REF, 0, 1_000e18, 2_290_000); // exactly the shortfall: allowed
        assertEq(usdc.balanceOf(address(fwd)), FLOOR_1K);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6 - 2_290_000);
    }

    function test_swap_keeperCapZero_onlyFillsAtOrAboveTheFloorSucceed() public {
        _fund(1_000e18);
        router.setNextOut(1_136e6);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.SubsidyAboveCap.selector);
        fwd.swap(REF, 0, 1_000e18, 0); // the ladder's first tiers: wait for the market
        router.setNextOut(FLOOR_1K);
        vm.prank(keeper);
        fwd.swap(REF, 0, 1_000e18, 0);
        assertEq(usdc.balanceOf(address(fwd)), FLOOR_1K);
    }

    function test_swap_subsidyOverCap_revertsTheWholeSwap() public {
        _fund(1_000e18);
        router.setNextOut(1_130e6); // needs 8.29 USDC; the cap is 50 bps of 1140 = 5.7 USDC
        vm.prank(keeper);
        vm.expectRevert(VortexSubsidyVault.SubsidyCapExceeded.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);
        assertEq(eure.balanceOf(address(fwd)), 1_000e18);
        assertEq(usdc.balanceOf(address(fwd)), 0);
    }

    function test_swap_subsidyNotDelivered_revertsTheWholeSwap() public {
        factory.setSubsidyVault(address(new NoopVault()));
        _fund(1_000e18);
        router.setNextOut(1_130e6); // below both floors; the 8.29 USDC top-up the vault "pays" never arrives
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.SubsidyUnavailable.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);
        assertEq(eure.balanceOf(address(fwd)), 1_000e18);
        assertEq(usdc.balanceOf(address(fwd)), 0);
    }

    function test_swap_subsidyOverBudget_reverts() public {
        vault.setDailyBudget(1e6);
        _fund(1_000e18);
        router.setNextOut(1_136e6);
        vm.prank(keeper);
        vm.expectRevert(VortexSubsidyVault.BudgetExhausted.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);
    }

    function test_swap_withoutVault_onlyFillsAtOrAboveTheFloorSucceed() public {
        factory.setSubsidyVault(address(0));
        _fund(1_000e18);
        router.setNextOut(1_136e6);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.SubsidyUnavailable.selector);
        fwd.swap(REF, 0, 1_000e18, NO_CAP);

        router.setNextOut(1_145e6);
        _keeperSwap(1_000e18);
        assertEq(usdc.balanceOf(address(fwd)), TARGET_1K);
    }

    /// Amendment 2026-09-18: a reference far below a stale Chainlink round no longer stops
    /// the swap — the client is settled to the Chainlink floor instead, at Vortex's cost,
    /// within the keeper's tier and the vault's cap.
    function test_swap_depeggedReference_isLiftedToTheOracleFloorWhenTheTierAndVaultAllow() public {
        _fund(1_000e18);
        uint256 lowReference = (REF * 9_910) / 10_000; // 90 bps below Chainlink: inside the band
        // The floor at that reference (~1128.05 USDC) is below Chainlink - 60 bps (1133.16):
        // the subsidy tops the client up to 1133.16, not to 1128.05.
        router.setNextOut(1_127e6);
        uint256 needed = ORACLE_FLOOR_1K - 1_127e6; // 6.16 USDC

        // The launch vault cap (50 bps of the reference value, ~5.65 USDC) cannot cover it.
        vm.prank(keeper);
        vm.expectRevert(VortexSubsidyVault.SubsidyCapExceeded.selector);
        fwd.swap(lowReference, 0, 1_000e18, NO_CAP);

        vault.setMaxSubsidyPpm(10_000); // the ladder's top: 100 bps
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.SubsidyAboveCap.selector);
        fwd.swap(lowReference, 0, 1_000e18, needed - 1); // the keeper's tier still binds

        vm.prank(keeper);
        fwd.swap(lowReference, 0, 1_000e18, needed);
        assertEq(usdc.balanceOf(address(fwd)), ORACLE_FLOOR_1K, "settled to the Chainlink floor");
        assertEq(usdc.balanceOf(address(vault)), 1_000e6 - needed);
    }

    /// A fill above the low reference's target but below the Chainlink floor: the fee
    /// gives way first, so the client still lands on the floor.
    function test_swap_depeggedReference_feeGivesWayBeforeTheOracleFloor() public {
        _fund(1_000e18);
        uint256 lowReference = (REF * 9_900) / 10_000; // 100 bps below Chainlink: the band's edge
        // The reference target is 1_127_189_250; the fill of 1140 is above it, but the fee may
        // only take what sits above the Chainlink floor (1_133_160_000).
        router.setNextOut(1_140e6);
        vm.prank(keeper);
        fwd.swap(lowReference, 0, 1_000e18, 0);
        assertEq(usdc.balanceOf(address(fwd)), ORACLE_FLOOR_1K);
        assertEq(usdc.balanceOf(feeRecipient), 1_140e6 - ORACLE_FLOOR_1K);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6, "no subsidy was needed");

        // Below the floor with a zero tier: the swap waits (reverts), it does not execute short.
        _fund(1_000e18);
        router.setNextOut(1_128e6);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.SubsidyAboveCap.selector);
        fwd.swap(lowReference, 0, 1_000e18, 0);
    }

    function test_swap_referenceOutsideTheBandReverts() public {
        _fund(1_000e18);
        router.setNextOut(1_150e6);
        vm.startPrank(keeper);
        vm.expectRevert(VortexForwarder.ReferenceOutOfBand.selector);
        fwd.swap((REF * 10_101) / 10_000, 0, 1_000e18, NO_CAP); // 101 bps above
        vm.expectRevert(VortexForwarder.ReferenceOutOfBand.selector);
        fwd.swap((REF * 9_899) / 10_000, 0, 1_000e18, NO_CAP); // 101 bps below
        vm.expectRevert(VortexForwarder.ReferenceOutOfBand.selector);
        fwd.swap(0, 0, 1_000e18, NO_CAP);
        fwd.swap((REF * 10_100) / 10_000, 0, 1_000e18, NO_CAP); // exactly 100 bps: allowed
        vm.stopPrank();
        assertGt(usdc.balanceOf(address(fwd)), 0);
    }

    function test_swap_permissionless_pricesAgainstChainlinkAndPaysNoSubsidy() public {
        _fund(1_000e18);
        fwd.poke();
        skip(TRIGGER_DELAY + 1);
        oracle.set(1.14e8, block.timestamp);
        router.setNextOut(1_136e6); // below the floor: the client simply gets the fill
        vm.prank(rando);
        fwd.swap(1, 0, 1_000e18, NO_CAP); // garbage reference is ignored on this path
        assertEq(usdc.balanceOf(address(fwd)), 1_136e6);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6);

        _fund(1_000e18);
        router.setNextOut(1_145e6); // above the Chainlink-based target: the fee still applies
        vm.prank(rando);
        fwd.swap(999, 0, 1_000e18, NO_CAP);
        assertEq(usdc.balanceOf(feeRecipient), 1_145e6 - TARGET_1K);
    }

    // ------------------------------------------------------- fee policy (P11)

    function test_feePolicy_validatedAtDeploy() public {
        vm.expectRevert(VortexForwarder.InvalidFeePolicy.selector);
        factory.deployForwarder(destination, 2_000, 1_500, bytes32(uint256(9))); // target above floor
        vm.expectRevert(VortexForwarder.InvalidFeePolicy.selector);
        factory.deployForwarder(destination, 1_000, 10_001, bytes32(uint256(9))); // floor above cap
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
        _keeperSwap(1_000e18);
        // The fee closes the gap to the OLD target: the announced policy never touches a swap.
        assertEq(usdc.balanceOf(feeRecipient), 1_145e6 - TARGET_1K);
        assertEq(usdc.balanceOf(address(fwd)), TARGET_1K);
    }
}
