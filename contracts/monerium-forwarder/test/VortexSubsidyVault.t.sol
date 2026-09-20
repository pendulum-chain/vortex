// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20, IVortexForwarderFactory} from "../src/VortexForwarder.sol";
import {VortexSubsidyVault} from "../src/VortexSubsidyVault.sol";
import {MockERC20} from "./VortexForwarder.t.sol";

/// Minimal stand-in for the factory: the vault only reads the guardian and the clone registry.
contract MockFactory {
    address public guardian;
    mapping(address => bool) public isForwarder;

    constructor(address guardian_) {
        guardian = guardian_;
    }

    function register(address forwarder, bool enabled) external {
        isForwarder[forwarder] = enabled;
    }
}

contract VortexSubsidyVaultTest is Test {
    MockERC20 usdc;
    MockFactory factory;
    VortexSubsidyVault vault;

    address treasury = makeAddr("treasury");
    address forwarder = makeAddr("forwarder");
    address destination = makeAddr("destination");
    address rando = makeAddr("rando");

    uint32 constant MAX_SUBSIDY_PPM = 5_000; // 50 bps
    uint256 constant DAILY_BUDGET = 100e6; // 100 USDC
    uint256 constant REFERENCE_OUT = 10_000e6; // a EUR 10k swap at reference -> cap = 50 USDC

    function setUp() public {
        usdc = new MockERC20("USDC", 6);
        factory = new MockFactory(address(this));
        factory.register(forwarder, true);
        vault = new VortexSubsidyVault(
            IERC20(address(usdc)), treasury, IVortexForwarderFactory(address(factory)), MAX_SUBSIDY_PPM, DAILY_BUDGET
        );
        usdc.mint(address(vault), 1_000e6);
    }

    function test_pay_onlyRegisteredForwarders() public {
        vm.prank(rando);
        vm.expectRevert(VortexSubsidyVault.NotForwarder.selector);
        vault.pay(destination, 1e6, REFERENCE_OUT);

        factory.register(forwarder, false);
        vm.prank(forwarder);
        vm.expectRevert(VortexSubsidyVault.NotForwarder.selector);
        vault.pay(destination, 1e6, REFERENCE_OUT);
    }

    function test_pay_transfersAndCountsAgainstTheDay() public {
        vm.prank(forwarder);
        vault.pay(destination, 30e6, REFERENCE_OUT);
        assertEq(usdc.balanceOf(destination), 30e6);
        assertEq(vault.spentToday(), 30e6);
        assertEq(vault.currentDay(), block.timestamp / 1 days);
    }

    function test_pay_enforcesPerSwapCap() public {
        vm.prank(forwarder);
        vault.pay(destination, 50e6, REFERENCE_OUT); // exactly the cap is fine
        vm.prank(forwarder);
        vm.expectRevert(VortexSubsidyVault.SubsidyCapExceeded.selector);
        vault.pay(destination, 50e6 + 1, REFERENCE_OUT);
    }

    function test_pay_enforcesDailyBudget_andResetsNextDay() public {
        vm.startPrank(forwarder);
        vault.pay(destination, 50e6, REFERENCE_OUT);
        vault.pay(destination, 50e6, REFERENCE_OUT); // budget fully used
        vm.expectRevert(VortexSubsidyVault.BudgetExhausted.selector);
        vault.pay(destination, 1, REFERENCE_OUT);

        vm.warp((block.timestamp / 1 days + 1) * 1 days); // next UTC day
        vault.pay(destination, 50e6, REFERENCE_OUT);
        assertEq(vault.spentToday(), 50e6);
        vm.stopPrank();
    }

    function test_pay_revertsWhenPausedOrUnderfunded() public {
        vault.setPaused(true);
        vm.prank(forwarder);
        vm.expectRevert(VortexSubsidyVault.VaultPaused.selector);
        vault.pay(destination, 1e6, REFERENCE_OUT);
        vault.setPaused(false);

        vault.withdraw(1_000e6); // drain to treasury
        assertEq(usdc.balanceOf(treasury), 1_000e6);
        vm.prank(forwarder);
        vm.expectRevert(VortexSubsidyVault.TransferFailed.selector);
        vault.pay(destination, 1e6, REFERENCE_OUT);
    }

    function test_guardianAuthority_gated() public {
        vm.startPrank(rando);
        vm.expectRevert(VortexSubsidyVault.NotGuardian.selector);
        vault.setMaxSubsidyPpm(1);
        vm.expectRevert(VortexSubsidyVault.NotGuardian.selector);
        vault.setDailyBudget(1);
        vm.expectRevert(VortexSubsidyVault.NotGuardian.selector);
        vault.setPaused(true);
        vm.expectRevert(VortexSubsidyVault.NotGuardian.selector);
        vault.withdraw(1);
        vm.stopPrank();

        vault.setMaxSubsidyPpm(1_000);
        vault.setDailyBudget(1e6);
        assertEq(vault.maxSubsidyPpm(), 1_000);
        assertEq(vault.dailyBudget(), 1e6);
        vm.prank(forwarder);
        vm.expectRevert(VortexSubsidyVault.SubsidyCapExceeded.selector);
        vault.pay(destination, 10e6 + 1, REFERENCE_OUT); // new cap: 10 USDC
    }

    function test_withdraw_onlyEverReachesTreasury() public {
        vault.withdraw(400e6);
        assertEq(usdc.balanceOf(treasury), 400e6);
        assertEq(usdc.balanceOf(address(vault)), 600e6);
        // There is no withdrawal signature that takes a recipient.
        (bool ok,) = address(vault).call(abi.encodeWithSignature("withdraw(address,uint256)", rando, 1));
        assertFalse(ok);
    }
}
