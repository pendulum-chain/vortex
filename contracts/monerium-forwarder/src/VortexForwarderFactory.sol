// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {VortexForwarder} from "./VortexForwarder.sol";

/// @title VortexForwarderFactory
/// @notice Deploys per-client VortexForwarder clones (EIP-1167, CREATE2) and holds the
///         guardian role plus bounded operational parameters shared by all clones
///         (implementation plan §2.2; parameter bounds are registry P6/P7).
contract VortexForwarderFactory {
    address public immutable implementation;

    /// @dev Route validation only ever admits paths between these three tokens.
    address public immutable EURE;
    address public immutable EURC;
    address public immutable USDC;

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

    /// @notice Swap routes clones may execute (Uniswap V3 packed paths). Guardian-managed
    ///         without a timelock: every entry is validated to run only between EURe, EURC
    ///         and USDC on the implementation's immutable router, and the client's outcome
    ///         is bounded by the oracle floor whichever route is chosen. Entries are never
    ///         removed, only disabled, so an index stays stable for the keeper.
    struct Route {
        bytes path;
        bool enabled;
    }

    Route[] private _routes;

    /// @notice The VortexSubsidyVault clones draw from; address(0) disables subsidies.
    ///         Guardian-settable without a timelock: the vault only ever pays Vortex
    ///         money to a clone's fixed destination, so a swap cannot be harmed by it.
    address public subsidyVault;

    event ForwarderDeployed(
        address indexed forwarder,
        address indexed destination,
        address fallbackAddress,
        uint32 targetPpm,
        uint32 floorPpm,
        bytes32 salt
    );
    event KeeperSet(address indexed keeper, bool enabled);
    event GlobalPausedSet(bool paused);
    event MinSwapAmountSet(uint256 value);
    event PerSwapCapSet(uint256 value);
    event SubsidyVaultSet(address indexed vault);
    event RouteAdded(uint256 indexed index, bytes path);
    event RouteEnabledSet(uint256 indexed index, bool enabled);
    event GuardianTransferStarted(address indexed current, address indexed pending);
    event GuardianTransferred(address indexed previous, address indexed current);

    error NotGuardian();
    error NotPendingGuardian();
    error OutOfBounds();
    error CloneFailed();
    error InvalidRoute();

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    constructor(
        VortexForwarder.ImmutableConfig memory cfg,
        uint256 minSwapFloor,
        uint256 capCeiling,
        uint256 initialMinSwapAmount,
        uint256 initialPerSwapCap,
        bytes memory initialRoute
    ) {
        guardian = msg.sender;
        implementation = address(new VortexForwarder(cfg));
        EURE = cfg.eure;
        EURC = cfg.eurc;
        USDC = cfg.usdc;
        MIN_SWAP_FLOOR = minSwapFloor;
        CAP_CEILING = capCeiling;
        _setMinSwapAmount(initialMinSwapAmount);
        _setPerSwapCap(initialPerSwapCap);
        _addRoute(initialRoute);
    }

    // ------------------------------------------------------------- deployment

    /// @notice Deploy and initialize a client forwarder in one transaction. The clone
    ///         address is deterministic (CREATE2) so it can be communicated/linked
    ///         reliably; predict it with `predictAddress` before deploying.
    function deployForwarder(
        address destination,
        address fallbackAddress,
        uint32 targetPpm,
        uint32 floorPpm,
        bytes32 salt
    ) external onlyGuardian returns (address forwarder) {
        forwarder = _cloneDeterministic(implementation, salt);
        VortexForwarder(forwarder).initialize(destination, fallbackAddress, targetPpm, floorPpm);
        isForwarder[forwarder] = true;
        emit ForwarderDeployed(forwarder, destination, fallbackAddress, targetPpm, floorPpm, salt);
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

    function setSubsidyVault(address vault) external onlyGuardian {
        subsidyVault = vault;
        emit SubsidyVaultSet(vault);
    }

    // ------------------------------------------------------------------ routes

    function addRoute(bytes calldata path) external onlyGuardian returns (uint256 index) {
        return _addRoute(path);
    }

    function setRouteEnabled(uint256 index, bool enabled) external onlyGuardian {
        if (index >= _routes.length) revert InvalidRoute();
        _routes[index].enabled = enabled;
        emit RouteEnabledSet(index, enabled);
    }

    function routeCount() external view returns (uint256) {
        return _routes.length;
    }

    function route(uint256 index) external view returns (bytes memory path, bool enabled) {
        if (index >= _routes.length) revert InvalidRoute();
        Route storage entry = _routes[index];
        return (entry.path, entry.enabled);
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

    /// @dev Admits only EURe -> USDC or EURe -> EURC -> USDC over Uniswap V3's four fee
    ///      tiers (packed path: token, fee, token[, fee, token]). Anything else, including
    ///      any other intermediate token, is rejected so a route can never introduce a
    ///      token the forwarder does not already trust.
    function _addRoute(bytes memory path) internal returns (uint256 index) {
        uint256 hops;
        if (path.length == 43) hops = 1;
        else if (path.length == 66) hops = 2;
        else revert InvalidRoute();

        if (_addressAt(path, 0) != EURE) revert InvalidRoute();
        if (_addressAt(path, path.length - 20) != USDC) revert InvalidRoute();
        if (hops == 2 && _addressAt(path, 23) != EURC) revert InvalidRoute();
        for (uint256 i = 0; i < hops; i++) {
            if (!_isKnownFeeTier(_feeAt(path, 20 + i * 23))) revert InvalidRoute();
        }

        index = _routes.length;
        _routes.push(Route({path: path, enabled: true}));
        emit RouteAdded(index, path);
    }

    function _isKnownFeeTier(uint24 fee) internal pure returns (bool) {
        return fee == 100 || fee == 500 || fee == 3000 || fee == 10000;
    }

    function _addressAt(bytes memory data, uint256 offset) internal pure returns (address value) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            value := shr(96, mload(add(add(data, 32), offset)))
        }
    }

    function _feeAt(bytes memory data, uint256 offset) internal pure returns (uint24 value) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            value := shr(232, mload(add(add(data, 32), offset)))
        }
    }

    /// @dev Standard EIP-1167 minimal proxy init code for `target`.
    function _cloneInitCode(address target) internal pure returns (bytes memory) {
        return
            abi.encodePacked(hex"3d602d80600a3d3981f3363d3d373d3d3d363d73", target, hex"5af43d82803e903d91602b57fd5bf3");
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
