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
///           1. a factory-whitelisted EURe -> USDC swap (oracle-floored, output kept here),
///           2. USDC to the client's `destination` (plus a fee <= MAX_FEE_PPM to FEE_RECIPIENT),
///           3. EURe and USDC to the immutable Vortex RECOVERY_WALLET, only by the keeper and
///              only once a batch has been open for RECOVERY_DELAY (the refund path).
///         The keeper converts a bank payment in `swap` chunks that accumulate as USDC on
///         the clone and pushes the whole payment to `destination` with one `forward`, so
///         the client sees one USDC transfer per pay-in. Vortex (guardian/keeper) can
///         execute that policy, pause it, recover a stuck payment to its own wallet for a
///         bank refund, and nothing else.
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
    /// @dev The only address a recovery can move funds to: a Vortex wallet linked to a
    ///      Vortex company profile at Monerium, from which the bank refund is redeemed.
    address public immutable RECOVERY_WALLET;
    uint256 public immutable MAX_ORACLE_AGE; // registry P8
    uint16 public immutable SLIPPAGE_BPS; // registry P1: floor on the client's NET, after fee and subsidy
    uint32 public immutable MAX_FEE_PPM; // registry P2: caps both the fee and the floor policy
    /// @dev How far a keeper-supplied reference may sit from Chainlink. Bounds the keeper's
    ///      pricing power: a wrong reference can move fee/subsidy only inside this band, and
    ///      MAX_FEE_PPM plus the vault's caps bound it further.
    uint16 public immutable MAX_REFERENCE_DEVIATION_BPS;
    /// @dev Registry P3: how long a batch must have been open before the keeper may move
    ///      it to RECOVERY_WALLET — the promised conversion window, enforced on chain.
    uint256 public immutable RECOVERY_DELAY;
    uint256 public immutable TRIGGER_DELAY; // registry P4

    /// @dev EIP-191 personal-message hash of LINK_MESSAGE, the only hash the attestor's
    ///      signature is accepted for (G0 sandbox validation confirmed Monerium presents it).
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
        address recoveryWallet;
        uint256 maxOracleAge;
        uint16 slippageBps;
        uint32 maxFeePpm;
        uint16 maxReferenceDeviationBps;
        uint256 recoveryDelay;
        uint256 triggerDelay;
        bytes32 recoveryHash;
    }

    // ---------------------------------------------------------------- storage
    // Per-clone state, set once by the factory in the deployment transaction.

    bool public initialized;
    address public destination; // client's payout address (may be a CEX deposit address)
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

    bool public guardianPaused; // set by guardian only (protective-only; never blocks recovery)

    /// @dev When the current batch opened: the first time funds (EURe >= MIN_SWAP_FLOOR
    ///      or any USDC) were seen on the clone since it was last emptied by a forward or
    ///      a recovery. Start time for RECOVERY_DELAY and TRIGGER_DELAY. A partial swap
    ///      never re-times it, so chunking cannot restart the recovery clock.
    uint64 public batchOpenedAt;

    uint256 private _reentrancyGuard;

    // ----------------------------------------------------------------- events

    event Initialized(address destination, uint32 targetPpm, uint32 floorPpm);
    event FeePolicyDecreased(uint32 previousTarget, uint32 previousFloor, uint32 target, uint32 floor);
    event FeePolicyIncreaseAnnounced(
        uint32 currentTarget, uint32 currentFloor, uint32 pendingTarget, uint32 pendingFloor, uint64 effectiveAt
    );
    event FeePolicyIncreaseApplied(uint32 previousTarget, uint32 previousFloor, uint32 target, uint32 floor);
    event FeePolicyIncreaseCancelled(uint32 pendingTarget, uint32 pendingFloor);
    event Poked(uint64 batchOpenedAt);
    /// @param referenceRate The rate the fee bands were computed against (keeper-supplied
    ///        for privileged swaps, Chainlink for permissionless ones), ORACLE_DECIMALS.
    /// @param subsidy USDC the vault paid to this clone on top of `usdcOut`.
    event SwapExecuted(
        address indexed caller,
        uint256 routeIndex,
        uint256 eureIn,
        uint256 usdcOut,
        uint256 referenceRate,
        uint256 fee,
        uint256 subsidy
    );
    event Forwarded(address indexed caller, uint256 amount);
    event Recovered(address indexed caller, uint256 eureAmount, uint256 usdcAmount);
    event GuardianPausedSet(bool paused);

    // ----------------------------------------------------------------- errors

    error AlreadyInitialized();
    error NotFactory();
    error NotGuardian();
    error NotKeeper();
    error NotAuthorizedYet();
    error Paused();
    error ZeroAddress();
    error InvalidConfigAddress();
    error InvalidFeePolicy();
    error BelowMinimum();
    error InvalidAmount();
    error StalePrice();
    error InvalidPrice();
    error InsufficientOutput();
    error Overspend();
    error NoPendingFeePolicy();
    error ReferenceOutOfBand();
    error SubsidyUnavailable();
    error SubsidyAboveCap();
    error DelayNotElapsed();
    error TransferFailed();
    error Reentrancy();
    error InvalidRoute();

    // ------------------------------------------------------------ constructor

    constructor(ImmutableConfig memory cfg) {
        // A zero recovery wallet would make `recover` burn client funds.
        if (cfg.recoveryWallet == address(0)) revert ZeroAddress();
        EURE = IERC20(cfg.eure);
        EURC = IERC20(cfg.eurc);
        USDC = IERC20(cfg.usdc);
        ROUTER = ISwapRouter02(cfg.router);
        ORACLE = AggregatorV3Interface(cfg.oracle);
        ORACLE_DECIMALS = AggregatorV3Interface(cfg.oracle).decimals();
        FACTORY = IVortexForwarderFactory(msg.sender);
        ATTESTOR = cfg.attestor;
        FEE_RECIPIENT = cfg.feeRecipient;
        RECOVERY_WALLET = cfg.recoveryWallet;
        MAX_ORACLE_AGE = cfg.maxOracleAge;
        SLIPPAGE_BPS = cfg.slippageBps;
        MAX_FEE_PPM = cfg.maxFeePpm;
        MAX_REFERENCE_DEVIATION_BPS = cfg.maxReferenceDeviationBps;
        RECOVERY_DELAY = cfg.recoveryDelay;
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

    modifier onlyGuardian() {
        if (msg.sender != FACTORY.guardian()) revert NotGuardian();
        _;
    }

    modifier onlyKeeper() {
        if (!_privileged()) revert NotKeeper();
        _;
    }

    modifier whenNotPaused() {
        if (guardianPaused || FACTORY.globalPaused()) revert Paused();
        _;
    }

    // ---------------------------------------------------------- initialization

    /// @notice Called by the factory in the same transaction as clone deployment.
    function initialize(address destination_, uint32 targetPpm_, uint32 floorPpm_) external {
        if (msg.sender != address(FACTORY)) revert NotFactory();
        if (initialized) revert AlreadyInitialized();
        _validateConfigAddress(destination_);
        _validateFeePolicy(targetPpm_, floorPpm_);

        initialized = true;
        destination = destination_;
        targetPpm = targetPpm_;
        floorPpm = floorPpm_;
        emit Initialized(destination_, targetPpm_, floorPpm_);
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

    // ------------------------------------------------------------ batch marker

    /// @notice Permissionless. Opens the batch marker when funds are present and it is
    ///         not armed yet (start time for RECOVERY_DELAY / TRIGGER_DELAY); clears it
    ///         when the clone is empty. Never re-times an armed marker.
    function poke() external {
        _syncBatch(false);
    }

    /// @dev Armed against the IMMUTABLE swap floor, not the guardian-tunable minSwapAmount,
    ///      so no guardian action can keep a funded batch from being timed (review r1 F1).
    ///      `reset` re-times the marker for whatever remains after a forward or a
    ///      recovery closed the previous batch; otherwise an armed marker is left alone so
    ///      a partial swap can never restart the recovery clock.
    function _syncBatch(bool reset) internal {
        bool funded = EURE.balanceOf(address(this)) >= FACTORY.MIN_SWAP_FLOOR() || USDC.balanceOf(address(this)) > 0;
        uint64 next = 0;
        if (funded) {
            next = (reset || batchOpenedAt == 0) ? uint64(block.timestamp) : batchOpenedAt;
        }
        if (next != batchOpenedAt) {
            batchOpenedAt = next;
            emit Poked(next);
        }
    }

    // ------------------------------------------------------------------ swap

    /// @notice Convert `amountIn` EURe held by this contract to USDC, which stays on the
    ///         clone until `forward`. Callable by guardian/keepers any time; by anyone once
    ///         the batch marker is older than TRIGGER_DELAY (liveness fallback).
    /// @param referenceRate The partner-agreed reference (EUR/USD, ORACLE_DECIMALS) the
    ///        fee bands are priced against. A privileged caller must supply one within
    ///        MAX_REFERENCE_DEVIATION_BPS of Chainlink; a permissionless caller's value is
    ///        ignored and Chainlink is used, and no subsidy is paid on that path — the
    ///        rate guarantee applies to keeper-executed swaps.
    /// @param routeIndex Which factory-whitelisted route to execute. The keeper quotes
    ///        every enabled route off-chain and picks the best; a poor pick only ever
    ///        costs Vortex (more subsidy, less fee), never the client, whose outcome is
    ///        bounded by the oracle floor whichever route runs.
    /// @param amountIn Exactly how much EURe to convert: at least minSwapAmount, at most
    ///        perSwapCap and the balance. Explicit so the keeper's chunking maps every
    ///        swap to one bank payment.
    /// @param maxSubsidy The most USDC the caller lets the vault pay for this swap: the
    ///        keeper's escalation tier for the time the chunk has waited (docs, fees
    ///        section). Binding at execution, so a fill that moved between the quote and
    ///        the swap cannot draw more than the tier; the vault's own cap and budget
    ///        still apply on top. Ignored on the permissionless path, which pays nothing.
    function swap(uint256 referenceRate, uint256 routeIndex, uint256 amountIn, uint256 maxSubsidy)
        external
        nonReentrant
        whenNotPaused
    {
        bool privileged = _privileged();
        if (!privileged) _requireBatchAge(TRIGGER_DELAY, NotAuthorizedYet.selector);

        if (amountIn < FACTORY.minSwapAmount()) revert BelowMinimum();
        if (amountIn > FACTORY.perSwapCap() || amountIn > EURE.balanceOf(address(this))) revert InvalidAmount();

        uint256 oraclePrice = _oraclePrice();
        uint256 referenceUsed = privileged ? _checkedReference(referenceRate, oraclePrice) : oraclePrice;

        uint256 usdcReceived = _swap(routeIndex, amountIn);
        (uint256 fee, uint256 subsidy) = _settle(amountIn, usdcReceived, referenceUsed, privileged, maxSubsidy);

        // The oracle floor is enforced on the client's NET (fill - fee + subsidy), not on
        // the raw fill: a subsidized fill may sit below it, and a subsidy must never
        // paper over a depegged reference. Reverting here undoes the swap and the
        // subsidy transfer alike.
        if (usdcReceived - fee + subsidy < _floorOut(amountIn, oraclePrice)) revert InsufficientOutput();

        _syncBatch(false);
        emit SwapExecuted(msg.sender, routeIndex, amountIn, usdcReceived, referenceUsed, fee, subsidy);
    }

    /// @dev Executes the whitelisted route and returns the USDC received. The router
    ///      minimum is deliberately 0: the router cannot see the fee and subsidy that
    ///      determine the client's net, so the floor is enforced by `swap` after
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

    /// @dev Applies the fee bands (docs/architecture-monerium-b2b-onramp.md, "Fees, reference rate and subsidy"):
    ///      - fill above reference x (1 - targetPpm): the surplus is the fee, <= MAX_FEE_PPM;
    ///      - fill between the floor and the target: no fee, no subsidy;
    ///      - fill below reference x (1 - floorPpm): a privileged swap draws the shortfall
    ///        from the vault onto this clone; a permissionless swap pays nothing.
    ///      The caller's `maxSubsidy` bounds the shortfall first; the vault reverts (and so
    ///      does the swap) when its cap, budget, pause or balance cannot cover it, and the
    ///      forwarder reverts unless exactly the shortfall arrived here — a swap is never
    ///      partially subsidized.
    function _settle(uint256 amountIn, uint256 usdcReceived, uint256 referenceUsed, bool privileged, uint256 maxSubsidy)
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
        if (subsidy > maxSubsidy) revert SubsidyAboveCap();
        address vault = FACTORY.subsidyVault();
        if (vault == address(0)) revert SubsidyUnavailable();
        // The vault is guardian-settable without a timelock, so its word is not enough:
        // count the subsidy only once exactly that amount has landed here.
        uint256 before = USDC.balanceOf(address(this));
        IVortexSubsidyVault(vault).pay(address(this), subsidy, referenceOut);
        if (USDC.balanceOf(address(this)) - before != subsidy) revert SubsidyUnavailable();
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

    // --------------------------------------------------------------- forward

    /// @notice Pushes `amount` of the accumulated USDC to `destination`: the keeper calls
    ///         this once with the whole converted bank payment, so the client sees one
    ///         transfer per pay-in. Closes the batch marker when nothing remains.
    function forward(uint256 amount) external nonReentrant whenNotPaused onlyKeeper {
        if (amount == 0 || amount > USDC.balanceOf(address(this))) revert InvalidAmount();
        _transfer(USDC, destination, amount);
        _syncBatch(true);
        emit Forwarded(msg.sender, amount);
    }

    /// @notice Pushes the whole USDC balance to `destination`. Keeper any time (also the
    ///         home for unsolicited USDC, R09); anyone once the batch marker is older than
    ///         TRIGGER_DELAY, so a Vortex outage can never trap converted funds on chain.
    ///         Batches may merge on that path — the per-payment mapping is the keeper's.
    function forwardAll() external nonReentrant whenNotPaused {
        if (!_privileged()) _requireBatchAge(TRIGGER_DELAY, NotAuthorizedYet.selector);
        uint256 amount = USDC.balanceOf(address(this));
        if (amount == 0) revert InvalidAmount();
        _transfer(USDC, destination, amount);
        _syncBatch(true);
        emit Forwarded(msg.sender, amount);
    }

    // -------------------------------------------------------------- recovery

    /// @notice Moves a stuck bank payment — its unconverted EURe and its chunk-swapped
    ///         USDC — to RECOVERY_WALLET so Vortex can refund the exact EUR amount to the
    ///         payer's bank account (docs/architecture-monerium-b2b-onramp.md, recovery).
    ///         Keeper/guardian only, and only once the batch has been open for
    ///         RECOVERY_DELAY: the contract, not the keeper, enforces the promised window.
    ///         Deliberately NOT gated on pause flags: pause-then-recover is the incident
    ///         sequence. Amounts are explicit because a younger payment may share the clone.
    function recover(uint256 eureAmount, uint256 usdcAmount) external nonReentrant onlyKeeper {
        _requireBatchAge(RECOVERY_DELAY, DelayNotElapsed.selector);
        if (eureAmount == 0 && usdcAmount == 0) revert InvalidAmount();
        if (eureAmount > EURE.balanceOf(address(this)) || usdcAmount > USDC.balanceOf(address(this))) {
            revert InvalidAmount();
        }
        _transfer(EURE, RECOVERY_WALLET, eureAmount);
        _transfer(USDC, RECOVERY_WALLET, usdcAmount);
        _syncBatch(true);
        emit Recovered(msg.sender, eureAmount, usdcAmount);
    }

    // ----------------------------------------------------------- guardian authority

    /// @notice Protective-only: blocks swaps and forwards (compliance holds, dormancy gate —
    ///         R05). Cannot move funds, change config, or block a recovery.
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

    function _privileged() internal view returns (bool) {
        return msg.sender == FACTORY.guardian() || FACTORY.isKeeper(msg.sender);
    }

    /// @dev Reverts with `err` unless the batch marker is armed and older than `delay`.
    function _requireBatchAge(uint256 delay, bytes4 err) internal view {
        if (batchOpenedAt == 0 || block.timestamp - batchOpenedAt < delay) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                mstore(0, err)
                revert(0, 4)
            }
        }
    }

    /// @dev The floor is the worse-for-the-client bound, so it may never sit above the
    ///      target, and both are capped by the immutable MAX_FEE_PPM.
    function _validateFeePolicy(uint32 targetPpm_, uint32 floorPpm_) internal view {
        if (targetPpm_ > floorPpm_ || floorPpm_ > MAX_FEE_PPM) revert InvalidFeePolicy();
    }

    function _validateConfigAddress(address account) internal view {
        if (account == address(0)) revert ZeroAddress();
        if (
            account == address(EURE) || account == address(EURC) || account == address(USDC)
                || account == address(ROUTER) || account == address(this) || account == RECOVERY_WALLET
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
