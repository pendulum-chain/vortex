import { useEffect, useMemo, useRef, useState } from "react";

interface ContextStatus {
  address?: string;
  detail: string;
  status: "fail" | "pass" | "pending";
  userId?: string;
}

interface SpikeMessage {
  address?: string;
  contextId?: string;
  detail?: string;
  source?: string;
  type?: string;
  userId?: string;
}

function alternativeLocalOrigin(): string {
  const url = new URL(window.location.href);
  url.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.origin;
}

export function HostPage() {
  const walletOrigin = useMemo(alternativeLocalOrigin, []);
  const [contextCount, setContextCount] = useState(1);
  const [contexts, setContexts] = useState<Record<string, ContextStatus>>({});
  const frames = useRef<Record<string, HTMLIFrameElement | null>>({});

  useEffect(() => {
    const onMessage = (event: MessageEvent<SpikeMessage>) => {
      if (event.origin !== walletOrigin || event.data.source !== "vortex-cdp-spike" || !event.data.contextId) return;
      const contextId = event.data.contextId;
      if (event.data.type === "context-ready") {
        setContexts(current => ({
          ...current,
          [contextId]: {
            address: event.data.address,
            detail: "Authenticated and EOA restored",
            status: "pass",
            userId: event.data.userId
          }
        }));
      }
      if (event.data.type === "sign-result") {
        setContexts(current => ({
          ...current,
          [contextId]: {
            ...current[contextId],
            detail: event.data.detail ?? "No result detail",
            status: event.data.detail?.startsWith("PASS") ? "pass" : "fail"
          }
        }));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [walletOrigin]);

  const runFirstContextAfterEviction = () => {
    setContexts(current => ({
      ...current,
      "1": { ...current["1"], detail: "Running signature after all contexts authenticated", status: "pending" }
    }));
    frames.current["1"]?.contentWindow?.postMessage({ source: "vortex-cdp-spike", type: "run-sign-gate" }, walletOrigin);
  };

  const readyContexts = Object.values(contexts).filter(context => context.status === "pass").length;

  return (
    <main className="host-shell">
      <section className="hero">
        <p className="eyebrow">Outer partner page · {window.location.origin}</p>
        <h1>CDP nested-widget and session stress harness</h1>
        <p>
          The wallet frames below run on <code>{walletOrigin}</code>, so Coinbase export is nested inside a real cross-origin
          iframe.
        </p>
        <div className="actions">
          <a className="button secondary" href={`${window.location.origin}/`} rel="noreferrer" target="_blank">
            Open dashboard-origin wallet
          </a>
          <button onClick={() => setContextCount(6)} type="button">
            Add six total wallet contexts
          </button>
          <button disabled={readyContexts < 6} onClick={runFirstContextAfterEviction} type="button">
            Re-test context 1 after context 6
          </button>
        </div>
        <p className="hint">
          First authenticate and create the EOA in context 1. Its Vortex session is shared with the additional frames on the
          wallet origin; they will authenticate with CDP automatically.
        </p>
      </section>

      <section className="context-summary">
        {Array.from({ length: contextCount }, (_, index) => {
          const contextId = String(index + 1);
          const status = contexts[contextId];
          return (
            <div className={`context-chip ${status?.status ?? "idle"}`} key={contextId}>
              <strong>Context {contextId}</strong>
              <span>{status?.detail ?? "Waiting"}</span>
              {status?.address && <code>{status.address}</code>}
            </div>
          );
        })}
      </section>

      <section className="frames">
        {Array.from({ length: contextCount }, (_, index) => {
          const contextId = String(index + 1);
          const src = `${walletOrigin}/?auto=1&context=${contextId}&parentOrigin=${encodeURIComponent(window.location.origin)}`;
          return (
            <iframe
              allow="clipboard-write; payment"
              key={contextId}
              ref={element => {
                frames.current[contextId] = element;
              }}
              src={src}
              title={`CDP wallet context ${contextId}`}
            />
          );
        })}
      </section>
    </main>
  );
}
