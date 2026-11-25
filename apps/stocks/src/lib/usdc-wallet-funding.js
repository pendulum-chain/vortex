import { encodeFunctionData, erc20Abi, isAddress, isHash, numberToHex } from "viem";
import { local } from "@vortexfi/consumer-kit";
import { BASE_USDC } from "./vortex-stocks.js";

const BASE_ID = 8453;
const MISSING_RECEIPT_REVIEW_MS = 5 * 60_000;
// A request without a hash may still be open in the wallet. Privy stops waiting for it, but never closes it.
const OPEN_REQUEST_REVIEW_MS = 60_000;
// EIP-1193 and WalletConnect. Any other failure may hide a transfer that was sent.
const REJECTED = [4001, 5000];
export const isWalletRejection = error => REJECTED.includes(Number(error?.code));
const keyFor = owner => `satoshi:stocks:usdc:wallet-funding:v1:${owner.toLowerCase()}`;
export const canReviewPendingTransfer = (transfer, now = Date.now()) =>
  Boolean(transfer && now - transfer.requestedAt >= (transfer.hash ? MISSING_RECEIPT_REVIEW_MS : OPEN_REQUEST_REVIEW_MS));

export function createUsdcWalletFunding(adapter, { storage = local, locks = globalThis.navigator?.locks } = {}) {
  const pending = owner => storage.get(keyFor(owner), null);
  const withLock = (owner, fn) => {
    if (!locks) throw Object.assign(new Error("Wallet transfer locking unavailable"), { code: "MANUAL_FUNDING_REQUIRED" });
    return locks.request(keyFor(owner), { ifAvailable: true }, lock => {
      if (!lock) throw Object.assign(new Error("Another transfer is being prepared"), { code: "TRANSFER_PENDING" });
      return fn();
    });
  };
  const send = ({ owner, wallet, shortfall, required, isCurrent = () => true }) => withLock(owner, async () => {
    const key = keyFor(owner);
    if (pending(owner)) throw Object.assign(new Error("Transfer pending"), { code: "TRANSFER_PENDING" });
    if (!isAddress(owner) || !isAddress(wallet?.address || "") || typeof shortfall !== "bigint" || shortfall <= 0n ||
        wallet.address.toLowerCase() === owner.toLowerCase()) throw Object.assign(new Error("Invalid funding account"), { code: "WRONG_ACCOUNT" });

    await wallet.switchChain(BASE_ID);
    const provider = await wallet.getEthereumProvider();
    const from = wallet.address;
    // The user must see and approve any changed funding amount before a transfer can be sent.
    const [latest, confirmed] = await Promise.all([adapter.readBaseBalance(owner, { confirmed: false }), adapter.readBaseBalance(owner)]);
    if (latest !== confirmed || required - confirmed !== shortfall) throw Object.assign(new Error("Funding balance changed"), { code: "FUNDING_BALANCE_CHANGED" });
    const available = await adapter.readBaseBalance(from, { confirmed: false });
    if (available < shortfall) throw Object.assign(new Error("Not enough Base USDC in the sending wallet"), { code: "SENDER_BALANCE" });
    const accounts = await provider.request({ method: "eth_accounts" });
    const chain = await provider.request({ method: "eth_chainId" });
    if (!Array.isArray(accounts) || accounts[0]?.toLowerCase() !== from.toLowerCase() || Number(chain) !== BASE_ID) {
      throw Object.assign(new Error("Funding account or network changed"), { code: "WRONG_ACCOUNT" });
    }
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [owner, shortfall] });
    const transfer = { hash: null, requestedAt: Date.now(), from, amount: String(shortfall) };
    if (!isCurrent()) throw new Error("Checkout closed");
    // A lost response (including navigation out to a mobile wallet) must not offer an automatic resend.
    if (!storage.set(key, transfer)) throw Object.assign(new Error("Cannot save transfer checkpoint"), { code: "MANUAL_FUNDING_REQUIRED" });
    try {
      const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from, to: BASE_USDC.address, data, value: numberToHex(0) }] });
      if (!isHash(hash)) throw new Error("No transaction hash returned");
      if (!storage.set(key, { ...transfer, hash })) throw new Error("Cannot save transaction hash");
    } catch (error) {
      if (isWalletRejection(error)) storage.remove(key);
      throw error;
    }
  });
  return {
    supported: Boolean(locks),
    pending,
    send,
    async check(owner) {
      const transfer = pending(owner);
      if (!transfer?.hash) return null;
      const status = await adapter.readFundingReceipt(transfer.hash);
      if (status && pending(owner)?.hash === transfer.hash) storage.remove(keyFor(owner));
      return status;
    },
    // Only the user can check an interrupted prompt or a replaced send in their wallet. The statement is about
    // the transfer they were shown: another tab may have replaced it since.
    acknowledgeUnsent: (owner, shown) => withLock(owner, async () => {
      const transfer = pending(owner);
      if (transfer?.requestedAt !== shown.requestedAt || transfer.hash !== shown.hash || !canReviewPendingTransfer(transfer)) return;
      if (transfer.hash && await adapter.readFundingReceipt(transfer.hash) === "success") return;
      storage.remove(keyFor(owner));
    }),
  };
}
