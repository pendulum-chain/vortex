import assert from "node:assert/strict";
import test from "node:test";
import * as viemChains from "viem/chains";
import { ROBINHOOD_CHAIN_ID, ethereum, explorerUrl, hexChainId, robinhoodChain, rpcUrl, withRpcOverride } from "../src/chains.js";

const HASH = `0x${"ab".repeat(32)}`;

test("Robinhood Chain is mainnet 4663 with native ETH and Multicall3", () => {
  assert.equal(ROBINHOOD_CHAIN_ID, 4663);
  assert.equal(robinhoodChain.id, 4663);
  assert.equal(robinhoodChain.name, "Robinhood Chain");
  assert.deepEqual(robinhoodChain.nativeCurrency, { name: "Ether", symbol: "ETH", decimals: 18 });
  assert.equal(robinhoodChain.contracts.multicall3.address, "0xcA11bde05977b3631167028862bE2a173976CA11");
  assert.equal(robinhoodChain.rpcUrls.default.http[0], "https://rpc.mainnet.chain.robinhood.com");
  assert.equal(hexChainId(robinhoodChain), "0x1237");
  assert.equal(hexChainId(ethereum), "0x1");
  assert.equal(ethereum.id, 1);
});

test("our definition agrees with viem's once the catalog ships one", () => {
  const shipped = viemChains.robinhood;
  if (!shipped) return; // viem 2.54.6 (today's catalog) has none
  assert.equal(shipped.id, robinhoodChain.id);
  assert.equal(shipped.contracts?.multicall3?.address?.toLowerCase(), robinhoodChain.contracts.multicall3.address.toLowerCase());
});

test("an RPC override has Privy's shape and keeps the public default", () => {
  const url = "https://rpc.example.test/fake-test-only";
  const chain = withRpcOverride(robinhoodChain, url);
  assert.equal(chain.rpcUrls.privyWalletOverride.http[0], url);
  assert.equal(chain.rpcUrls.default.http[0], "https://rpc.mainnet.chain.robinhood.com");
  assert.equal(rpcUrl(chain), url);
  assert.equal(rpcUrl(robinhoodChain), "https://rpc.mainnet.chain.robinhood.com");
  assert.equal(withRpcOverride(robinhoodChain, ""), robinhoodChain);
  assert.equal(robinhoodChain.rpcUrls.privyWalletOverride, undefined);
});

test("explorer links for transactions, addresses and tokens", () => {
  assert.equal(explorerUrl(robinhoodChain, "tx", HASH), `https://robinhoodchain.blockscout.com/tx/${HASH}`);
  assert.equal(explorerUrl(robinhoodChain, "address", "0x0000000000000000000000000000000000000001"), "https://robinhoodchain.blockscout.com/address/0x0000000000000000000000000000000000000001");
  assert.equal(explorerUrl(robinhoodChain, "token", "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"), "https://robinhoodchain.blockscout.com/token/0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC");
  assert.equal(explorerUrl(ethereum, "tx", HASH), `https://etherscan.io/tx/${HASH}`);
  assert.equal(explorerUrl(robinhoodChain, "tx", ""), null);
  assert.throws(() => explorerUrl(robinhoodChain, "block", "1"), /Unknown explorer link kind/);
});
