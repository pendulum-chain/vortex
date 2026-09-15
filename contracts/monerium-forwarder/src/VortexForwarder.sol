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
    function MIN_SWAP_FLOOR() external view returns (uint256);
    function isForwarder(address account) external view returns (bool);
    function subsidyVault() external view returns (address);
    function route(uint256 index) external view returns (bytes memory path, bool enabled);
}

interface IVortexSubsidyVault {
    function pay(address to, uint256 amount, uint256 referenceOut) external;
}

/// @title VortexForwarder
/// @notice Per-client forwarding account for the Monerium B2B onramp
///         (docs/architecture-monerium-b2b-onramp.md §2).
///         Deployed as an EIP-1167 clone by VortexForwarderFactory; the clone address is
///         linked to the client's Monerium profile, EURe mints land here, and the only
///         ways assets can ever leave are:
///           1. a factory-whitelisted EURe -> USDC swap (oracle-floored, output to self),
///           2. USDC to the client's `destination` (plus a fee <= MAX_FEE_PPM to FEE_RECIPIENT),
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
    uint32 private constant PPM = 1_000_000;

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
    uint16 public immutable SLIPPAGE_BPS; // registry P1: floor on the client's NET, after fee and subsidy
    uint32 public immutable MAX_FEE_PPM; // registry P2: caps both the fee and the floor policy
    /// @dev How far a keeper-supplied reference may sit from Chainlink. Bounds the keeper's
    ///      pricing power: a wrong reference can move fee/subsidy only inside this band, and
    ///      MAX_FEE_PPM plus the vault's caps bound it further.
    uint16 public immutable MAX_REFERENCE_DEVIATION_BPS;
    uint256 public immutable SWEEP_DELAY; // registry P3
    uint256 public immutable TRIGGER_DELAY; // registry P4

    /// @dev EIP-191 personal-message hash and raw keccak of LINK_MESSAGE. Monerium's
    ///      exact hashing scheme is a G0 spike output (task 4); accepting both is safe
    ///      because both encode only the fixed link message.
    bytes32 public immutable LINK_HASH_191;

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
        uint32 maxFeePpm;
        uint16 maxReferenceDeviationBps;
        uint256 sweepDelay;
        uint256 triggerDelay;
        bytes32 recoveryHash;
    }

    // ---------------------------------------------------------------- storage
    // Per-clone state, set once by the factory in the deployment transaction.

    bool public initialized;
    address public destination; // client's payout address (may be a CEX deposit address)
    address public fallbackAddress; // client's self-custodied recovery address (mandatory)
    /// @dev Fee policy, in ppm below the reference rate. The client is targeted at
    ///      reference x (1 - targetPpm): any fill above that becomes fee (<= MAX_FEE_PPM);
    ///      a fill below reference x (1 - floorPpm) is topped up from the subsidy vault.
    ///      Guardian-adjustable; increases (worse for the client) are timelocked (P11).
    uint32 public targetPpm;
    uint32 public floorPpm;

    /// @dev P11 timelock state: a pending increase and when it may be applied.
    ///      effectiveAt == 0 means no increase is pending. Decreases never pend.
    uint32 public pendingTargetPpm;
    uint32 public pendingFloorPpm;
    uint64 public pendingFeePolicyEffectiveAt;

    bool public clientPaused; // set by fallbackAddress only
    bool public guardianPaused; // set by guardian only (protective-only; cannot block fallback paths)

    /// @dev R03 marker: when the EURe balance first crossed minSwapAmount with no
    ///      successful swap since. Start time for TRIGGER_DELAY and SWEEP_DELAY.
    uint64 public strandedSince;

    uint256 private _reentrancyGuard;

    // ----------------------------------------------------------------- events

    event Initialized(address destination, address fallbackAddress, uint32 targetPpm, uint32 floorPpm);
    event FeePolicyDecreased(uint32 previousTarget, uint32 previousFloor, uint32 target, uint32 floor);
    event FeePolicyIncreaseAnnounced(
        uint32 currentTarget, uint32 currentFloor, uint32 pendingTarget, uint32 pendingFloor, uint64 effectiveAt
    );
    event FeePolicyIncreaseApplied(uint32 previousTarget, uint32 previousFloor, uint32 target, uint32 floor);
    event FeePolicyIncreaseCancelled(uint32 pendingTarget, uint32 pendingFloor);
    event Poked(uint64 strandedSince);
    /// @param referenceRate The rate the fee bands were computed against (keeper-supplied
    ///        for privileged swaps, Chainlink for permissionless ones), ORACLE_DECIMALS.
    /// @param subsidy USDC paid by the vault straight to `destination` on top of `forwarded`.
    event SwapExecuted(
        address indexed caller,
        uint256 routeIndex,
        uint256 eureIn,
        uint256 usdcOut,
        uint256 referenceRate,
        uint256 fee,
        uint256 subsidy,
        uint256 forwarded
    );
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
    error InvalidFeePolicy();
    error BelowMinimum();
    error StalePrice();
    error InvalidPrice();
    error InsufficientOutput();
    error Overspend();
    error NotStranded();
    error NoPendingFeePolicy();
    error ReferenceOutOfBand();
    error SubsidyUnavailable();
    error DelayNotElapsed();
    error TransferFailed();
    error Reentrancy();
    error InvalidRoute();

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
        MAX_FEE_PPM = cfg.maxFeePpm;
        MAX_REFERENCE_DEVIATION_BPS = cfg.maxReferenceDeviationBps;
        SWEEP_DELAY = cfg.sweepDelay;
        TRIGGER_DELAY = cfg.triggerDelay;
        RECOVERY_HASH = cfg.recoveryHash;

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
    function initialize(address destination_, address fallbackAddress_, uint32 targetPpm_, uint32 floorPpm_) external {
        if (msg.sender != address(FACTORY)) revert NotFactory();
        if (initialized) revert AlreadyInitialized();
        _validateConfigAddress(destination_);
        _validateConfigAddress(fallbackAddress_);
        _validateFeePolicy(targetPpm_, floorPpm_);

        initialized = true;
        destination = destination_;
        fallbackAddress = fallbackAddress_;
        targetPpm = targetPpm_;
        floorPpm = floorPpm_;
        emit Initialized(destination_, fallbackAddress_, targetPpm_, floorPpm_);
    }

    // -------------------------------------------------------------- EIP-1271

    /// @notice Constrained EIP-1271: validates ONLY the fixed Monerium link message
    ///         (and, if enabled via RECOVERY_HASH, Monerium's recovery message),
    ///         signed by ATTESTOR over keccak256(chainid, address(this), hash).
    ///         Binding to chainid + address(this) prevents replay across clones AND
    ///         across chains (review r1 P2); restricting to ATTESTOR prevents third
    ///         parties from linking this address to a foreign Monerium profile.
    ///         Only the EIP-191 hash variant is accepted: G0 sandbox validation
    ///         (2026-07-17) confirmed Monerium presents the EIP-191 hash, so the
    ///         raw-keccak fallback was removed to minimize surface.
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        bool isLink = hash == LINK_HASH_191;
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

        bytes32 bound = keccak256(abi.encodePacked(block.chainid, address(this), hash));
        address signer = ecrecover(bound, v, r, s);
        if (signer == address(0) || signer != ATTESTOR) return EIP1271_FAIL;
        return EIP1271_MAGIC;
    }

    // ------------------------------------------------------------ stranding marker (R03)

    /// @notice Permissionless. Records when the EURe balance first crossed the swap
    ///         threshold (start time for TRIGGER_DELAY / SWEEP_DELAY), and clears the
    ///         marker if the balance dropped back below it.
    function poke() external {
        // Armed against the IMMUTABLE floor, not the guardian-tunable minSwapAmount:
        // otherwise the guardian could raise minSwapAmount above a client's balance and
        // a poke() would clear the marker, permanently disabling the un-pausable
        // dead-man sweep (review r1, finding F1 — breach of plan invariant §2.3.5).
        uint256 balance = EURE.balanceOf(address(this));
        if (balance >= FACTORY.MIN_SWAP_FLOOR()) {
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
    /// @param referenceRate The partner-agreed reference (EUR/USD, ORACLE_DECIMALS) the
    ///        fee bands are priced against. A privileged caller must supply one within
    ///        MAX_REFERENCE_DEVIATION_BPS of Chainlink; a permissionless caller's value is
    ///        ignored and Chainlink is used, and no subsidy is paid on that path — the
    ///        rate guarantee applies to keeper-executed swaps.
    /// @param routeIndex Which factory-whitelisted route to execute. The keeper quotes
    ///        every enabled route off-chain and picks the best; a poor pick only ever
    ///        costs Vortex (more subsidy, less fee), never the client, whose outcome is
    ///        bounded by the oracle floor whichever route runs.
    function swapAndForward(uint256 referenceRate, uint256 routeIndex) external nonReentrant {
        if (clientPaused || guardianPaused || FACTORY.globalPaused()) revert Paused();

        bool privileged = msg.sender == FACTORY.guardian() || FACTORY.isKeeper(msg.sender);
        if (!privileged) {
            if (strandedSince == 0) revert NotAuthorizedYet();
            if (block.timestamp - strandedSince < TRIGGER_DELAY) revert NotAuthorizedYet();
        }

        uint256 amountIn = EURE.balanceOf(address(this));
        if (amountIn < FACTORY.minSwapAmount()) revert BelowMinimum();
        uint256 cap = FACTORY.perSwapCap();
        if (amountIn > cap) amountIn = cap;

        uint256 oraclePrice = _oraclePrice();
        uint256 referenceUsed = privileged ? _checkedReference(referenceRate, oraclePrice) : oraclePrice;

        uint256 usdcReceived = _swap(routeIndex, amountIn);
        (uint256 fee, uint256 subsidy) = _settle(amountIn, usdcReceived, referenceUsed, privileged);

        // The oracle floor is enforced on the client's NET (fill - fee + subsidy), not on
        // the raw fill: a subsidized fill may sit below it, and a subsidy must never
        // paper over a depegged reference. Reverting here undoes the swap and the
        // subsidy transfer alike.
        if (usdcReceived - fee + subsidy < _floorOut(amountIn, oraclePrice)) revert InsufficientOutput();

        // Full-balance sweep: unsolicited USDC goes to the client's destination too (R09).
        uint256 forwarded = USDC.balanceOf(address(this));
        _transfer(USDC, destination, forwarded);

        // Re-arm instead of clearing when a perSwapCap remainder stays behind (review r1
        // P2): otherwise the remainder's dead-man/permissionless timers would silently
        // restart from zero only after a fresh poke().
        strandedSince = EURE.balanceOf(address(this)) >= FACTORY.MIN_SWAP_FLOOR() ? uint64(block.timestamp) : 0;
        emit SwapExecuted(msg.sender, routeIndex, amountIn, usdcReceived, referenceUsed, fee, subsidy, forwarded);
    }

    /// @dev Executes the whitelisted route and returns the USDC received. The router
    ///      minimum is deliberately 0: the router cannot see the fee and subsidy that
    ///      determine the client's net, so the floor is enforced by swapAndForward after
    ///      settlement instead, and a failing floor reverts the whole call.
    function _swap(uint256 routeIndex, uint256 amountIn) internal returns (uint256 usdcReceived) {
        (bytes memory path, bool routeEnabled) = FACTORY.route(routeIndex);
        if (!routeEnabled) revert InvalidRoute();

        uint256 eureBefore = EURE.balanceOf(address(this));
        uint256 usdcBefore = USDC.balanceOf(address(this));

        _approve(EURE, address(ROUTER), amountIn);
        ROUTER.exactInput(
            ISwapRouter02.ExactInputParams({
                path: path, recipient: address(this), amountIn: amountIn, amountOutMinimum: 0
            })
        );
        _approve(EURE, address(ROUTER), 0);

        usdcReceived = USDC.balanceOf(address(this)) - usdcBefore;
        if (eureBefore - EURE.balanceOf(address(this)) > amountIn) revert Overspend();
    }

    /// @dev Applies the fee bands (docs/proposal-monerium-forwarder-fee-subsidy.md):
    ///      - fill above reference x (1 - targetPpm): the surplus is the fee, <= MAX_FEE_PPM;
    ///      - fill between the floor and the target: no fee, no subsidy;
    ///      - fill below reference x (1 - floorPpm): a privileged swap draws the shortfall
    ///        from the vault straight to `destination`; a permissionless swap pays nothing.
    ///      The vault reverts (and so does the swap) when its cap, budget, pause or
    ///      balance cannot cover the shortfall — a swap is never partially subsidized.
    function _settle(uint256 amountIn, uint256 usdcReceived, uint256 referenceUsed, bool privileged)
        internal
        returns (uint256 fee, uint256 subsidy)
    {
        uint256 referenceOut = _usdcValue(amountIn, referenceUsed);
        uint256 targetOut = (referenceOut * (PPM - targetPpm)) / PPM;
        if (usdcReceived > targetOut) {
            fee = usdcReceived - targetOut;
            uint256 maxFee = (usdcReceived * MAX_FEE_PPM) / PPM;
            if (fee > maxFee) fee = maxFee;
            _transfer(USDC, FEE_RECIPIENT, fee);
            return (fee, 0);
        }
        uint256 floorOut = (referenceOut * (PPM - floorPpm)) / PPM;
        if (usdcReceived >= floorOut || !privileged) return (0, 0);

        subsidy = floorOut - usdcReceived;
        address vault = FACTORY.subsidyVault();
        if (vault == address(0)) revert SubsidyUnavailable();
        IVortexSubsidyVault(vault).pay(destination, subsidy, referenceOut);
        return (0, subsidy);
    }

    /// @dev Validated Chainlink EUR/USD price (registry P8 staleness ceiling).
    function _oraclePrice() internal view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = ORACLE.latestRoundData();
        if (answer <= 0) revert InvalidPrice();
        if (updatedAt == 0 || block.timestamp - updatedAt > MAX_ORACLE_AGE) revert StalePrice();
        return uint256(answer);
    }

    /// @dev A keeper-supplied reference must lie within MAX_REFERENCE_DEVIATION_BPS of Chainlink.
    function _checkedReference(uint256 supplied, uint256 oraclePrice) internal view returns (uint256) {
        uint256 tolerance = (oraclePrice * MAX_REFERENCE_DEVIATION_BPS) / BPS;
        if (supplied + tolerance < oraclePrice || supplied > oraclePrice + tolerance) revert ReferenceOutOfBand();
        return supplied;
    }

    /// @dev amountIn (EURe, 18 dec) x price (ORACLE_DECIMALS) rescaled to USDC (6 dec).
    ///      Scale denominator: 10^(18 + oracleDecimals - 6). Floor rounding: error < 1
    ///      unit of USDC. Assumes USDC/USD = 1 within SLIPPAGE_BPS (assumption A4).
    function _usdcValue(uint256 amountIn, uint256 price) internal view returns (uint256) {
        return (amountIn * price) / (10 ** (12 + uint256(ORACLE_DECIMALS)));
    }

    /// @dev The least the client may end up with: Chainlink value x (1 - SLIPPAGE_BPS).
    function _floorOut(uint256 amountIn, uint256 oraclePrice) internal view returns (uint256) {
        return (_usdcValue(amountIn, oraclePrice) * (BPS - SLIPPAGE_BPS)) / BPS;
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
        if (token == address(EURE) && strandedSince != 0) {
            strandedSince = 0;
            emit Poked(0);
        }
        emit TokenSwept(token, to, balance);
    }

    // ----------------------------------------------------------- guardian authority

    /// @notice Protective-only: blocks swaps (compliance holds, dormancy gate — R05).
    ///         Cannot move funds, change config, or block fallback paths.
    function setGuardianPaused(bool paused) external onlyGuardian {
        guardianPaused = paused;
        emit GuardianPausedSet(paused);
    }

    /// @dev P11: fee policy increases take effect only this long after their on-chain
    ///      announcement, so a client whose SEPA transfer is already in flight under
    ///      the current policy cannot be swapped under a silently worse one.
    ///      Decreases are immediate — they only ever favor the client.
    uint256 public constant FEE_INCREASE_TIMELOCK = 24 hours;

    /// @notice Guardian fee-policy adjustment (P11), always bounded by the immutable
    ///         MAX_FEE_PPM. A change that raises neither value (or re-states the current
    ///         ones) applies immediately and cancels any pending increase; a change that
    ///         raises either value is announced and becomes applicable only after
    ///         FEE_INCREASE_TIMELOCK. Announcing again replaces the pending pair and
    ///         restarts its clock.
    function setFeePolicy(uint32 newTargetPpm, uint32 newFloorPpm) external onlyGuardian {
        _validateFeePolicy(newTargetPpm, newFloorPpm);
        if (newTargetPpm <= targetPpm && newFloorPpm <= floorPpm) {
            if (pendingFeePolicyEffectiveAt != 0) {
                emit FeePolicyIncreaseCancelled(pendingTargetPpm, pendingFloorPpm);
                pendingTargetPpm = 0;
                pendingFloorPpm = 0;
                pendingFeePolicyEffectiveAt = 0;
            }
            if (newTargetPpm != targetPpm || newFloorPpm != floorPpm) {
                emit FeePolicyDecreased(targetPpm, floorPpm, newTargetPpm, newFloorPpm);
                targetPpm = newTargetPpm;
                floorPpm = newFloorPpm;
            }
        } else {
            pendingTargetPpm = newTargetPpm;
            pendingFloorPpm = newFloorPpm;
            pendingFeePolicyEffectiveAt = uint64(block.timestamp + FEE_INCREASE_TIMELOCK);
            emit FeePolicyIncreaseAnnounced(targetPpm, floorPpm, newTargetPpm, newFloorPpm, pendingFeePolicyEffectiveAt);
        }
    }

    /// @notice Applies an announced fee-policy increase once its timelock has elapsed.
    ///         Permissionless: the announcement is the authorization; anyone may
    ///         finalize it (the keeper does so as part of its cycle if needed).
    function applyFeePolicy() external {
        if (pendingFeePolicyEffectiveAt == 0) revert NoPendingFeePolicy();
        if (block.timestamp < pendingFeePolicyEffectiveAt) revert DelayNotElapsed();
        emit FeePolicyIncreaseApplied(targetPpm, floorPpm, pendingTargetPpm, pendingFloorPpm);
        targetPpm = pendingTargetPpm;
        floorPpm = pendingFloorPpm;
        pendingTargetPpm = 0;
        pendingFloorPpm = 0;
        pendingFeePolicyEffectiveAt = 0;
    }

    // ---------------------------------------------------------------- helpers

    /// @dev The floor is the worse-for-the-client bound, so it may never sit above the
    ///      target, and both are capped by the immutable MAX_FEE_PPM.
    function _validateFeePolicy(uint32 targetPpm_, uint32 floorPpm_) internal view {
        if (targetPpm_ > floorPpm_ || floorPpm_ > MAX_FEE_PPM) revert InvalidFeePolicy();
    }

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
