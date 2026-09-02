// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {VortexForwarder} from "./VortexForwarder.sol";

/// @title VortexForwarderFactory
/// @notice Deploys per-client VortexForwarder clones (EIP-1167, CREATE2) and holds the
///         guardian role plus bounded operational parameters shared by all clones
///         (implementation plan §2.2; parameter bounds are registry P6/P7).
contract VortexForwarderFactory {
    address public immutable implementation;

    /// @dev Immutable bounds for the operational parameters (R10): the guardian can
    ///      tune values only inside [floor, ceiling]; the bounds themselves never move.
    uint256 public immutable MIN_SWAP_FLOOR;
    uint256 public immutable CAP_CEILING;

    address public guardian;
    address public pendingGuardian;
    mapping(address => bool) public isKeeper;
    bool public globalPaused;

    uint256 public minSwapAmount; // registry P6
    uint256 public perSwapCap; // registry P7

    mapping(address => bool) public isForwarder;

    event ForwarderDeployed(
        address indexed forwarder, address indexed destination, address fallbackAddress, uint16 feeBps, bytes32 salt
    );
    event KeeperSet(address indexed keeper, bool enabled);
    event GlobalPausedSet(bool paused);
    event MinSwapAmountSet(uint256 value);
    event PerSwapCapSet(uint256 value);
    event GuardianTransferStarted(address indexed current, address indexed pending);
    event GuardianTransferred(address indexed previous, address indexed current);

    error NotGuardian();
    error NotPendingGuardian();
    error OutOfBounds();
    error CloneFailed();

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    constructor(
        VortexForwarder.ImmutableConfig memory cfg,
        uint256 minSwapFloor,
        uint256 capCeiling,
        uint256 initialMinSwapAmount,
        uint256 initialPerSwapCap
    ) {
        guardian = msg.sender;
        implementation = address(new VortexForwarder(cfg));
        MIN_SWAP_FLOOR = minSwapFloor;
        CAP_CEILING = capCeiling;
        _setMinSwapAmount(initialMinSwapAmount);
        _setPerSwapCap(initialPerSwapCap);
    }

    // ------------------------------------------------------------- deployment

    /// @notice Deploy and initialize a client forwarder in one transaction. The clone
    ///         address is deterministic (CREATE2) so it can be communicated/linked
    ///         reliably; predict it with `predictAddress` before deploying.
    function deployForwarder(address destination, address fallbackAddress, uint16 feeBps, bytes32 salt)
        external
        onlyGuardian
        returns (address forwarder)
    {
        forwarder = _cloneDeterministic(implementation, salt);
        VortexForwarder(forwarder).initialize(destination, fallbackAddress, feeBps);
        isForwarder[forwarder] = true;
        emit ForwarderDeployed(forwarder, destination, fallbackAddress, feeBps, salt);
    }

    function predictAddress(bytes32 salt) external view returns (address) {
        bytes32 initCodeHash = keccak256(_cloneInitCode(implementation));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)))));
    }

    // ------------------------------------------------------------- governance

    function setKeeper(address keeper, bool enabled) external onlyGuardian {
        isKeeper[keeper] = enabled;
        emit KeeperSet(keeper, enabled);
    }

    function setGlobalPaused(bool paused) external onlyGuardian {
        globalPaused = paused;
        emit GlobalPausedSet(paused);
    }

    function setMinSwapAmount(uint256 value) external onlyGuardian {
        _setMinSwapAmount(value);
    }

    function setPerSwapCap(uint256 value) external onlyGuardian {
        _setPerSwapCap(value);
    }

    /// @dev Two-step transfer: guardian is load-bearing for every clone's pause and
    ///      keeper gating, so a fat-fingered transfer must not be possible.
    function transferGuardian(address newGuardian) external onlyGuardian {
        pendingGuardian = newGuardian;
        emit GuardianTransferStarted(guardian, newGuardian);
    }

    function acceptGuardian() external {
        if (msg.sender != pendingGuardian) revert NotPendingGuardian();
        emit GuardianTransferred(guardian, msg.sender);
        guardian = msg.sender;
        pendingGuardian = address(0);
    }

    // ---------------------------------------------------------------- helpers

    function _setMinSwapAmount(uint256 value) internal {
        if (value < MIN_SWAP_FLOOR || value > perSwapCap && perSwapCap != 0) revert OutOfBounds();
        minSwapAmount = value;
        emit MinSwapAmountSet(value);
    }

    function _setPerSwapCap(uint256 value) internal {
        if (value > CAP_CEILING || value < minSwapAmount) revert OutOfBounds();
        perSwapCap = value;
        emit PerSwapCapSet(value);
    }

    /// @dev Standard EIP-1167 minimal proxy init code for `target`.
    function _cloneInitCode(address target) internal pure returns (bytes memory) {
        return abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73", target, hex"5af43d82803e903d91602b57fd5bf3"
        );
    }

    function _cloneDeterministic(address target, bytes32 salt) internal returns (address instance) {
        bytes memory initCode = _cloneInitCode(target);
        // solhint-disable-next-line no-inline-assembly
        assembly {
            instance := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        if (instance == address(0)) revert CloneFailed();
    }
}
