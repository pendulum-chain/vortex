/**
 * End-to-end run of the Monerium B2B onramp against a live backend, the sandbox or a local
 * rehearsal (B2B operations runbook §8). It registers a client's destination
 * the way the partner does, waits until the keeper has deployed, linked and activated the
 * account, then waits for one EUR payment and checks on chain that it was converted and
 * forwarded, or refunded with --refund.
 *
 *   bun run monerium-b2b:sandbox-e2e --profile <moneriumProfileId> [--amount 20] [--refund]
 *
 * The Monerium profile must exist in the backend's white-label app. The script asks for the
 * payment and waits; it does not make it. Re-running with the same profile resumes: the
 * registration replays, an unfinished deposit is followed to its end, and otherwise the run
 * waits for a new payment.
 *
 * Environment: VORTEX_SECRET_KEY (the partner manager's sk_test key), VORTEX_API_URL (default
 * the sandbox API), MONERIUM_B2B_RPC_URL, MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS,
 * E2E_DESTINATION (the default destination), optional KEEPER and DEPLOYER addresses for the
 * balance check, and ADMIN_SECRET for --refund, which suspends the account for the payment.
 * Outside the sandbox an operator activates a registered account; with ADMIN_SECRET set the
 * script does that step itself once the IBAN is issued.
 */
import { parseArgs } from "node:util";
import { type AccountSnapshot, type DepositSnapshot, DepositStatus } from "@vortexfi/shared";
import {
  type Address,
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  type Hex,
  hexToNumber,
  http,
  isAddress,
  isAddressEqual,
  parseAbi,
  parseEventLogs,
  parseUnits,
  size,
  slice,
  zeroAddress
} from "viem";
import { fetchCoinbaseReference } from "../src/api/services/monerium-b2b/reference-rate";

const MINUTE = 60_000;
const POLL_MS = 10_000;
const EXPLORER = "https://sepolia.etherscan.io/tx";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const factoryAbi = parseAbi([
  "function implementation() view returns (address)",
  "function USDC() view returns (address)",
  "function route(uint256 index) view returns (bytes path, bool enabled)",
  "function subsidyVault() view returns (address)",
  "function isForwarder(address forwarder) view returns (bool)",
  "function isKeeper(address keeper) view returns (bool)",
  "function isDeployer(address deployer) view returns (bool)"
]);
const forwarderAbi = parseAbi([
  "function ORACLE() view returns (address)",
  "function ORACLE_DECIMALS() view returns (uint8)",
  "function MAX_ORACLE_AGE() view returns (uint256)",
  "function ROUTER() view returns (address)",
  "function RECOVERY_DELAY() view returns (uint256)",
  "function FACTORY() view returns (address)",
  "function destination() view returns (address)"
]);
const oracleAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80)"
]);
const uniswapAbi = parseAbi([
  "function factory() view returns (address)",
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24, uint16, uint16, uint16, uint8, bool)"
]);

/** EURe priced in USDC at `decimals` decimals, from a Uniswap v3 EURe/USDC pool's sqrtPriceX96. */
export function eurePrice(sqrtPriceX96: bigint, eureIsToken0: boolean, decimals: number): bigint {
  // token1 per token0 in base units is sqrtPriceX96² / 2¹⁹², and EURe has 12 more decimals than USDC
  const scale = 10n ** BigInt(12 + decimals);
  const squared = sqrtPriceX96 * sqrtPriceX96;
  return eureIsToken0 ? (squared * scale) / 2n ** 192n : (2n ** 192n * scale) / squared;
}

const log = (message: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${message}`);

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const apiUrl = (process.env.VORTEX_API_URL ?? "https://api-sandbox.vortexfinance.co").replace(/\/$/, "");

async function api<T>(
  method: string,
  path: string,
  options: { admin?: boolean; body?: unknown; profileId?: string } = {}
): Promise<{ body: T; status: number; text: string }> {
  const response = await fetch(`${apiUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      "Content-Type": "application/json",
      ...(options.admin ? { Authorization: `Bearer ${env("ADMIN_SECRET")}` } : { "X-API-Key": env("VORTEX_SECRET_KEY") }),
      ...(options.profileId ? { "X-Managed-Profile-Id": options.profileId } : {})
    },
    method
  });
  const text = await response.text();
  let body: T | undefined;
  try {
    body = text ? (JSON.parse(text) as T) : undefined;
  } catch {
    // not JSON (a proxy error page); callers check the status first
  }
  return { body: body as T, status: response.status, text };
}

async function expectOk<T>(call: Promise<{ body: T; status: number; text: string }>, what: string): Promise<T> {
  const { body, status, text } = await call;
  if (status !== 200) throw new Error(`${what} answered ${status}: ${text}`);
  return body;
}

/** Polls `read` until it returns `done`, logging each change of state. */
async function waitFor<T>(what: string, timeoutMs: number, read: () => Promise<{ done?: T; state: string }>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  for (;;) {
    const { done, state } = await read();
    if (state !== last) log(`${what}: ${state}`);
    last = state;
    if (done !== undefined) return done;
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs / MINUTE} min waiting for ${what} (last: ${state}). Re-run to resume.`);
    }
    await Bun.sleep(POLL_MS);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      amount: { default: "20", type: "string" },
      "client-ref": { type: "string" },
      destination: { type: "string" },
      email: { type: "string" },
      profile: { type: "string" },
      refund: { default: false, type: "boolean" }
    }
  });
  const moneriumProfileId = values.profile?.toLowerCase();
  if (!moneriumProfileId || !UUID.test(moneriumProfileId)) throw new Error("--profile <moneriumProfileId> is required");
  const destination = values.destination ?? process.env.E2E_DESTINATION;
  if (!destination || !isAddress(destination)) throw new Error("--destination or E2E_DESTINATION must be an address");
  if (!/^\d+(\.\d{1,2})?$/.test(values.amount)) throw new Error("--amount must be EUR to the cent, like 20 or 20.50");
  const amountRaw = parseUnits(values.amount, 18);
  if (values.refund) env("ADMIN_SECRET");

  const chain = createPublicClient({ transport: http(env("MONERIUM_B2B_RPC_URL")) });
  const factory = env("MONERIUM_B2B_FORWARDER_FACTORY_ADDRESS") as Address;

  // ---- preflight: the backend answers the key, and nothing on chain makes every swap revert or wait
  const probe = await api("GET", "/v1/monerium-b2b/registrations?limit=1");
  if (probe.status === 404) throw new Error(`${apiUrl} has no B2B routes: MONERIUM_B2B_ENABLED is off there`);
  if (probe.status !== 200) throw new Error(`The key cannot read registrations (${probe.status}): ${probe.text}`);

  const implementation = await chain.readContract({ abi: factoryAbi, address: factory, functionName: "implementation" });
  const [oracle, decimals, maxOracleAge, router, recoveryDelay, usdc, [path, routeEnabled], vault] = await Promise.all([
    chain.readContract({ abi: forwarderAbi, address: implementation, functionName: "ORACLE" }),
    chain.readContract({ abi: forwarderAbi, address: implementation, functionName: "ORACLE_DECIMALS" }),
    chain.readContract({ abi: forwarderAbi, address: implementation, functionName: "MAX_ORACLE_AGE" }),
    chain.readContract({ abi: forwarderAbi, address: implementation, functionName: "ROUTER" }),
    chain.readContract({ abi: forwarderAbi, address: implementation, functionName: "RECOVERY_DELAY" }),
    chain.readContract({ abi: factoryAbi, address: factory, functionName: "USDC" }),
    chain.readContract({ abi: factoryAbi, address: factory, args: [0n], functionName: "route" }),
    chain.readContract({ abi: factoryAbi, address: factory, functionName: "subsidyVault" })
  ]);
  const [, oracleAnswer, , updatedAt] = await chain.readContract({
    abi: oracleAbi,
    address: oracle,
    functionName: "latestRoundData"
  });
  const oracleAge = BigInt(Math.floor(Date.now() / 1000)) - updatedAt;
  if (oracleAge > maxOracleAge) throw new Error(`Chainlink EUR/USD is ${oracleAge / 3600n} h old: every swap would revert`);
  if (!routeEnabled) log("WARN route 0 is disabled; off mainnet the keeper swaps on the first enabled route");

  // Off mainnet the keeper does not quote: it swaps on route 0, our own pool, which nothing re-centres.
  if (size(path) === 43) {
    const [eure, fee, out] = [slice(path, 0, 20), hexToNumber(slice(path, 20, 23)), slice(path, 23, 43)];
    const uniswapFactory = await chain.readContract({ abi: uniswapAbi, address: router, functionName: "factory" });
    const pool = await chain.readContract({
      abi: uniswapAbi,
      address: uniswapFactory,
      args: [eure, out, fee],
      functionName: "getPool"
    });
    const [[sqrtPriceX96], reference] = await Promise.all([
      chain.readContract({ abi: uniswapAbi, address: pool, functionName: "slot0" }),
      fetchCoinbaseReference(decimals)
    ]);
    const price = eurePrice(sqrtPriceX96, BigInt(eure) < BigInt(out), decimals);
    const deviationBps = Number(((price - reference.rateRaw) * 10_000n) / reference.rateRaw);
    log(
      `pool ${formatUnits(price, decimals)} USDC/EURe, reference ${reference.price} (${deviationBps} bps), ` +
        `Chainlink ${formatUnits(oracleAnswer, decimals)} (${oracleAge / 60n} min old)`
    );
    // the client's floor is the reference less 15 bps; below it a swap waits for the subsidy ladder
    if (deviationBps < -10) log("WARN EURe is cheap in the pool, so swaps will wait. Re-centre it (runbook §8.9)");
  }

  for (const [role, check] of [
    ["KEEPER", "isKeeper"],
    ["DEPLOYER", "isDeployer"]
  ] as const) {
    const address = process.env[role];
    if (!address || !isAddress(address)) continue;
    const [granted, balance] = await Promise.all([
      chain.readContract({ abi: factoryAbi, address: factory, args: [address], functionName: check }),
      chain.getBalance({ address })
    ]);
    log(`${role.toLowerCase()} ${address}: ${formatEther(balance)} ETH${granted ? "" : ", NOT granted on the factory"}`);
  }
  if (vault === zeroAddress) {
    log("WARN no subsidy vault: a fill below the client's floor waits instead of being topped up");
  } else {
    const vaultUsdc = await chain.readContract({ abi: erc20Abi, address: usdc, args: [vault], functionName: "balanceOf" });
    log(`subsidy vault ${vault}: ${formatUnits(vaultUsdc, 6)} USDC`);
  }

  // ---- register the destination, as the partner does
  // One client reference and contact email per profile: a manager's clients may not share either.
  const externalSubjectId = values["client-ref"] ?? `e2e-${moneriumProfileId.slice(0, 8)}`;
  const contactEmail = values.email ?? `${externalSubjectId}@example.com`;
  const registration = await api("POST", "/v1/monerium-b2b/accounts", {
    body: { contactEmail, destination, externalSubjectId, moneriumProfileId }
  });
  if (registration.status !== 200 && registration.status !== 202) {
    throw new Error(`Registration answered ${registration.status}: ${registration.text}`);
  }
  log(registration.status === 202 ? "registered the destination" : "registration exists, resuming");

  // ---- the keeper waits for Monerium's approval, deploys, maps, links and requests the IBAN
  type Registration = {
    accountId: string | null;
    rejectedReason: string | null;
    status: string;
    waitingReason: string | null;
  };
  await waitFor("registration", 30 * MINUTE, async () => {
    const { registrations } = await expectOk(
      api<{ registrations: Registration[] }>("GET", `/v1/monerium-b2b/registrations?moneriumProfileId=${moneriumProfileId}`),
      "Registrations"
    );
    const [current] = registrations;
    if (current?.status === "rejected") {
      throw new Error(`Registration rejected: ${current.rejectedReason}. Fix the cause and re-run to register again.`);
    }
    const waiting = current?.waitingReason ? ` (${current.waitingReason})` : "";
    return { done: current?.accountId ?? undefined, state: `${current?.status ?? "missing"}${waiting}` };
  });
  const account = await waitFor("account", 30 * MINUTE, async () => {
    const { accounts } = await expectOk(
      api<{ accounts: AccountSnapshot[] }>("GET", `/v1/monerium-b2b/accounts?moneriumProfileId=${moneriumProfileId}`),
      "Accounts"
    );
    const [current] = accounts;
    if (!current) return { state: "not listed yet" };
    if (current.status === "onboarding" && current.iban && process.env.ADMIN_SECRET) {
      await expectOk(
        api("PATCH", `/v1/admin/monerium-b2b/accounts/${current.accountId}/status`, {
          admin: true,
          body: { status: "active" }
        }),
        "Activating the account"
      );
      log("activated the account, as the operator does after checking the destination");
      return { state: "activated" };
    }
    return {
      done: current.status === "active" && current.iban ? current : undefined,
      state: `${current.status}, IBAN ${current.iban ?? "not issued yet"}`
    };
  });

  const forwarder = account.forwarderAddress as Address;
  const [isForwarder, cloneFactory, cloneDestination] = await Promise.all([
    chain.readContract({ abi: factoryAbi, address: factory, args: [forwarder], functionName: "isForwarder" }),
    chain.readContract({ abi: forwarderAbi, address: forwarder, functionName: "FACTORY" }),
    chain.readContract({ abi: forwarderAbi, address: forwarder, functionName: "destination" })
  ]);
  if (!isForwarder || !isAddressEqual(cloneFactory, factory)) throw new Error(`${forwarder} is not a clone of ${factory}`);
  if (!isAddressEqual(cloneDestination, destination)) throw new Error(`The clone pays ${cloneDestination}, not ${destination}`);
  log(`forwarder ${forwarder} pays ${destination}`);

  const deposits = async () =>
    (
      await expectOk(
        api<{ deposits: DepositSnapshot[] }>("GET", "/v1/monerium-b2b/deposits?limit=100", {
          profileId: account.profileId as string
        }),
        "Deposits"
      )
    ).deposits;
  const setStatus = (status: "active" | "suspended") =>
    expectOk(
      api("PATCH", `/v1/admin/monerium-b2b/accounts/${account.accountId}/status`, { admin: true, body: { status } }),
      `Setting the account ${status}`
    );

  // ---- the payment: a suspended account converts nothing, so its payment runs into the refund window
  const terminal = [DepositStatus.FORWARDED, DepositStatus.REFUNDED, DepositStatus.RECOVERY_FAILED, DepositStatus.RETURNED];
  const existing = await deposits();
  const unfinished = existing.find(candidate => !terminal.includes(candidate.status));
  if (unfinished && values.refund) {
    throw new Error(
      `Deposit ${unfinished.depositId} is still ${unfinished.status}; let it settle (run without --refund) first`
    );
  }
  if (values.refund) {
    await setStatus("suspended");
    log("suspended the account so the payment is refunded");
  }
  try {
    let deposit = unfinished;
    if (deposit) {
      log(`following deposit ${deposit.depositId} of EUR ${deposit.amount} from an earlier run`);
    } else {
      log(`PAY EUR ${values.amount} to ${account.iban} in Monerium's sandbox now`);
      deposit = await waitFor("payment", 60 * MINUTE, async () => {
        const fresh = (await deposits()).find(candidate => !existing.some(known => known.depositId === candidate.depositId));
        return { done: fresh, state: fresh ? `deposit ${fresh.depositId}` : "nothing received" };
      });
      if (BigInt(deposit.amountRaw) !== amountRaw) {
        throw new Error(`The deposit is EUR ${deposit.amount}, not the EUR ${values.amount} this run expects`);
      }
    }

    const { depositId } = deposit;
    const settleMinutes = values.refund ? Number(recoveryDelay) / 60 + 45 : 45;
    const settled = await waitFor("deposit", settleMinutes * MINUTE, async () => {
      const current = (await deposits()).find(candidate => candidate.depositId === depositId);
      if (!current) throw new Error(`Deposit ${depositId} disappeared from the deposits list`);
      const confirmed = current.conversions.filter(conversion => conversion.status === "confirmed").length;
      const waiting = current.waiting ? `, waiting: ${current.waiting.reason}` : "";
      const finished =
        terminal.includes(current.status) && (current.status !== DepositStatus.FORWARDED || current.forwardTxHash);
      return {
        done: finished ? current : undefined,
        state: `${current.status}${waiting}, ${confirmed}/${current.conversions.length} chunks confirmed`
      };
    });

    if (values.refund) {
      if (settled.status !== DepositStatus.REFUNDED) {
        throw new Error(`The deposit ended ${settled.status}${settled.refund ? "" : " without a refund"}, not refunded`);
      }
      const refunded = settled.refund?.amount ? parseUnits(settled.refund.amount, 18) : 0n;
      if (refunded !== BigInt(settled.amountRaw) || !settled.refund?.recoverTxHash) {
        throw new Error(`The refund does not return EUR ${settled.amount}: ${JSON.stringify(settled.refund)}`);
      }
      log(`PASS EUR ${settled.amount} refunded to ${settled.refund.payerIbanMasked}`);
      log(`  recover ${EXPLORER}/${settled.refund.recoverTxHash}`);
      return;
    }

    if (settled.status !== DepositStatus.FORWARDED) {
      throw new Error(`The deposit ended ${settled.status}: ${settled.rejectedReason ?? JSON.stringify(settled.refund)}`);
    }
    const chunkSum = settled.conversions.reduce((sum, conversion) => sum + BigInt(conversion.usdcNetRaw), 0n);
    if (chunkSum !== BigInt(settled.usdcNetRaw)) {
      throw new Error(`The chunks sum to ${chunkSum} USDC base units, the deposit reports ${settled.usdcNetRaw}`);
    }
    const receipt = await chain.getTransactionReceipt({ hash: settled.forwardTxHash as Hex });
    const payouts = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs }).filter(
      transfer =>
        isAddressEqual(transfer.address, usdc) &&
        isAddressEqual(transfer.args.from, forwarder) &&
        isAddressEqual(transfer.args.to, destination)
    );
    if (receipt.status !== "success" || payouts.length !== 1 || payouts[0].args.value !== BigInt(settled.usdcNetRaw)) {
      throw new Error(`The forward transaction does not pay ${settled.usdcNetRaw} USDC base units to ${destination}`);
    }
    log(
      `PASS EUR ${settled.amount} became ${formatUnits(BigInt(settled.usdcNetRaw), 6)} USDC at ${destination} ` +
        `in ${settled.conversions.length} chunk(s)`
    );
    log(`  mint    ${EXPLORER}/${settled.txHash}`);
    for (const conversion of settled.conversions) log(`  chunk   ${EXPLORER}/${conversion.txHash}`);
    log(`  forward ${EXPLORER}/${settled.forwardTxHash}`);
  } finally {
    if (values.refund) {
      await setStatus("active");
      log("reactivated the account");
    }
  }
}

if (import.meta.main) {
  main().catch(error => {
    console.error(`FAIL ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
