// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20, IVortexForwarderFactory} from "./VortexForwarder.sol";

/// @title VortexSubsidyVault
/// @notice Treasury-funded USDC pool that tops a forwarder swap up to the client's floor
///         rate (docs/architecture-monerium-b2b-onramp.md, "Fees, reference rate and subsidy"). Only factory-registered
///         clones can draw; every draw is bounded by a per-swap cap (ppm of the swap's
///         reference value) and a daily budget; withdrawals can only go back to the
///         treasury. The vault never holds client funds — it only ever pushes Vortex
///         money to a clone's destination — so its guardian-settable limits bound Vortex's
///         exposure, not the client's.
contract VortexSubsidyVault {
    uint32 private constant PPM = 1_000_000;

    IERC20 public immutable USDC;
    address public immutable TREASURY;
    IVortexForwarderFactory public immutable FACTORY;

    /// @notice Per-swap cap, relative to the swap's reference value (amountIn x reference).
    uint32 public maxSubsidyPpm;
    /// @notice USDC base units the vault may pay out per UTC day.
    uint256 public dailyBudget;
    /// @dev UTC day index (block.timestamp / 1 days) the `spentToday` counter belongs to.
    uint256 public currentDay;
    uint256 public spentToday;
    bool public paused;

    event SubsidyPaid(address indexed forwarder, address indexed to, uint256 amount);
    event MaxSubsidyPpmSet(uint32 value);
    event DailyBudgetSet(uint256 value);
    event PausedSet(bool paused);
    event Withdrawn(uint256 amount);

    error NotGuardian();
    error NotForwarder();
    error VaultPaused();
    error SubsidyCapExceeded();
    error BudgetExhausted();
    error ZeroAddress();
    error TransferFailed();

    modifier onlyGuardian() {
        if (msg.sender != FACTORY.guardian()) revert NotGuardian();
        _;
    }

    constructor(
        IERC20 usdc,
        address treasury,
        IVortexForwarderFactory factory,
        uint32 initialMaxSubsidyPpm,
        uint256 initialDailyBudget
    ) {
        if (address(usdc) == address(0) || treasury == address(0) || address(factory) == address(0)) {
            revert ZeroAddress();
        }
        USDC = usdc;
        TREASURY = treasury;
        FACTORY = factory;
        maxSubsidyPpm = initialMaxSubsidyPpm;
        dailyBudget = initialDailyBudget;
    }

    /// @notice Pays `amount` USDC to `to` on behalf of the calling clone. Reverts — and
    ///         with it the clone's whole swap — whenever the cap, the budget, the pause
    ///         or the balance cannot cover it, so a swap is never partially subsidized.
    /// @param referenceOut The swap's reference value in USDC base units; the cap basis.
    function pay(address to, uint256 amount, uint256 referenceOut) external {
        if (!FACTORY.isForwarder(msg.sender)) revert NotForwarder();
        if (paused) revert VaultPaused();
        if (amount > (referenceOut * maxSubsidyPpm) / PPM) revert SubsidyCapExceeded();

        uint256 day = block.timestamp / 1 days;
        if (day != currentDay) {
            currentDay = day;
            spentToday = 0;
        }
        if (spentToday + amount > dailyBudget) revert BudgetExhausted();
        spentToday += amount;

        _transfer(to, amount);
        emit SubsidyPaid(msg.sender, to, amount);
    }

    // ----------------------------------------------------------- guardian authority

    function setMaxSubsidyPpm(uint32 value) external onlyGuardian {
        maxSubsidyPpm = value;
        emit MaxSubsidyPpmSet(value);
    }

    function setDailyBudget(uint256 value) external onlyGuardian {
        dailyBudget = value;
        emit DailyBudgetSet(value);
    }

    function setPaused(bool paused_) external onlyGuardian {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @notice Returns funds to the treasury. There is no other withdrawal target.
    function withdraw(uint256 amount) external onlyGuardian {
        _transfer(TREASURY, amount);
        emit Withdrawn(amount);
    }

    function _transfer(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success, bytes memory data) = address(USDC).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
