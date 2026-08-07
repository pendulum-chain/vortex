import {
  useAuthenticateWithJWT,
  useCreateEvmEoaAccount,
  useCurrentUser,
  useIsInitialized,
  useSendEvmTransaction,
  useSignEvmTransaction,
  useSignEvmTypedData
} from "@coinbase/cdp-hooks";
import { ExportWalletModal } from "@coinbase/cdp-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  type Address,
  createPublicClient,
  getAddress,
  http,
  parseTransaction,
  recoverTransactionAddress,
  recoverTypedDataAddress,
  size
} from "viem";
import { baseSepolia, bscTestnet } from "viem/chains";
import { clearSession, getFreshAccessToken, getSession, requestOtp, type VortexSession, verifyOtp } from "./auth";
import { getBscEip1559Fees } from "./bscFees";
import { readJwtMetadata } from "./jwtMetadata";
import { makeVortexTypedDataFixtures, toCdpTypedData } from "./vortexTypedData";

type GateStatus = "fail" | "pass" | "pending";

interface GateResult {
  detail: string;
  status: GateStatus;
}

interface ParentCommand {
  source?: string;
  type?: string;
}

const baseClient = createPublicClient({
  chain: baseSepolia,
  transport: http((import.meta.env.VITE_BASE_SEPOLIA_RPC_URL as string | undefined) || undefined)
});
const bscClient = createPublicClient({
  chain: bscTestnet,
  transport: http((import.meta.env.VITE_BSC_TESTNET_RPC_URL as string | undefined) || undefined)
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function allowedParentOrigin(): string | undefined {
  if (window.parent === window) return undefined;
  const requested = new URLSearchParams(window.location.search).get("parentOrigin");
  if (!requested) return undefined;

  try {
    const parent = new URL(requested);
    const configured = import.meta.env.VITE_SPIKE_PARENT_ORIGIN as string | undefined;
    const localPair =
      ["localhost", "127.0.0.1"].includes(parent.hostname) &&
      ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
      parent.port === window.location.port &&
      parent.protocol === window.location.protocol;
    return configured === parent.origin || localPair ? parent.origin : undefined;
  } catch {
    return undefined;
  }
}

function AuthPanel({ onSession }: { onSession: (session: VortexSession | undefined) => void }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<string>();
  const [working, setWorking] = useState(false);

  const request = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    try {
      await requestOtp(email);
      setMessage("OTP sent. Enter the six-digit code.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    try {
      const session = await verifyOtp(email, otp);
      onSession(session);
      setMessage("Vortex/Supabase session established.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="card">
      <h2>1. Vortex authentication</h2>
      <form onSubmit={request}>
        <label>
          Email
          <input onChange={event => setEmail(event.target.value)} required type="email" value={email} />
        </label>
        <button disabled={working} type="submit">
          Request Vortex OTP
        </button>
      </form>
      <form onSubmit={verify}>
        <label>
          OTP
          <input
            inputMode="numeric"
            maxLength={6}
            onChange={event => setOtp(event.target.value)}
            pattern="[0-9]{6}"
            required
            value={otp}
          />
        </label>
        <button disabled={working} type="submit">
          Verify OTP
        </button>
      </form>
      {message && <p className="result">{message}</p>}
    </section>
  );
}

function Gate({
  children,
  disabled,
  name,
  onRun,
  result
}: {
  children: React.ReactNode;
  disabled?: boolean;
  name: string;
  onRun: () => void;
  result?: GateResult;
}) {
  return (
    <div className="gate">
      <div>
        <strong>{name}</strong>
        <p>{children}</p>
        {result && <p className={`result ${result.status}`}>{result.detail}</p>}
      </div>
      <button disabled={disabled || result?.status === "pending"} onClick={onRun} type="button">
        Run
      </button>
    </div>
  );
}

export function WalletSpike() {
  const contextId = new URLSearchParams(window.location.search).get("context") ?? "standalone";
  const autoAuthenticate = new URLSearchParams(window.location.search).get("auto") === "1";
  const parentOrigin = allowedParentOrigin();
  const [session, setSession] = useState(getSession);
  const [results, setResults] = useState<Record<string, GateResult>>({});
  const [otherUserId, setOtherUserId] = useState("");
  const autoStarted = useRef(false);
  const { authenticateWithJWT } = useAuthenticateWithJWT();
  const { createEvmEoaAccount } = useCreateEvmEoaAccount();
  const { currentUser } = useCurrentUser();
  const { isInitialized } = useIsInitialized();
  const { sendEvmTransaction } = useSendEvmTransaction();
  const { signEvmTransaction } = useSignEvmTransaction();
  const { signEvmTypedData } = useSignEvmTypedData();
  const address = currentUser?.evmAccountObjects?.[0]?.address as Address | undefined;
  const jwtMetadata = session ? readJwtMetadata(session.accessToken) : undefined;

  const setGate = useCallback((gate: string, status: GateStatus, detail: string) => {
    setResults(current => ({ ...current, [gate]: { detail, status } }));
  }, []);

  const run = useCallback(
    async (gate: string, operation: () => Promise<string>) => {
      setGate(gate, "pending", "Running…");
      try {
        setGate(gate, "pass", await operation());
      } catch (error) {
        setGate(gate, "fail", errorMessage(error));
      }
    },
    [setGate]
  );

  const authenticate = useCallback(
    () =>
      run("auth", async () => {
        const token = await getFreshAccessToken();
        if (!token) throw new Error("Vortex session is missing");
        const metadata = readJwtMetadata(token);
        if (metadata.algorithm !== "ES256" && metadata.algorithm !== "RS256") {
          throw new Error(
            `Vortex issued ${metadata.algorithm ?? "an unknown JWT algorithm"} from ${
              metadata.issuer ?? "an unknown issuer"
            }; CDP requires ES256 or RS256`
          );
        }
        const result = await authenticateWithJWT();
        return `CDP user ${result.user.userId}; ${result.isNewUser ? "new" : "restored"} identity`;
      }),
    [authenticateWithJWT, run]
  );

  const signTypedDataGate = useCallback(async (): Promise<string> => {
    if (!address) throw new Error("Create or restore the EOA first");
    const signed: string[] = [];
    for (const fixture of makeVortexTypedDataFixtures(address)) {
      const result = await signEvmTypedData({
        evmAccount: address,
        typedData: toCdpTypedData(fixture)
      });
      const recovered = await recoverTypedDataAddress({
        domain: fixture.domain,
        message: fixture.message,
        primaryType: fixture.primaryType,
        signature: result.signature,
        types: fixture.types
      });
      const recoveryByte = Number.parseInt(result.signature.slice(-2), 16);
      if (getAddress(recovered) !== getAddress(address) || size(result.signature) !== 65) {
        throw new Error(`${fixture.name} returned an incompatible signature`);
      }
      if (recoveryByte !== 27 && recoveryByte !== 28) {
        throw new Error(`${fixture.name} returned v=${recoveryByte}; Vortex requires 27 or 28`);
      }
      signed.push(fixture.name);
    }
    return `PASS: recovered ${signed.length} signatures (${signed.join(", ")})`;
  }, [address, signEvmTypedData]);

  const rawSigningGate = useCallback(async (): Promise<string> => {
    if (!address) throw new Error("Create or restore the EOA first");
    for (const chainId of [baseSepolia.id, bscTestnet.id]) {
      const transaction = {
        chainId,
        data: "0x1234" as const,
        gas: 50_000n,
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 0n,
        nonce: 0,
        to: "0x4444444444444444444444444444444444444444" as Address,
        type: "eip1559" as const,
        value: 7n
      };
      const result = await signEvmTransaction({ evmAccount: address, transaction });
      const recovered = await recoverTransactionAddress({
        serializedTransaction: result.signedTransaction as `0x02${string}`
      });
      const parsed = parseTransaction(result.signedTransaction);
      if (
        getAddress(recovered) !== getAddress(address) ||
        parsed.chainId !== transaction.chainId ||
        parsed.data !== transaction.data ||
        parsed.to !== transaction.to ||
        parsed.value !== transaction.value
      ) {
        throw new Error(`Signed transaction fields changed for chain ${chainId}`);
      }
    }
    return "PASS: exact EIP-1559 transaction recovered on Base Sepolia and BSC testnet";
  }, [address, signEvmTransaction]);

  const directSendGate = useCallback(async (): Promise<string> => {
    if (!address) throw new Error("Create or restore the EOA first");
    const [nonce, gas, fees] = await Promise.all([
      baseClient.getTransactionCount({ address }),
      baseClient.estimateGas({ account: address, to: address, value: 0n }),
      baseClient.estimateFeesPerGas()
    ]);
    if (fees.maxFeePerGas === undefined || fees.maxPriorityFeePerGas === undefined) {
      throw new Error("Base Sepolia RPC did not return EIP-1559 fees");
    }
    const result = await sendEvmTransaction({
      evmAccount: address,
      network: "base-sepolia",
      transaction: {
        chainId: baseSepolia.id,
        gas,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        nonce,
        to: address,
        type: "eip1559",
        value: 0n
      }
    });
    const receipt = await baseClient.waitForTransactionReceipt({ hash: result.transactionHash });
    return `PASS: Base Sepolia direct send confirmed in block ${receipt.blockNumber}`;
  }, [address, sendEvmTransaction]);

  const bscBroadcastGate = useCallback(async (): Promise<string> => {
    if (!address) throw new Error("Create or restore the EOA first");
    const [nonce, gas, gasPrice] = await Promise.all([
      bscClient.getTransactionCount({ address }),
      bscClient.estimateGas({ account: address, to: address, value: 0n }),
      bscClient.getGasPrice()
    ]);
    const fees = getBscEip1559Fees(gasPrice);
    const result = await signEvmTransaction({
      evmAccount: address,
      transaction: {
        chainId: bscTestnet.id,
        gas,
        ...fees,
        nonce,
        to: address,
        type: "eip1559",
        value: 0n
      }
    });
    const hash = await bscClient.sendRawTransaction({ serializedTransaction: result.signedTransaction });
    const receipt = await bscClient.waitForTransactionReceipt({ hash });
    return `PASS: BSC testnet raw transaction confirmed in block ${receipt.blockNumber}`;
  }, [address, signEvmTransaction]);

  const ownershipGate = useCallback(
    async (cdpUserId = currentUser?.userId): Promise<string> => {
      if (!address || !cdpUserId) throw new Error("Authenticate with CDP and restore the EOA first");
      const accessToken = await getFreshAccessToken();
      if (!accessToken) throw new Error("Vortex session is missing");
      const response = await fetch("/__cdp-spike/verify-ownership", {
        body: JSON.stringify({ accessToken, address, cdpUserId }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const body = (await response.json()) as { error?: string; supabaseSubject?: string };
      if (!response.ok) throw new Error(body.error ?? `Ownership probe failed (${response.status})`);
      return `PASS: CDP JWT subject matches Vortex ${body.supabaseSubject}`;
    },
    [address, currentUser?.userId]
  );

  useEffect(() => {
    if (!autoAuthenticate || autoStarted.current || !isInitialized || !session || currentUser) return;
    autoStarted.current = true;
    void authenticate();
  }, [authenticate, autoAuthenticate, currentUser, isInitialized, session]);

  useEffect(() => {
    if (!parentOrigin || !address || !currentUser) return;
    window.parent.postMessage(
      {
        address,
        contextId,
        source: "vortex-cdp-spike",
        type: "context-ready",
        userId: currentUser.userId
      },
      parentOrigin
    );
  }, [address, contextId, currentUser, parentOrigin]);

  useEffect(() => {
    if (!parentOrigin) return;
    const onMessage = (event: MessageEvent<ParentCommand>) => {
      if (
        event.origin !== parentOrigin ||
        event.source !== window.parent ||
        event.data.source !== "vortex-cdp-spike" ||
        event.data.type !== "run-sign-gate"
      ) {
        return;
      }
      void signTypedDataGate()
        .then(detail => {
          window.parent.postMessage({ contextId, detail, source: "vortex-cdp-spike", type: "sign-result" }, parentOrigin);
        })
        .catch(error => {
          window.parent.postMessage(
            { contextId, detail: `FAIL: ${errorMessage(error)}`, source: "vortex-cdp-spike", type: "sign-result" },
            parentOrigin
          );
        });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [contextId, parentOrigin, signTypedDataGate]);

  return (
    <main className="wallet-shell">
      <header className="hero compact">
        <p className="eyebrow">
          Wallet context {contextId} · {window.location.origin}
        </p>
        <h1>Vortex × Coinbase CDP</h1>
        <p>Manual EOA only. No smart account, delegation, Wallet Secret, or production wallet-mode changes.</p>
      </header>

      {!session ? (
        <AuthPanel onSession={setSession} />
      ) : (
        <section className="card">
          <h2>1. Vortex authentication</h2>
          <p>
            Supabase subject: <code>{session.userId}</code>
          </p>
          <dl>
            <dt>JWT algorithm</dt>
            <dd>{jwtMetadata?.algorithm ?? "Missing"}</dd>
            <dt>JWT key ID</dt>
            <dd>{jwtMetadata?.keyId ?? "Missing"}</dd>
            <dt>JWT issuer</dt>
            <dd>{jwtMetadata?.issuer ?? "Missing"}</dd>
          </dl>
          <div className="actions">
            <button disabled={!isInitialized} onClick={authenticate} type="button">
              Authenticate with CDP
            </button>
            <button
              className="secondary"
              onClick={() => {
                clearSession();
                window.location.reload();
              }}
              type="button"
            >
              Clear local session
            </button>
          </div>
          {results.auth && <p className={`result ${results.auth.status}`}>{results.auth.detail}</p>}
        </section>
      )}

      <section className="card">
        <h2>2. CDP identity and EOA</h2>
        <dl>
          <dt>CDP user</dt>
          <dd>{currentUser?.userId ?? "Not authenticated"}</dd>
          <dt>First EOA</dt>
          <dd>{address ?? "Not created"}</dd>
          <dt>EOA count</dt>
          <dd>{currentUser?.evmAccountObjects?.length ?? 0}</dd>
          <dt>Smart account count</dt>
          <dd>{currentUser?.evmSmartAccountObjects?.length ?? 0}</dd>
        </dl>
        <button
          disabled={!currentUser || Boolean(address)}
          onClick={() =>
            void run("create", async () => {
              const created = await createEvmEoaAccount();
              return `Created EOA ${created}`;
            })
          }
          type="button"
        >
          Create EOA manually
        </button>
        {results.create && <p className={`result ${results.create.status}`}>{results.create.detail}</p>}
      </section>

      <section className="card">
        <h2>3. Security and signing gates</h2>
        <Gate
          disabled={!address}
          name="Provider ownership"
          onRun={() => void run("ownership", () => ownershipGate())}
          result={results.ownership}
        >
          Vortex validates the Supabase token, then independently compares its subject and EOA with CDP.
        </Gate>
        <Gate
          disabled={!address}
          name="All Vortex EIP-712 shapes"
          onRun={() => void run("typed-data", signTypedDataGate)}
          result={results["typed-data"]}
        >
          Signs and locally recovers standard permit, salted permit, TokenRelayer, and Permit2 payloads.
        </Gate>
        <Gate
          disabled={!address}
          name="Exact raw transaction fields"
          onRun={() => void run("raw-sign", rawSigningGate)}
          result={results["raw-sign"]}
        >
          Signs without broadcasting, recovers the signer, and compares chain, destination, calldata, and value.
        </Gate>
      </section>

      <section className="card">
        <h2>4. Cross-user negative gate</h2>
        <label>
          Another real CDP user ID
          <input onChange={event => setOtherUserId(event.target.value)} value={otherUserId} />
        </label>
        <Gate
          disabled={!address || !otherUserId}
          name="Reject another user's CDP identity"
          onRun={() =>
            void run("negative-ownership", async () => {
              try {
                await ownershipGate(otherUserId);
              } catch (error) {
                return `PASS: ${errorMessage(error)}`;
              }
              throw new Error("The current Supabase token accessed another CDP user");
            })
          }
          result={results["negative-ownership"]}
        >
          Create a second test user in another browser profile and paste that user ID here.
        </Gate>
      </section>

      <section className="card">
        <h2>5. Live testnet gates</h2>
        <p className="warning">These send zero-value self-transfers but consume testnet gas. Fund the EOA first.</p>
        <Gate
          disabled={!address}
          name="CDP direct send on Base Sepolia"
          onRun={() => void run("base-send", directSendGate)}
          result={results["base-send"]}
        >
          Uses CDP's supported sign-and-send path and waits for the receipt.
        </Gate>
        <Gate
          disabled={!address}
          name="Raw sign and broadcast on BSC testnet"
          onRun={() => void run("bsc-send", bscBroadcastGate)}
          result={results["bsc-send"]}
        >
          Uses CDP only for signing, then broadcasts the serialized EIP-1559 transaction through viem.
        </Gate>
      </section>

      <section className="card">
        <h2>6. Nested secure export</h2>
        <p>Open this from the outer host page. Success requires the Coinbase iframe to initialize and copy the key.</p>
        {address ? (
          <ExportWalletModal
            address={address}
            onCopySuccess={() => setGate("export", "pass", "PASS: secure iframe copied the key")}
            onIframeError={error => setGate("export", "fail", error ?? "Secure iframe failed")}
            onIframeReady={() => setGate("export", "pending", "Secure export iframe is ready; test copy")}
            onIframeSessionExpired={() => setGate("export", "fail", "Secure export session expired")}
          />
        ) : (
          <button disabled type="button">
            Create the EOA first
          </button>
        )}
        {results.export && <p className={`result ${results.export.status}`}>{results.export.detail}</p>}
      </section>
    </main>
  );
}
