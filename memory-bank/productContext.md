# Product Context: Pendulum Pay (Vortex)

## Why This Project Exists

Pendulum Pay (Vortex) exists to bridge the gap between traditional fiat currencies and blockchain-based stablecoins. It
provides a seamless way for users to convert between fiat currencies (EUR, BRL, ARS) and stablecoins (USDC, USDT, BRLA)
across different blockchain networks.

## Problems It Solves

1. **Accessibility Barriers**: Traditional financial systems often have limited accessibility, especially in emerging
   markets. Vortex provides an alternative on-ramp and off-ramp solution.

2. **Cross-Chain Complexity**: Moving assets between different blockchain networks is complex. Vortex simplifies this
   process by handling the technical details.

3. **Fiat-to-Crypto Conversion**: Converting between fiat currencies and cryptocurrencies typically requires multiple
   steps and platforms. Vortex streamlines this into a single flow.

4. **Transaction Reliability**: Blockchain transactions can fail due to various reasons. Vortex ensures transactions are
   properly executed and provides recovery mechanisms.

## How It Should Work

### Offramping Flow

1. User selects a stablecoin (USDC or USDT) from an EVM chain or USDC from Assethub
2. User specifies the amount to convert and the target fiat currency (EUR, ARS, or BRL)
3. For Brazilian users, bank account details are collected
4. The system generates a quote with the expected conversion rate
5. User approves the transaction
6. The system executes the conversion and delivers the fiat currency to the user

### Onramping Flow

1. User starts with BRL in their bank account
2. User specifies the amount to convert and the target token
3. User provides their wallet address and selects the target network (EVM chain or Assethub)
4. The system generates a quote with the expected conversion rate
5. User approves the transaction
6. The system converts the fiat BRL to BRLA stablecoin and then to the target token
7. The system sends the tokens to the specified wallet address

## User Experience Goals

1. **Simplicity**: Users should be able to complete transactions without understanding the underlying blockchain
   technology.

2. **Transparency**: Users should have clear visibility into exchange rates, fees, and transaction status.

3. **Reliability**: The system should handle errors gracefully and provide clear feedback on transaction status.

4. **Security**: User funds should be secure throughout the process, with no private keys stored on the backend.

5. **Efficiency**: Transactions should be processed quickly, with minimal waiting time for users.
