// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// Uniswap V3 SwapRouter02-style multi-hop interface (no deadline field; registry P10
/// tracks the final router pin — if classic SwapRouter is chosen, add the deadline).
interface ISwapRouter02 {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface IVortexForwarderFactory {
    function guardian() external view returns (address);
    function isKeeper(address account) external view returns (bool);
    function globalPaused() external view returns (bool);
    function minSwapAmount() external view returns (uint256);
    function perSwapCap() external view returns (uint256);
}

/// @title VortexForwarder
/// @notice Per-client forwarding account for the Monerium B2B onramp
///         (docs/prd/monerium-eur-usdc-onramp-b2b-variant.md, implementation plan §2).
///         Deployed as an EIP-1167 clone by VortexForwarderFactory; the clone address is
///         linked to the client's Monerium profile, EURe mints land here, and the only
///         ways assets can ever leave are:
///           1. the pinned EURe -> EURC -> USDC swap (oracle-checked minOut, output to self),
///           2. USDC to the client's `destination` (plus fee <= feeBps to FEE_RECIPIENT),
///           3. EURe to the client's `fallbackAddress` (delayed permissionless sweep),
///           4. anything, by the client's `fallbackAddress` itself (`sweep`).
///         Vortex (guardian/keeper) can execute the policy, pause it, and nothing else.
/// @dev EIP-1271 is deliberately constrained to the fixed Monerium link message hash
///      signed by ATTESTOR and bound to this clone's address — it must never validate
///      redeem orders (that would hand Vortex fiat-payout power; see variant doc §3.2).
contract VortexForwarder {
    // ---------------------------------------------------------------- constants

    bytes4 private constant EIP1271_MAGIC = 0x1626ba7e;
    bytes4 private constant EIP1271_FAIL = 0xffffffff;
    uint16 private constant BPS = 10_000;

    string public constant LINK_MESSAGE = "I hereby declare that I am the address owner.";

    // ------------------------------------------------------------- immutables
    // Immutables live in the implementation's code and are shared by all clones.

    IERC20 public immutable EURE;
    IERC20 public immutable EURC;
    IERC20 public immutable USDC;
    ISwapRouter02 public immutable ROUTER;
    AggregatorV3Interface public immutable ORACLE; // Chainlink EUR/USD
    uint8 public immutable ORACLE_DECIMALS;
    IVortexForwarderFactory public immutable FACTORY;
    address public immutable ATTESTOR; // signs the Monerium link attestation
    address public immutable FEE_RECIPIENT;
    uint256 public immutable MAX_ORACLE_AGE; // registry P8
    uint16 public immutable SLIPPAGE_BPS; // registry P1
    uint16 public immutable MAX_FEE_BPS; // registry P2
    uint256 public immutable SWEEP_DELAY; // registry P3
    uint256 public immutable TRIGGER_DELAY; // registry P4
    uint24 public immutable POOL_FEE_EURE_EURC; // registry P10
    uint24 public immutable POOL_FEE_EURC_USDC; // registry P10

    /// @dev EIP-191 personal-message hash and raw keccak of LINK_MESSAGE. Monerium's
    ///      exact hashing scheme is a G0 spike output (task 4); accepting both is safe
    ///      because both encode only the fixed link message.
    bytes32 public immutable LINK_HASH_191;
    bytes32 public immutable LINK_HASH_RAW;

    /// @dev Monerium issuer-recovery message hash (registry T1). bytes32(0) = disabled.
    ///      When enabled, allows Monerium's recovery burn to validate against this
    ///      contract; payout is constrained by Monerium to the client's own verified
    ///      bank account, so this grants Vortex no disposal power.
    bytes32 public immutable RECOVERY_HASH;

    struct ImmutableConfig {
        address eure;
        address eurc;
        address usdc;
        address router;
        address oracle;
        address attestor;
        address feeRecipient;
        uint256 maxOracleAge;
        uint16 slippageBps;
        uint16 maxFeeBps;
        uint256 sweepDelay;
        uint256 triggerDelay;
        uint24 poolFeeEureEurc;
        uint24 poolFeeEurcUsdc;
        bytes32 recoveryHash;
    }

    // ---------------------------------------------------------------- storage
    // Per-clone state, set once by the factory in the deployment transaction.

    bool public initialized;
    address public destination; // client's payout address (may be a CEX deposit address)
    address public fallbackAddress; // client's self-custodied recovery address (mandatory)
    uint16 public feeBps; // immutable post-init (registry B1; pilot = 0)

    bool public clientPaused; // set by fallbackAddress only
    bool public guardianPaused; // set by guardian only (protective-only; cannot block fallback paths)

    /// @dev R03 marker: when the EURe balance first crossed minSwapAmount with no
    ///      successful swap since. Start time for TRIGGER_DELAY and SWEEP_DELAY.
    uint64 public strandedSince;

    uint256 private _reentrancyGuard;

    // ----------------------------------------------------------------- events

    event Initialized(address destination, address fallbackAddress, uint16 feeBps);
    event Poked(uint64 strandedSince);
    event SwapExecuted(address indexed caller, uint256 eureIn, uint256 usdcOut, uint256 fee, uint256 forwarded);
    event StrandedEureSwept(address indexed caller, uint256 amount);
    event DestinationUpdated(address previous, address current);
    event FallbackAddressUpdated(address previous, address current);
    event ClientPausedSet(bool paused);
    event GuardianPausedSet(bool paused);
    event TokenSwept(address indexed token, address indexed to, uint256 amount);

    // ----------------------------------------------------------------- errors

    error AlreadyInitialized();
    error NotFactory();
    error NotFallbackAddress();
    error NotGuardian();
    error NotAuthorizedYet();
    error Paused();
    error ZeroAddress();
    error InvalidConfigAddress();
    error FeeTooHigh();
    error BelowMinimum();
    error StalePrice();
    error InvalidPrice();
    error InsufficientOutput();
    error Overspend();
    error NotStranded();
    error DelayNotElapsed();
    error TransferFailed();
    error Reentrancy();

    // ------------------------------------------------------------ constructor

    constructor(ImmutableConfig memory cfg) {
        EURE = IERC20(cfg.eure);
        EURC = IERC20(cfg.eurc);
        USDC = IERC20(cfg.usdc);
        ROUTER = ISwapRouter02(cfg.router);
        ORACLE = AggregatorV3Interface(cfg.oracle);
        ORACLE_DECIMALS = AggregatorV3Interface(cfg.oracle).decimals();
        FACTORY = IVortexForwarderFactory(msg.sender);
        ATTESTOR = cfg.attestor;
        FEE_RECIPIENT = cfg.feeRecipient;
        MAX_ORACLE_AGE = cfg.maxOracleAge;
        SLIPPAGE_BPS = cfg.slippageBps;
        MAX_FEE_BPS = cfg.maxFeeBps;
        SWEEP_DELAY = cfg.sweepDelay;
        TRIGGER_DELAY = cfg.triggerDelay;
        POOL_FEE_EURE_EURC = cfg.poolFeeEureEurc;
        POOL_FEE_EURC_USDC = cfg.poolFeeEurcUsdc;
        RECOVERY_HASH = cfg.recoveryHash;

        LINK_HASH_RAW = keccak256(bytes(LINK_MESSAGE));
        LINK_HASH_191 = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n45", LINK_MESSAGE));

        // Brick the implementation itself; only clones can be initialized.
        initialized = true;
    }

    // ------------------------------------------------------------- modifiers

    modifier nonReentrant() {
        if (_reentrancyGuard != 0) revert Reentrancy();
        _reentrancyGuard = 1;
        _;
        _reentrancyGuard = 0;
    }

    modifier onlyFallback() {
        if (msg.sender != fallbackAddress) revert NotFallbackAddress();
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != FACTORY.guardian()) revert NotGuardian();
        _;
    }

    // ---------------------------------------------------------- initialization

    /// @notice Called by the factory in the same transaction as clone deployment.
    function initialize(address destination_, address fallbackAddress_, uint16 feeBps_) external {
        if (msg.sender != address(FACTORY)) revert NotFactory();
        if (initialized) revert AlreadyInitialized();
        _validateConfigAddress(destination_);
        _validateConfigAddress(fallbackAddress_);
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();

        initialized = true;
        destination = destination_;
        fallbackAddress = fallbackAddress_;
        feeBps = feeBps_;
        emit Initialized(destination_, fallbackAddress_, feeBps_);
    }

    // -------------------------------------------------------------- EIP-1271

    /// @notice Constrained EIP-1271: validates ONLY the fixed Monerium link message
    ///         (and, if enabled via RECOVERY_HASH, Monerium's recovery message),
    ///         signed by ATTESTOR over keccak256(address(this), hash).
    ///         Binding to address(this) prevents replay across clones; restricting to
    ///         ATTESTOR prevents third parties from linking this address to a foreign
    ///         Monerium profile.
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        bool isLink = (hash == LINK_HASH_191 || hash == LINK_HASH_RAW);
        bool isRecovery = (RECOVERY_HASH != bytes32(0) && hash == RECOVERY_HASH);
        if (!isLink && !isRecovery) return EIP1271_FAIL;
        if (signature.length != 65) return EIP1271_FAIL;

        bytes32 r;
        bytes32 s;
        uint8 v;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }
        // Reject malleable signatures (high-s) and invalid v.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return EIP1271_FAIL;
        if (v != 27 && v != 28) return EIP1271_FAIL;

        bytes32 bound = keccak256(abi.encodePacked(address(this), hash));
        address signer = ecrecover(bound, v, r, s);
        if (signer == address(0) || signer != ATTESTOR) return EIP1271_FAIL;
        return EIP1271_MAGIC;
    }

    // ------------------------------------------------------------ stranding marker (R03)

    /// @notice Permissionless. Records when the EURe balance first crossed the swap
    ///         threshold (start time for TRIGGER_DELAY / SWEEP_DELAY), and clears the
    ///         marker if the balance dropped back below it.
    function poke() external {
        uint256 balance = EURE.balanceOf(address(this));
        if (balance >= FACTORY.minSwapAmount()) {
            if (strandedSince == 0) {
                strandedSince = uint64(block.timestamp);
                emit Poked(strandedSince);
            }
        } else if (strandedSince != 0) {
            strandedSince = 0;
            emit Poked(0);
        }
    }

    // ------------------------------------------------------------------ swap

    /// @notice Convert EURe held by this contract to USDC and forward to `destination`.
    ///         Callable by guardian/keepers any time; by anyone once the stranding
    ///         marker is older than TRIGGER_DELAY (liveness fallback).
    function swapAndForward() external nonReentrant {
        if (clientPaused || guardianPaused || FACTORY.globalPaused()) revert Paused();

        bool privileged = msg.sender == FACTORY.guardian() || FACTORY.isKeeper(msg.sender);
        if (!privileged) {
            if (strandedSince == 0) revert NotAuthorizedYet();
            if (block.timestamp - strandedSince < TRIGGER_DELAY) revert NotAuthorizedYet();
        }

        uint256 eureBefore = EURE.balanceOf(address(this));
        if (eureBefore < FACTORY.minSwapAmount()) revert BelowMinimum();
        uint256 amountIn = eureBefore;
        uint256 cap = FACTORY.perSwapCap();
        if (amountIn > cap) amountIn = cap;

        uint256 minOut = _minOut(amountIn);
        uint256 usdcBefore = USDC.balanceOf(address(this));

        _approve(EURE, address(ROUTER), amountIn);
        ROUTER.exactInput(
            ISwapRouter02.ExactInputParams({
                path: abi.encodePacked(
                    address(EURE), POOL_FEE_EURE_EURC, address(EURC), POOL_FEE_EURC_USDC, address(USDC)
                ),
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: minOut
            })
        );
        _approve(EURE, address(ROUTER), 0);

        uint256 usdcReceived = USDC.balanceOf(address(this)) - usdcBefore;
        if (usdcReceived < minOut) revert InsufficientOutput();
        if (eureBefore - EURE.balanceOf(address(this)) > amountIn) revert Overspend();

        uint256 fee = 0;
        if (feeBps > 0) {
            fee = (usdcReceived * feeBps) / BPS;
            if (fee > 0) _transfer(USDC, FEE_RECIPIENT, fee);
        }

        // Full-balance sweep: unsolicited USDC goes to the client's destination too (R09).
        uint256 forwarded = USDC.balanceOf(address(this));
        _transfer(USDC, destination, forwarded);

        strandedSince = 0;
        emit SwapExecuted(msg.sender, amountIn, usdcReceived, fee, forwarded);
    }

    /// @dev minOut = amountIn * price * (1 - slippage), rescaled EURe(18) -> USDC(6).
    ///      Scale denominator: 10^(18 + oracleDecimals - 6). Floor rounding: conservative
    ///      direction; error < 1 unit of USDC. Assumes USDC/USD = 1 within SLIPPAGE_BPS
    ///      (documented assumption A4; PRD v2 §7.3).
    function _minOut(uint256 amountIn) internal view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = ORACLE.latestRoundData();
        if (answer <= 0) revert InvalidPrice();
        if (updatedAt == 0 || block.timestamp - updatedAt > MAX_ORACLE_AGE) revert StalePrice();
        return (amountIn * uint256(answer) * (BPS - SLIPPAGE_BPS)) / (10 ** (12 + uint256(ORACLE_DECIMALS))) / BPS;
    }

    // -------------------------------------------------------------- recovery

    /// @notice Permissionless dead-man sweep: after SWEEP_DELAY of stranding, anyone may
    ///         move the full EURe balance to the client's fallbackAddress. Deliberately
    ///         NOT gated on pause flags: recovery must work during incidents. Never
    ///         targets `destination` (CEX rule — variant doc §6).
    function sweepStrandedEure() external nonReentrant {
        if (strandedSince == 0) revert NotStranded();
        if (block.timestamp - strandedSince < SWEEP_DELAY) revert DelayNotElapsed();
        uint256 balance = EURE.balanceOf(address(this));
        _transfer(EURE, fallbackAddress, balance);
        strandedSince = 0;
        emit StrandedEureSwept(msg.sender, balance);
    }

    // ------------------------------------------------------- client (fallback) authority

    function setDestination(address destination_) external onlyFallback {
        _validateConfigAddress(destination_);
        emit DestinationUpdated(destination, destination_);
        destination = destination_;
    }

    function setFallbackAddress(address fallbackAddress_) external onlyFallback {
        _validateConfigAddress(fallbackAddress_);
        emit FallbackAddressUpdated(fallbackAddress, fallbackAddress_);
        fallbackAddress = fallbackAddress_;
    }

    function setClientPaused(bool paused) external onlyFallback {
        clientPaused = paused;
        emit ClientPausedSet(paused);
    }

    /// @notice Client exit hatch: move any token (incl. EURe/USDC/unsolicited) anywhere.
    ///         Works while paused — guardian pause must never trap client funds.
    function sweep(address token, address to) external onlyFallback nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = IERC20(token).balanceOf(address(this));
        _transfer(IERC20(token), to, balance);
        emit TokenSwept(token, to, balance);
    }

    // ----------------------------------------------------------- guardian authority

    /// @notice Protective-only: blocks swaps (compliance holds, dormancy gate — R05).
    ///         Cannot move funds, change config, or block fallback paths.
    function setGuardianPaused(bool paused) external onlyGuardian {
        guardianPaused = paused;
        emit GuardianPausedSet(paused);
    }

    // ---------------------------------------------------------------- helpers

    function _validateConfigAddress(address account) internal view {
        if (account == address(0)) revert ZeroAddress();
        if (
            account == address(EURE) || account == address(EURC) || account == address(USDC)
                || account == address(ROUTER) || account == address(this)
        ) revert InvalidConfigAddress();
    }

    function _transfer(IERC20 token, address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _approve(IERC20 token, address spender, uint256 amount) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeCall(IERC20.approve, (spender, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
