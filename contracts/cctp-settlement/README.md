# CCTP Settlement Contracts

This Hardhat workspace contains the per-user USDC CCTP settlement PoC.

## Deploy the factory on Base

Configure `contracts/cctp-settlement/.env`:

```env
PRIVATE_KEY=...
BASE_RPC_URL=...

USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
TOKEN_MESSENGER_V2_ADDRESS=0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d
```

Then deploy:

```bash
cd contracts/cctp-settlement
bun run deploy:base
```

The deployed factory address is written to:

```text
contracts/cctp-settlement/ignition/deployments/chain-8453/deployed_addresses.json
```

## Deploy a per-user settlement contract

Add the factory address to `.env`:

```env
SETTLEMENT_FACTORY_ADDRESS=0xYourFactoryAddress
```

Then pass the user's Ethereum mint recipient as the positional argument:

```bash
cd contracts/cctp-settlement
bun run deploy:settlement:base -- 0xUserEthereumRecipient
```

Alternatively, put the recipient in `.env`:

```env
ETHEREUM_MINT_RECIPIENT=0xUserEthereumRecipient
```

and run:

```bash
bun run deploy:settlement:base
```

The command prints the transaction hash, the deployed settlement address, and the immutable Ethereum mint recipient.

## Base Sepolia

Use the Sepolia commands with Base Sepolia addresses in `.env`:

```env
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
TOKEN_MESSENGER_V2_ADDRESS=0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA
BASE_SEPOLIA_RPC_URL=...
```

```bash
bun run deploy:base-sepolia
bun run deploy:settlement:base-sepolia -- 0xUserEthereumRecipient
```

## Sweep USDC through CCTP forwarding

After USDC is transferred to the per-user settlement contract, add the settlement address to `.env`:

```env
SETTLEMENT_ADDRESS=0xYourSettlementAddress
```

Then run:

```bash
bun run sweep:base -- --amount 10.5
```

`--amount` is the total USDC amount to burn, in normal decimal USDC units. The recipient receives this amount minus the actual CCTP and Forwarding Service fees.

By default the task uses:

```text
minFinalityThreshold = 2000
feeTier = medium
```

and fetches `maxFee` from Circle's CCTP fee API with `forward=true` immediately before submitting the transaction.

You can override those values:

```bash
bun run sweep:base -- --amount 10.5 --finality 1000 --fee-tier high
```

If you already have a fee quote, pass the raw USDC subunit value directly:

```bash
bun run sweep:base -- --amount 10.5 --max-fee 250000
```

You can also pass the settlement address as a positional argument instead of using `.env`:

```bash
bun run sweep:base -- 0xYourSettlementAddress --amount 10.5
```

The underlying contract call is:

```solidity
sweepUsdc(usdcAmount, maxFee, minFinalityThreshold)
```

For Base → Ethereum, `minFinalityThreshold` can be `2000` for standard finality or `1000` for fast transfer eligibility. Circle recommends using the `medium` fee tier or higher and querying the fee API immediately before sweeping because forwarding fees fluctuate with destination-chain gas.

If you see `Error HH700: Artifact for contract "PerUserCctpSettlement" not found`, the local Hardhat artifacts are missing. The deployment and sweep tasks run `compile` automatically, so rerunning the same command should regenerate them. You can also run this manually:

```bash
bun run compile
```
