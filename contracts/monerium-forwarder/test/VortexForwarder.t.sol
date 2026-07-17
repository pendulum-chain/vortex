// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {VortexForwarder, IERC20, ISwapRouter02} from "../src/VortexForwarder.sol";
import {VortexForwarderFactory} from "../src/VortexForwarderFactory.sol";

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

    constructor(MockERC20 eure_, MockERC20 usdc_) {
        eure = eure_;
        usdc = usdc_;
    }

    function setNextOut(uint256 v) external {
        nextOut = v;
    }

    function exactInput(ISwapRouter02.ExactInputParams calldata params) external payable returns (uint256) {
        eure.transferFrom(msg.sender, address(this), params.amountIn);
        require(nextOut >= params.amountOutMinimum, "Too little received");
        usdc.mint(params.recipient, nextOut);
        return nextOut;
    }
}

/// Malicious router that tries to re-enter swapAndForward during the swap.
contract MockReentrantRouter {
    function exactInput(ISwapRouter02.ExactInputParams calldata) external payable returns (uint256) {
        VortexForwarder(msg.sender).swapAndForward(); // must revert via reentrancy guard
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

    uint256 attestorPk = 0xA11CE;
    address attestor;
    address feeRecipient = makeAddr("feeRecipient");
    address destination = makeAddr("destination");
    address fallbackAddr = makeAddr("fallbackAddr");
    address keeper = makeAddr("keeper");
    address rando = makeAddr("rando");

    uint256 constant TRIGGER_DELAY = 24 hours;
    uint256 constant SWEEP_DELAY = 60 days;

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
                maxOracleAge: 26 hours,
                slippageBps: 100,
                maxFeeBps: 100,
                sweepDelay: SWEEP_DELAY,
                triggerDelay: TRIGGER_DELAY,
                poolFeeEureEurc: 500,
                poolFeeEurcUsdc: 500,
                recoveryHash: bytes32(0)
            }),
            1e18, // MIN_SWAP_FLOOR
            50_000e18, // CAP_CEILING
            25e18, // minSwapAmount
            10_000e18 // perSwapCap
        );
        factory.setKeeper(keeper, true);
        fwd = VortexForwarder(factory.deployForwarder(destination, fallbackAddr, 0, bytes32(uint256(1))));
    }

    // ---------------------------------------------------------------- helpers

    function _attest(address forwarder, bytes32 hash) internal view returns (bytes memory) {
        bytes32 bound = keccak256(abi.encodePacked(forwarder, hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorPk, bound);
        return abi.encodePacked(r, s, v);
    }

    function _fund(uint256 amount) internal {
        eure.mint(address(fwd), amount);
    }

    // ---------------------------------------------------------------- EIP-1271

    function test_linkSignature_valid_bothHashSchemes() public view {
        bytes32 h191 = fwd.LINK_HASH_191();
        bytes32 hRaw = fwd.LINK_HASH_RAW();
        assertEq(fwd.isValidSignature(h191, _attest(address(fwd), h191)), bytes4(0x1626ba7e));
        assertEq(fwd.isValidSignature(hRaw, _attest(address(fwd), hRaw)), bytes4(0x1626ba7e));
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
        bytes32 bound = keccak256(abi.encodePacked(address(fwd), h));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, bound);
        assertEq(fwd.isValidSignature(h, abi.encodePacked(r, s, v)), bytes4(0xffffffff));
    }

    function test_linkSignature_rejectsCrossCloneReplay() public {
        VortexForwarder other =
            VortexForwarder(factory.deployForwarder(destination, fallbackAddr, 0, bytes32(uint256(2))));
        bytes32 h = fwd.LINK_HASH_191();
        // Signature bound to `fwd` must not validate on `other`.
        assertEq(other.isValidSignature(h, _attest(address(fwd), h)), bytes4(0xffffffff));
    }

    // ---------------------------------------------------------------- init

    function test_initialize_onlyFactory_andOnce() public {
        vm.expectRevert(VortexForwarder.NotFactory.selector);
        fwd.initialize(rando, rando, 0);

        vm.prank(address(factory));
        vm.expectRevert(VortexForwarder.AlreadyInitialized.selector);
        fwd.initialize(rando, rando, 0);
    }

    function test_implementation_isBricked() public {
        VortexForwarder impl = VortexForwarder(factory.implementation());
        vm.prank(address(factory));
        vm.expectRevert(VortexForwarder.AlreadyInitialized.selector);
        impl.initialize(rando, rando, 0);
    }

    // ---------------------------------------------------------------- swap

    function test_swapAndForward_happyPath_forwardsToDestination() public {
        _fund(1_000e18);
        // minOut = 1000 * 1.14 * 0.99 = 1128.6 USDC
        router.setNextOut(1_130e6);
        vm.prank(keeper);
        fwd.swapAndForward();
        assertEq(usdc.balanceOf(destination), 1_130e6);
        assertEq(eure.balanceOf(address(fwd)), 0);
        assertEq(eure.allowance(address(fwd), address(router)), 0);
    }

    function test_swapAndForward_enforcesOracleMinOut() public {
        _fund(1_000e18);
        router.setNextOut(1_100e6); // below 1128.6 -> router-side minOut check fires
        vm.prank(keeper);
        vm.expectRevert("Too little received");
        fwd.swapAndForward();
    }

    function test_swapAndForward_revertsOnStaleOracle() public {
        _fund(1_000e18);
        router.setNextOut(1_130e6);
        oracle.set(1.14e8, block.timestamp);
        skip(27 hours);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.StalePrice.selector);
        fwd.swapAndForward();
    }

    function test_swapAndForward_publicOnlyAfterTriggerDelay() public {
        _fund(1_000e18);
        router.setNextOut(1_130e6);

        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotAuthorizedYet.selector);
        fwd.swapAndForward();

        fwd.poke();
        vm.prank(rando);
        vm.expectRevert(VortexForwarder.NotAuthorizedYet.selector);
        fwd.swapAndForward();

        skip(TRIGGER_DELAY + 1);
        oracle.set(1.14e8, block.timestamp);
        vm.prank(rando);
        fwd.swapAndForward();
        assertEq(usdc.balanceOf(destination), 1_130e6);
    }

    function test_swapAndForward_respectsPerSwapCap() public {
        _fund(15_000e18); // cap is 10k
        // minOut for 10k at 1.14*0.99 = 11286 USDC
        router.setNextOut(11_290e6);
        vm.prank(keeper);
        fwd.swapAndForward();
        assertEq(eure.balanceOf(address(fwd)), 5_000e18); // remainder awaits next execution
    }

    function test_swapAndForward_feeSkim() public {
        VortexForwarder feeFwd =
            VortexForwarder(factory.deployForwarder(destination, fallbackAddr, 50, bytes32(uint256(3))));
        eure.mint(address(feeFwd), 1_000e18);
        router.setNextOut(1_130e6);
        vm.prank(keeper);
        feeFwd.swapAndForward();
        uint256 fee = (1_130e6 * 50) / 10_000;
        assertEq(usdc.balanceOf(feeRecipient), fee);
        assertEq(usdc.balanceOf(destination), 1_130e6 - fee);
    }

    function test_swapAndForward_pausedByGuardianOrClientOrGlobal() public {
        _fund(1_000e18);
        router.setNextOut(1_130e6);

        fwd.setGuardianPaused(true); // test contract is factory guardian
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.Paused.selector);
        fwd.swapAndForward();
        fwd.setGuardianPaused(false);

        vm.prank(fallbackAddr);
        fwd.setClientPaused(true);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.Paused.selector);
        fwd.swapAndForward();
        vm.prank(fallbackAddr);
        fwd.setClientPaused(false);

        factory.setGlobalPaused(true);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.Paused.selector);
        fwd.swapAndForward();
    }

    function test_unsolicitedUsdc_forwardedWithNextSwap() public {
        usdc.mint(address(fwd), 500e6); // unsolicited direct transfer (R09)
        _fund(1_000e18);
        router.setNextOut(1_130e6);
        vm.prank(keeper);
        fwd.swapAndForward();
        assertEq(usdc.balanceOf(destination), 1_130e6 + 500e6);
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
                maxOracleAge: 26 hours,
                slippageBps: 100,
                maxFeeBps: 100,
                sweepDelay: SWEEP_DELAY,
                triggerDelay: TRIGGER_DELAY,
                poolFeeEureEurc: 500,
                poolFeeEurcUsdc: 500,
                recoveryHash: bytes32(0)
            }),
            1e18,
            50_000e18,
            25e18,
            10_000e18
        );
        f2.setKeeper(keeper, true);
        VortexForwarder fwd2 = VortexForwarder(f2.deployForwarder(destination, fallbackAddr, 0, bytes32(uint256(7))));
        eure.mint(address(fwd2), 1_000e18);
        vm.prank(keeper);
        vm.expectRevert(VortexForwarder.Reentrancy.selector);
        fwd2.swapAndForward();
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

    function test_fallbackSweep_worksWhilePaused() public {
        _fund(500e18);
        fwd.setGuardianPaused(true);
        vm.prank(fallbackAddr);
        fwd.sweep(address(eure), fallbackAddr);
        assertEq(eure.balanceOf(fallbackAddr), 500e18);
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
        address deployed = factory.deployForwarder(destination, fallbackAddr, 0, salt);
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

    function test_feeBps_cappedAtMax() public {
        vm.expectRevert(VortexForwarder.FeeTooHigh.selector);
        factory.deployForwarder(destination, fallbackAddr, 101, bytes32(uint256(9)));
    }
}
