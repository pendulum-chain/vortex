# CDP embedded-wallet compatibility spike

This disposable app tests Coinbase CDP against Vortex's existing wallet invariants without changing either the
dashboard or widget wallet provider.

It covers:

- Supabase custom-auth restoration to the same EOA;
- independent server-side `sub` and address ownership verification;
- the current ERC-20 permit, salted permit, TokenRelayer payload, and Permit2 EIP-712 shapes;
- raw EVM signing for chains outside CDP's direct-send list;
- Base Sepolia direct send and BSC testnet raw-sign-and-broadcast paths;
- secure export inside a cross-origin parent iframe;
- six concurrent browser contexts to exercise Temporary Wallet Secret eviction.

## Run

1. Copy `.env.example` to `.env.local` and fill in the CDP project ID and Vortex API URL.
2. From the repository root, run `bun install`.
3. Run `bun run --cwd apps/cdp-spike dev`.
4. Open `http://127.0.0.1:5190/?role=host`.

The host loads the wallet app from `http://localhost:5190`, making it cross-origin without requiring a second server.
Only the wallet origin needs CDP access, so `http://localhost:5190` must be allowlisted in the CDP project; CDP does
not return its CORS header for the equivalent `127.0.0.1` origin. The app uses Vortex's normal email OTP endpoints;
it proxies those requests through the local Vite server so the API's production CORS policy does not need to allow
a development origin. It never asks for or stores a CDP Wallet Secret, and it does not enable delegation or smart
accounts.

The two broadcast gates are intentionally user-triggered. They send zero-value self-transfers on testnets but still
consume testnet gas.
