# Per-User EURC Settlement Contract Feasibility Notes

Last updated: 2026-06-25

This document summarizes the current design thinking for a per-user smart contract
that receives Circle EURC on Base, swaps it to Circle USDC, and sends the USDC to
the same user's predefined Ethereum wallet through Circle CCTP.

It is intended as an implementation handoff for another AI agent. It is not legal
advice.

## Executive Summary

The flow is technically feasible:

1. A partner or payer transfers EURC on Base to a per-user smart contract address.
2. Later, Vortex or any permitted caller invokes a contract function that sweeps
   the current EURC balance.
3. The contract swaps EURC to USDC on Base through a DEX route.
4. The contract calls Circle CCTP V2 to burn the USDC on Base for minting on
   Ethereum.
5. The final USDC is minted to the user's hardcoded Ethereum wallet address.

The important architectural principle is to keep the custody-critical parts
immutable, especially the final recipient. Any flexibility should be limited to
the swap mechanism and protected by strong guardrails.

## Core Requirements

The per-user contract should:

- Be deployed once per onboarded customer.
- Receive EURC on Base through a normal ERC-20 `transfer`.
- Hardcode the user's final Ethereum wallet address at deployment.
- Prevent any later change to the final recipient.
- Prevent admin withdrawal of EURC or USDC.
- Prevent arbitrary calls to external contracts.
- Swap the full available EURC balance, or an explicitly bounded amount.
- Bridge/burn the resulting USDC through CCTP V2 to Ethereum.
- Emit enough events for operations, reconciliation, and support.

The partner-facing interpretation is:

- The smart contract is a customer-specific technical settlement address.
- The sole permitted economic beneficiary is the same known customer.
- The contract cannot redirect funds to Vortex or another third party.
- Vortex may operate the automation, but the code should not require Vortex's
  key for the funds to eventually move.

## Current Circle/CCTP Facts To Verify Before Implementation

Verified from Circle docs on 2026-06-25:

- EURC exists on Base at `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42`.
- USDC exists on Base at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- USDC exists on Ethereum at `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`.
- CCTP V2 supports Base and Ethereum.
- Circle CCTP domain IDs are:
  - Ethereum: `0`
  - Base: `6`
- CCTP V2 supports USDC transfers across supported domains.
- CCTP V2 does not remove the need to swap EURC to USDC first for this flow.
- CCTP `depositForBurn` burns USDC on the source chain; minting on Ethereum
  happens later after Circle attestation.

Current mainnet CCTP V2 EVM addresses from Circle docs:

- `TokenMessengerV2`: `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`
- `MessageTransmitterV2`: `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64`

Do not rely on this document alone at implementation time. Re-check Circle's
official contract address pages immediately before deployment.

## Important Flow Detail

A normal ERC-20 `transfer` to a smart contract does not automatically call the
receiving smart contract. The intended flow is therefore asynchronous:

```text
Partner transfers EURC to per-user contract on Base
Later:
  Vortex service, user, keeper, or any public caller calls sweep()
  Contract swaps EURC -> USDC on Base
  Contract calls CCTP depositForBurn(...)
Later:
  Circle attests the burn
  Ethereum-side mint is completed either directly or through a forwarding service
```

The source-chain Base transaction can perform the sweep, swap, and CCTP burn in
one transaction. It cannot complete the Ethereum-side mint in that same Base
transaction.

## Recommended Contract Shape

Recommended pattern: immutable per-user vault with a constrained swap adapter.

Immutable constructor values:

- `EURC_BASE`
- `USDC_BASE`
- `CCTP_TOKEN_MESSENGER_V2_BASE`
- `ETHEREUM_DESTINATION_DOMAIN = 0`
- `ETHEREUM_MINT_RECIPIENT`
- Optional: `DESTINATION_CALLER`

Mutable value, if flexibility is required:

- `swapAdapter`

The main contract should retain control over all custody-critical logic. The
adapter should only be responsible for converting EURC to USDC and returning the
USDC to the main contract.

Avoid this pattern:

```solidity
function execute(address target, bytes calldata data) external onlyOwner;
```

An arbitrary execution function creates broad admin control over deposited funds
and weakens the argument that the contract is just a technical settlement
address for a known customer.

## Sweep Function Sketch

Conceptual flow:

```text
function sweep(uint256 minUsdcOut, uint256 cctpMaxFee, uint32 minFinalityThreshold):
  eurcAmount = EURC.balanceOf(this)
  require(eurcAmount > 0)

  usdcBefore = USDC.balanceOf(this)

  approve EURC exactly eurcAmount to swapAdapter
  call swapAdapter.swapExactEurcForUsdc(eurcAmount, minUsdcOut, this)
  reset EURC approval to zero

  usdcAfter = USDC.balanceOf(this)
  usdcReceived = usdcAfter - usdcBefore
  require(usdcReceived >= minUsdcOut)

  approve USDC exactly usdcReceived to TokenMessengerV2
  call TokenMessengerV2.depositForBurn(
    amount = usdcReceived,
    destinationDomain = 0,
    mintRecipient = bytes32(uint256(uint160(ETHEREUM_MINT_RECIPIENT))),
    burnToken = USDC_BASE,
    destinationCaller = DESTINATION_CALLER_OR_ZERO,
    maxFee = cctpMaxFee,
    minFinalityThreshold = minFinalityThreshold
  )
  reset USDC approval to zero if needed

  emit SweptAndBurned(eurcAmount, usdcReceived, minUsdcOut, ...)
```

Implementation notes:

- Use SafeERC20-style wrappers.
- Approve exact amounts, not unlimited allowances.
- Reset allowances after use where compatible.
- Add a non-reentrancy guard.
- Validate the swap adapter output by measuring USDC balance deltas.
- Consider supporting partial sweeps only if there is a clear operational need.
- Avoid handling native ETH unless needed for a specific DEX path.

## Swap Adapter Design

The swap adapter exists because DEX routes may change over time. It should be
constrained so that changing the adapter does not allow Vortex to redirect user
funds.

Adapter expectations:

- Input token must be Base EURC.
- Output token must be Base USDC.
- Output recipient must be the per-user settlement contract.
- The adapter must not retain EURC or USDC balances after a swap.
- The adapter should enforce a deadline and minimum output.

Main contract checks:

- Only transfer EURC to the adapter for the exact swap amount.
- Check the USDC balance before and after adapter execution.
- Revert if the USDC delta is below `minUsdcOut`.
- Do not allow the adapter to specify the CCTP recipient.

Adapter update options:

1. No mutability: redeploy a new per-user contract if the DEX route breaks.
2. Mutable `swapAdapter` controlled by multisig/timelock.
3. Mutable `swapAdapter` plus public delayed activation and event monitoring.

Recommended compromise:

- Use a mutable `swapAdapter`, but only with a narrow setter.
- Control it with a multisig.
- Prefer a timelock if partner/compliance posture matters.
- Emit `SwapAdapterUpdated(oldAdapter, newAdapter)`.
- Exclude any function that changes recipient, token addresses, CCTP contracts,
  or destination domain.

## Permissioning The Sweep

Options:

1. Permissionless `sweep`
   - Anyone can trigger the swap and CCTP burn.
   - Best for liveness and strongest non-custodial argument.
   - Requires caller-provided `minUsdcOut`, or a robust onchain/offchain quote
     mechanism to avoid bad execution.

2. Service-only `sweep`
   - Only Vortex automation can call the function.
   - Easier operational control.
   - Weaker custody posture because funds depend on Vortex action.

3. Hybrid
   - Service-only by default, but permissionless after a timeout.
   - More complex, but may balance UX and liveness.

Recommended starting point:

- Prefer permissionless sweep if slippage protection can be made safe.
- Otherwise use service-only for the first version, but recognize the custody
  and liveness implications.

## Slippage, Pricing, And MEV

The main market risk is the EURC -> USDC swap.

The contract must not perform a swap without price protection. Without a
meaningful `minUsdcOut`, the sweep can be front-run or executed at a bad price.

Possible controls:

- Backend obtains a fresh DEX quote and passes `minUsdcOut`.
- Apply a strict slippage tolerance.
- Use a deadline.
- Consider a TWAP/oracle sanity check if the swap size is large.
- Emit quoted and actual amounts for monitoring.
- Consider maximum sweep size if pool liquidity is thin.

Open implementation choice:

- Select DEX route on Base: Uniswap, Aerodrome, or another venue.
- Decide whether to use a direct EURC/USDC pool or a multi-hop route.
- Decide whether to use an aggregator. Aggregators improve routing but often
  require broader calldata/execution permissions, which may weaken the custody
  story.

## CCTP Direct Mint Vs Forwarding Service

CCTP is a burn-and-mint protocol. After the Base burn, Ethereum minting happens
after Circle attests the burn.

Direct mint:

```text
Base contract calls depositForBurn
Backend polls Circle attestation
Backend or any caller submits receiveMessage(message, attestation) on Ethereum
USDC is minted to the user's Ethereum recipient
```

Pros:

- Full control over destination submission.
- No forwarding-service dependency.
- No forwarding-service fee.

Cons:

- Requires Ethereum gas and relayer operations.
- Requires attestation polling, retries, and monitoring.

Forwarding service:

```text
Base burn is initiated with forwarding-supported flow
Circle or its forwarding infrastructure handles destination execution
USDC is minted to the user's Ethereum recipient
```

Pros:

- Simpler operations.
- No Vortex Ethereum relayer wallet required for mint submission.

Cons:

- Forwarding fees may reduce received amount.
- Route/support details must be confirmed.
- More dependency on Circle's infrastructure.

Recommended default:

- Use forwarding if it is supported for Base -> Ethereum and works cleanly with
  the chosen integration path.
- Use direct mint if exact operational control, lower fees, or custom retry
  behavior is more important.

## Custody And Partner-Licensing Posture

The deployer is not automatically the custodian just because it deployed the
contract. The stronger question is who can access, redirect, freeze, upgrade
around, or otherwise control the funds while they are in the contract.

Lower-control posture:

- One contract per customer.
- Final Ethereum recipient hardcoded at deployment.
- Recipient cannot be changed.
- No admin withdrawal for EURC or USDC.
- No arbitrary execution.
- Sweep is permissionless, or at least not dependent forever on Vortex.
- Source code is verified.
- Partner can map the contract address to the same known customer.

Higher-control posture:

- Vortex can change the recipient.
- Vortex can withdraw EURC or USDC.
- Vortex can call arbitrary contracts with the user's token balances.
- Vortex can upgrade the whole vault implementation.
- Vortex is the only party able to move the funds onward.

For the stablecoin partner, the key question is whether they can treat the smart
contract as a customer-specific technical receiving address. The best framing is:

```text
The payout address is a deterministic, verified, customer-specific settlement
contract. The sole hardcoded destination is the KYC'd customer's wallet. The
contract has no admin withdrawal path and no recipient mutation.
```

Avoid informal custody phrasing. Use "the sole permitted economic beneficiary is
the same known customer" instead.

## Per-User Contract Vs Reusing One Contract

Per-user contract advantages:

- Partner can map one static reference to one contract address.
- Contract can hardcode one final Ethereum recipient.
- Easier to explain as a customer-specific settlement address.
- Reduces risk that accounting or balances mix between users.

Per-user contract disadvantages:

- More deployments.
- More address management.
- Need to handle old contract addresses if users rotate final wallets.

Shared contract advantages:

- Fewer deployments.
- Centralized route updates.
- Easier contract operations.

Shared contract disadvantages:

- Requires internal user accounting.
- Requires mutable recipient mappings or deposit identifiers.
- Harder partner/compliance story.
- More severe blast radius if there is a bug.

Recommendation:

- Use one contract per customer for this flow.

## Deployment And Address Management

Use a factory if possible. A factory gives a repeatable deployment path, makes
verification easier, and can optionally support deterministic addresses through
`CREATE2`.

Suggested deployment record per customer:

- Customer/user ID in Vortex systems.
- Partner static payment reference.
- Per-user contract address on Base.
- Hardcoded Ethereum recipient.
- Constructor arguments.
- Contract implementation/version hash.
- Swap adapter configured at deployment.
- Source verification URL.

If deterministic deployment is useful, derive the salt from stable internal data
that does not leak unnecessary personal information. For example, use a hash of
an internal customer ID plus environment/version data, not raw email addresses
or names.

Once a customer contract address has been given to the partner, treat it as a
long-lived receiving address. If the user changes their final Ethereum wallet,
deploy a new per-user contract and coordinate a mapping update with the partner.
Do not make the old contract recipient mutable just to support address rotation.

## Redeploying On DEX Changes

If absolutely everything is immutable, any DEX or route break requires deploying
a new contract and giving the partner a new per-user address.

This is clean from a control perspective but operationally risky:

- Partner must update mappings.
- Users or partners may accidentally send to old addresses.
- Funds already sitting in the old contract may become stuck if the route breaks.

Recommended compromise:

- Keep recipient and CCTP behavior immutable.
- Make only the swap adapter replaceable.
- Make adapter replacement narrow, visible, and delayed where possible.

## Events To Include

Suggested events:

```solidity
event SweptAndBurned(
    address indexed caller,
    uint256 eurcAmount,
    uint256 usdcAmount,
    uint256 minUsdcOut,
    uint32 destinationDomain,
    bytes32 mintRecipient,
    uint64 cctpNonce
);

event SwapAdapterUpdated(address indexed oldAdapter, address indexed newAdapter);
```

In practice, CCTP also emits `DepositForBurn` and `MessageSent`. The backend
should index those events to track burn nonces and attestation status.

Do not rely on failure events for reverted transactions. Events emitted before a
revert are rolled back. Failed sweeps should be observed through transaction
receipts, RPC simulation, backend logs, and monitoring.

## Key Failure Modes

- No EURC balance: `sweep` should revert cheaply.
- Bad DEX quote or price movement: `sweep` should revert because
  `minUsdcOut` is not met.
- DEX route unavailable: funds remain in the per-user contract until a working
  route or adapter is available.
- CCTP burn fee or allowance issue: transaction reverts before funds leave the
  contract as USDC.
- CCTP burn succeeds but destination mint is delayed: backend must track the
  burn event and attestation state.
- Direct mint relayer lacks Ethereum gas: burn is complete, but mint submission
  waits until a caller submits `receiveMessage`.
- Partner sends to an old contract: funds follow that old contract's hardcoded
  recipient and route constraints; address rotation needs operational controls.

## Backend Responsibilities

The backend/automation service should:

- Track deployed per-user contract addresses.
- Provide addresses to the partner for static-reference mapping.
- Monitor EURC balances on those contracts.
- Quote swaps and decide `minUsdcOut`.
- Call `sweep` when balances are available.
- Track DEX transaction, CCTP burn, attestation, and destination mint.
- Handle failed sweeps and retry safely.
- Reconcile final Ethereum receipt with the customer/ramp state.
- Alert if funds remain idle beyond expected time.

For direct mint, the backend must also:

- Poll Circle's attestation service.
- Submit `receiveMessage(message, attestation)` on Ethereum.
- Maintain ETH for gas, or use a relayer/paymaster setup.
- Retry destination mint submission until complete.

## Testing Checklist

Contract tests:

- Can receive EURC via normal transfer.
- Sweep reverts when EURC balance is zero.
- Sweep swaps EURC to USDC and burns through CCTP with correct parameters.
- Recipient address cannot be changed.
- Owner/admin cannot withdraw EURC or USDC.
- Adapter cannot redirect output to itself or a third party.
- Sweep reverts when USDC received is below `minUsdcOut`.
- Sweep uses exact approvals.
- Reentrancy attempts fail.
- Adapter update emits event and respects access control/timelock.
- Wrong token, wrong recipient, or wrong output behavior fails.

Fork/integration tests:

- Base mainnet fork against selected DEX route.
- Base Sepolia/Ethereum Sepolia CCTP test flow if EURC liquidity/test route is
  available.
- Direct mint end-to-end if using direct mint.
- Forwarding-service end-to-end if using forwarding.

Operational tests:

- Partner static reference maps to contract address.
- Backend detects deposits.
- Backend sweeps with current quote.
- Backend retries failed sweeps.
- Backend handles partial DEX liquidity or high slippage.
- Backend reconciles CCTP burn and Ethereum mint.

## Open Questions

- Which Base DEX or aggregator should be used for EURC -> USDC?
- Is there enough EURC/USDC liquidity on the chosen venue for expected ticket
  sizes?
- Should `sweep` be permissionless, service-only, or hybrid?
- Should the swap adapter be mutable, and if yes, who controls it?
- Is a timelock acceptable operationally for adapter updates?
- Direct mint or forwarding service for the Ethereum mint step?
- What minimum finality threshold should be used for CCTP V2?
- What is the acceptable forwarding fee or CCTP fee behavior?
- Will the stablecoin partner approve transfers to verified per-user settlement
  contracts?
- How will partner/customer records prove that a contract maps to the same known
  customer and hardcoded Ethereum recipient?

## Source Links

- Circle CCTP supported chains and domains:
  https://developers.circle.com/cctp/cctp-supported-blockchains
- Circle CCTP EVM contract interfaces:
  https://developers.circle.com/cctp/references/contract-interfaces
- Circle CCTP EVM contract addresses:
  https://developers.circle.com/cctp/references/contract-addresses
- Circle USDC contract addresses:
  https://developers.circle.com/stablecoins/usdc-contract-addresses
- Circle EURC contract addresses:
  https://developers.circle.com/stablecoins/eurc-contract-addresses
