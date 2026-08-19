import {
  EPaymentMethod,
  EvmToken,
  FiatToken,
  Networks,
  type QuoteResponse,
  RampDirection,
  VortexSdk,
  VortexSdkError
} from "@vortexfi/sdk";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  clearAuthTokens,
  clearPendingPayment,
  createAccessTokenProvider,
  loadAuthTokens,
  loadRampHistory,
  markRampStarted,
  type RampSnapshot,
  requestOtp,
  storeRampSnapshot,
  updateRampSnapshots,
  verifyOtp
} from "./browserState";
import "./vortexModal.css";

export interface VortexModalProps {
  apiBaseUrl: string;
  destinationAddress: string;
  onClose: () => void;
  open: boolean;
}

type AuthStage = "email" | "otp" | "ready";
type Screen = "quote" | "history" | "payment";

type PaymentRamp = RampSnapshot & { depositQrCode: string };

const POLL_INTERVAL_MS = 8_000;
const BRL_AMOUNT = /^\d+(?:\.\d{1,2})?$/;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function isValidAmount(value: string): boolean {
  return BRL_AMOUNT.test(value) && !/^0+(?:\.0+)?$/.test(value);
}

function formatDisplayAmount(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : value;
}

function createBrlQuote(sdk: VortexSdk, amount: string) {
  return sdk.createQuote({
    from: EPaymentMethod.PIX,
    inputAmount: amount,
    inputCurrency: FiatToken.BRL,
    network: Networks.BSC,
    outputCurrency: EvmToken.USDC,
    paymentMethod: EPaymentMethod.PIX,
    rampType: RampDirection.BUY,
    to: Networks.BSC
  });
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof VortexSdkError && error.status === 401;
}

export function VortexModal({ apiBaseUrl, destinationAddress, onClose, open }: VortexModalProps) {
  const [amount, setAmount] = useState("100");
  const [authStage, setAuthStage] = useState<AuthStage>("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RampSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [paymentRamp, setPaymentRamp] = useState<PaymentRamp | null>(null);
  const [paymentExpired, setPaymentExpired] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [screen, setScreen] = useState<Screen>("quote");
  const quoteRequestId = useRef(0);

  const accessTokenProvider = useMemo(() => createAccessTokenProvider(apiBaseUrl, window.localStorage), [apiBaseUrl]);
  const sdk = useMemo(
    () =>
      new VortexSdk({
        accessTokenProvider,
        apiBaseUrl
      }),
    [accessTokenProvider, apiBaseUrl]
  );

  useEffect(() => {
    if (!open) return;
    const storedHistory = loadRampHistory(window.localStorage);
    const pendingPayment = storedHistory.find(
      (item): item is PaymentRamp => item.awaitingPayment === true && Boolean(item.depositQrCode)
    );
    const authenticated = Boolean(loadAuthTokens(window.localStorage));
    setAuthStage(authenticated ? "ready" : "email");
    setError(null);
    setHistory(storedHistory);
    setMenuOpen(false);
    setPaymentRamp(pendingPayment ?? null);
    setScreen(pendingPayment && authenticated ? "payment" : "quote");
  }, [open]);

  useEffect(() => {
    const requestId = ++quoteRequestId.current;
    if (!open || screen !== "quote") return;
    if (!isValidAmount(amount)) {
      setQuote(null);
      setQuoteLoading(false);
      return;
    }

    setQuoteLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void createBrlQuote(sdk, amount)
        .then(nextQuote => {
          if (requestId === quoteRequestId.current) setQuote(nextQuote);
        })
        .catch(fetchError => {
          if (requestId === quoteRequestId.current) {
            setQuote(null);
            setError(errorMessage(fetchError));
          }
        })
        .finally(() => {
          if (requestId === quoteRequestId.current) setQuoteLoading(false);
        });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [amount, open, screen, sdk]);

  const historyIds = history.map(item => item.id).join(",");
  useEffect(() => {
    if (!open || !historyIds) return;
    const ids = historyIds.split(",");
    let active = true;
    let pollTimer: number | undefined;

    const poll = async () => {
      const results = await Promise.allSettled(ids.map(id => sdk.getRampStatus(id)));
      if (!active) return;
      const updates = results.flatMap((result, index) =>
        result.status === "fulfilled"
          ? [{ currentPhase: String(result.value.currentPhase), id: ids[index], status: String(result.value.status) }]
          : []
      );
      if (updates.length) {
        const nextHistory = updateRampSnapshots(window.localStorage, updates);
        setHistory(nextHistory);
        setPaymentRamp(current => {
          if (!current || nextHistory.find(item => item.id === current.id)?.awaitingPayment !== false) return current;
          setScreen(activeScreen => (activeScreen === "payment" ? "quote" : activeScreen));
          return null;
        });
      }
      pollTimer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    void poll();
    return () => {
      active = false;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [historyIds, open, sdk]);

  useEffect(() => {
    if (!paymentRamp) {
      setPaymentExpired(false);
      return;
    }
    const remaining = Date.parse(paymentRamp.expiresAt) - Date.now();
    if (remaining <= 0) {
      setPaymentExpired(true);
      return;
    }
    setPaymentExpired(false);
    const expiryTimer = window.setTimeout(() => setPaymentExpired(true), remaining);
    return () => window.clearTimeout(expiryTimer);
  }, [paymentRamp]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const handlePrimaryAction = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || (authStage === "ready" && !quote)) return;
    setError(null);
    setLoading(true);

    try {
      if (authStage === "email") {
        await requestOtp(apiBaseUrl, email.trim());
        setAuthStage("otp");
      } else if (authStage === "otp") {
        await verifyOtp(apiBaseUrl, email.trim(), otp.trim(), window.localStorage);
        setAuthStage("ready");
        if (paymentRamp) setScreen("payment");
      } else {
        if (!quote) throw new Error("A current quote is required to continue");
        const activeQuote = new Date(quote.expiresAt).getTime() > Date.now() ? quote : await createBrlQuote(sdk, amount);
        setQuote(activeQuote);
        const { rampProcess } = await sdk.registerRamp(activeQuote, { destinationAddress });
        if (!rampProcess.depositQrCode) throw new Error("PIX payment instructions were not returned");
        const snapshot = {
          awaitingPayment: true,
          createdAt: rampProcess.createdAt,
          currentPhase: String(rampProcess.currentPhase),
          depositQrCode: rampProcess.depositQrCode,
          expiresAt: new Date(rampProcess.expiresAt ?? activeQuote.expiresAt).toISOString(),
          id: rampProcess.id,
          inputAmount: rampProcess.inputAmount,
          outputAmount: rampProcess.outputAmount,
          status: String(rampProcess.status)
        };
        setHistory(storeRampSnapshot(window.localStorage, snapshot));
        setPaymentRamp(snapshot);
        setScreen("payment");
      }
    } catch (actionError) {
      if (isUnauthorized(actionError)) {
        clearAuthTokens(window.localStorage);
        setAuthStage("email");
      }
      setError(errorMessage(actionError));
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentMade = async () => {
    if (!paymentRamp || loading) return;
    if (Date.parse(paymentRamp.expiresAt) <= Date.now()) {
      setPaymentExpired(true);
      setError("This PIX payment window has expired. Do not pay this code.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const started = await sdk.startRamp(paymentRamp.id);
      setHistory(markRampStarted(window.localStorage, paymentRamp.id, String(started.currentPhase), String(started.status)));
      setPaymentRamp(null);
      setQuote(null);
      setScreen("quote");
    } catch (startError) {
      if (isUnauthorized(startError)) {
        clearAuthTokens(window.localStorage);
        setAuthStage("email");
        setScreen("quote");
        setError("Your session expired. Sign in again to confirm this payment.");
        return;
      }
      try {
        const current = await sdk.getRampStatus(paymentRamp.id);
        if (String(current.currentPhase) !== "initial") {
          setHistory(
            markRampStarted(window.localStorage, paymentRamp.id, String(current.currentPhase), String(current.status))
          );
          setPaymentRamp(null);
          setQuote(null);
          setScreen("quote");
          return;
        }
      } catch {
        // Keep the original start error; status reconciliation is best effort.
      }
      setError(errorMessage(startError));
    } finally {
      setLoading(false);
    }
  };

  const handleExpiredPayment = () => {
    if (!paymentRamp) return;
    setHistory(clearPendingPayment(window.localStorage, paymentRamp.id));
    setPaymentRamp(null);
    setQuote(null);
    setScreen("quote");
    setError(null);
  };

  const handleSignOut = () => {
    clearAuthTokens(window.localStorage);
    setAuthStage("email");
    setOtp("");
    setScreen("quote");
    setMenuOpen(false);
    setError(null);
  };

  const handleCopy = async () => {
    if (!paymentRamp) return;
    try {
      await navigator.clipboard.writeText(paymentRamp.depositQrCode);
    } catch {
      setError("Copy failed. Select the PIX code and copy it manually.");
    }
  };

  if (!open) return null;

  const primaryLabel = authStage === "email" ? "Sign-up" : authStage === "otp" ? "Verify code" : "Continue";
  const primaryDisabled =
    loading ||
    (authStage === "ready" && (quoteLoading || !quote)) ||
    (authStage === "email" && !email.trim().includes("@")) ||
    (authStage === "otp" && !otp.trim()) ||
    (authStage === "ready" && !destinationAddress);

  return (
    <div className="vortex-demo-backdrop">
      <section aria-label="Buy USDC with PIX" aria-modal="true" className="vortex-demo-modal" role="dialog">
        <header className="vortex-demo-header">
          <div>
            <span className="vortex-demo-eyebrow">VORTEX / BSC</span>
            <h2>{screen === "history" ? "Your ramps" : screen === "payment" ? "Pay with PIX" : "Buy USDC"}</h2>
          </div>
          <div className="vortex-demo-header-actions">
            <button aria-label="Close" className="vortex-demo-icon-button" onClick={onClose} type="button">
              &#215;
            </button>
            <div className="vortex-demo-menu">
              <button
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Open menu"
                className="vortex-demo-menu-button"
                onClick={() => setMenuOpen(current => !current)}
                type="button"
              >
                <span />
                <span />
                <span />
              </button>
              {menuOpen && (
                <div className="vortex-demo-menu-popover" role="menu">
                  <button
                    onClick={() => {
                      setError(null);
                      setMenuOpen(false);
                      setScreen(
                        screen === "history" ? (paymentRamp && authStage === "ready" ? "payment" : "quote") : "history"
                      );
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {screen === "history" ? "Back to quote" : "Ramp history"}
                  </button>
                  {authStage === "ready" && (
                    <button onClick={handleSignOut} role="menuitem" type="button">
                      Sign out
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {screen === "history" ? (
          <div className="vortex-demo-history">
            {history.length === 0 ? (
              <p className="vortex-demo-empty">No ramps yet. Your recent PIX purchases will appear here.</p>
            ) : (
              history.map(item => (
                <article className="vortex-demo-history-item" key={item.id}>
                  <div>
                    <strong>R$ {item.inputAmount}</strong>
                    <span>{formatDisplayAmount(item.outputAmount)} USDC</span>
                  </div>
                  <div className="vortex-demo-history-status">
                    <span>{item.status ?? item.currentPhase}</span>
                    <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString()}</time>
                  </div>
                </article>
              ))
            )}
            <p className="vortex-demo-poll-note">Statuses refresh while this modal is open.</p>
          </div>
        ) : screen === "payment" && paymentRamp ? (
          <div className="vortex-demo-payment">
            <div className="vortex-demo-payment-summary">
              <span>PIX amount</span>
              <strong>R$ {paymentRamp.inputAmount}</strong>
            </div>
            {paymentExpired ? (
              <p className="vortex-demo-error">This PIX payment window has expired. Do not pay this code.</p>
            ) : (
              <>
                <div className="vortex-demo-qr">
                  <QRCodeSVG bgColor="transparent" size={190} value={paymentRamp.depositQrCode} />
                </div>
                <label className="vortex-demo-label" htmlFor="vortex-pix-code">
                  PIX copy and paste code
                </label>
                <textarea id="vortex-pix-code" readOnly rows={3} value={paymentRamp.depositQrCode} />
                <button className="vortex-demo-copy-button" onClick={() => void handleCopy()} type="button">
                  Copy code
                </button>
              </>
            )}
            {error && <p className="vortex-demo-error">{error}</p>}
            <button
              className="vortex-demo-primary"
              disabled={loading}
              onClick={paymentExpired ? handleExpiredPayment : handlePaymentMade}
              type="button"
            >
              {paymentExpired ? "Start a new quote" : loading ? "Starting..." : "I've made the payment"}
            </button>
          </div>
        ) : (
          <form className="vortex-demo-form" onSubmit={handlePrimaryAction}>
            <div className="vortex-demo-corridor">
              <span>BRL</span>
              <div className="vortex-demo-route-line" />
              <small>PIX</small>
              <div className="vortex-demo-route-line" />
              <span>USDC</span>
            </div>

            <label className="vortex-demo-label" htmlFor="vortex-brl-amount">
              You pay
            </label>
            <div className="vortex-demo-amount-field">
              <span>R$</span>
              <input
                autoFocus
                id="vortex-brl-amount"
                inputMode="decimal"
                onChange={event => setAmount(event.target.value)}
                value={amount}
              />
              <b>BRL</b>
            </div>

            <div className="vortex-demo-quote-card">
              <span>You receive on BNB Smart Chain</span>
              <strong>
                {quoteLoading ? "Fetching quote..." : quote ? `${formatDisplayAmount(quote.outputAmount)} USDC` : "-"}
              </strong>
              {quote && <small>Includes R$ {quote.totalFeeFiat} in fees</small>}
            </div>

            {authStage === "email" && (
              <label className="vortex-demo-label" htmlFor="vortex-email">
                Login to transact
                <input
                  autoComplete="email"
                  id="vortex-email"
                  onChange={event => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
            )}
            {authStage === "otp" && (
              <label className="vortex-demo-label" htmlFor="vortex-otp">
                Verification code
                <input
                  autoComplete="one-time-code"
                  id="vortex-otp"
                  inputMode="numeric"
                  onChange={event => setOtp(event.target.value)}
                  required
                  value={otp}
                />
              </label>
            )}
            {authStage === "ready" && (
              <p className="vortex-demo-session">
                {destinationAddress ? "Signed in. Ready to create the PIX payment." : "Connect a BSC wallet to continue."}
              </p>
            )}
            {error && <p className="vortex-demo-error">{error}</p>}
            <button className="vortex-demo-primary" disabled={primaryDisabled} type="submit">
              {loading ? "Please wait..." : primaryLabel}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
