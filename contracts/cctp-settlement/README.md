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

After USDC is transferred to the per-user settlement contract, call:

```solidity
sweepUsdc(usdcAmount, maxFee, minFinalityThreshold)
```

For Base → Ethereum, `minFinalityThreshold` can be `2000` for standard finality. Fetch `maxFee` from Circle's CCTP fee API with `forward=true`; it must cover the CCTP protocol fee and Forwarding Service fee.
