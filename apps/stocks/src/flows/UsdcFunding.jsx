import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatUnits } from "viem";
import { formatCostAmount } from "../lib/fee-summary.js";
import { ArrowRight, Check, Copy, Wallet } from "../components/icons.js";
import { canReviewPendingTransfer } from "../lib/usdc-wallet-funding.js";
import { BASE_USDC } from "../lib/vortex-stocks.js";

const short = address => `${address.slice(0, 6)}…${address.slice(-4)}`;
const amount = (raw, locale) => formatCostAmount(raw == null ? null : Number(formatUnits(raw, 6)), "USDC", locale);

export function CheckoutRoute({ direction, symbol }) {
  return <div className="checkout-route">
    <span>{direction === "BUY" ? "USDC · Base" : `${symbol} · Stock Token`}</span>
    <ArrowRight size={16} aria-hidden="true" />
    <span>{direction === "BUY" ? `${symbol} · Stock Token` : "USDC · Base"}</span>
  </div>;
}

// Keyed by its transfer: a statement about one request never counts for the next one.
function TransferHelp({ transfer, busy, t, onAcknowledge }) {
  const [confirmed, setConfirmed] = useState(false);
  return <details className="checkout-manual">
    <summary>{t("Transfer help", "Ajuda com o envio")}</summary>
    <label className="check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
      <span>{transfer.hash
        ? t("My wallet shows this transfer is no longer pending.", "Minha carteira mostra que este envio não está mais pendente.")
        : t("I checked my wallet. No transfer request is open and no transfer is pending.", "Conferi minha carteira. Nenhuma solicitação de envio está aberta e não há envio pendente.")}</span></label>
    <button className="btn btn--secondary btn--full" onClick={onAcknowledge} disabled={!confirmed || busy}>{t("Choose payment again", "Escolher pagamento novamente")}</button>
  </details>;
}

export function UsdcFunding({ owner, balance, remaining, balanceUnavailable, sender, transfer, canConnect, busy, locale, t, onConnect, onSend, onAcknowledge, onReview, onClose, onEdit }) {
  const [copied, setCopied] = useState("");
  async function copy(value, key) {
    try { await navigator.clipboard.writeText(value); setCopied(key); }
    catch { setCopied("error"); }
  }
  const ready = remaining === 0n;
  return <>
    <div className="checkout-amount" aria-live="polite">
      <p>{ready ? t("Funding complete", "Saldo disponível") : t("Amount to add to your fatia. wallet", "Falta adicionar à sua carteira fatia.")}</p>
      <div className="checkout-amount__value">
        <strong>{remaining == null ? "—" : amount(ready ? balance : remaining, locale).replace(/ USDC$/, "")}</strong>
        <span>USDC <small>Base</small></span>
      </div>
      <div className="checkout-amount__balance">
        <span>{t("Confirmed balance", "Saldo confirmado")}</span>
        <b>{balance == null ? "—" : amount(balance, locale)}</b>
      </div>
    </div>
    {remaining == null && <p className="checkout-hint" role="status">{balanceUnavailable
      ? t("Base balance unavailable. We’ll check again shortly.", "Saldo na Base indisponível. Vamos consultar de novo em instantes.")
      : t("Checking your balance on Base…", "Consultando seu saldo na Base…")}</p>}

    {transfer && <div className="checkout-status" role="status">
      {transfer.hash ? <span className="spinner" aria-hidden="true" /> : <Wallet size={20} aria-hidden="true" />}
      <div>
        <b>{transfer.hash ? t("Waiting for Base confirmations", "Aguardando confirmações na Base") : t("Check the sending wallet", "Confira a carteira de origem")}</b>
        <p>{transfer.hash ? t("We’ll update your balance automatically.", "Seu saldo será atualizado automaticamente.")
          : canReviewPendingTransfer(transfer) ? t("Check its activity before trying another transfer.", "Confira o histórico antes de fazer outro envio.")
            : t("Approve or reject the request there. You can choose again in a minute.", "Aprove ou recuse a solicitação na carteira. Você poderá escolher de novo em um minuto.")}</p>
        {transfer.from && <p>{amount(BigInt(transfer.amount), locale)} · <code title={transfer.from}>{short(transfer.from)}</code></p>}
        {transfer.hash && <a href={`https://basescan.org/tx/${transfer.hash}`} target="_blank" rel="noreferrer">{t("View transaction", "Ver transação")}</a>}
      </div>
    </div>}

    {ready ? <button className="btn btn--primary btn--full" disabled={busy} onClick={onReview}>{t("Review fresh quote", "Revisar nova cotação")}<ArrowRight size={18} /></button>
      : !transfer && canConnect ? <>
        {sender && <div className="checkout-sender"><Wallet size={20} aria-hidden="true" /><div><b>{t("Sending wallet", "Carteira de origem")}</b><code title={sender.address}>{short(sender.address)}</code></div>
          <button className="back-button" type="button" disabled={busy} onClick={onConnect}>{t("Change", "Trocar")}</button></div>}
        <button className="btn btn--primary btn--full" disabled={busy || remaining == null} onClick={sender ? onSend : onConnect}>
          <Wallet size={19} aria-hidden="true" />{sender ? t("Transfer USDC", "Transferir USDC") : t("Connect wallet", "Conectar carteira")}
        </button>
        <p className="checkout-hint">{sender
          ? t("Confirm this transfer in your sending wallet. It uses ETH on Base for the network fee.", "Confirme o envio na carteira de origem. A taxa de rede é paga em ETH na Base.")
          : t("Connect the wallet that holds your USDC on Base.", "Conecte a carteira onde você tem USDC na Base.")}</p>
      </> : null}

    {canReviewPendingTransfer(transfer) && !ready && <TransferHelp key={`${transfer.requestedAt}:${transfer.hash}`} transfer={transfer} busy={busy} t={t} onAcknowledge={onAcknowledge} />}

    {!ready && !transfer && <details className="checkout-manual" open={!canConnect ? true : undefined}>
      <summary>{canConnect ? t("Send from an exchange or another app", "Enviar de uma corretora ou outro app") : t("Send from an exchange or wallet", "Enviar de uma corretora ou carteira")}</summary>
      <p className="checkout-hint"><b>{t("Send only native USDC on Base.", "Envie apenas USDC nativo na rede Base.")}</b> {t("Other tokens or networks cannot fund this order.", "Outros tokens ou redes não servem para esta operação.")}</p>
      <div className="checkout-address"><span>{t("Your fatia. wallet address", "Endereço da sua carteira fatia.")}</span><code>{owner}</code></div>
      <div className="checkout-copy">
        <button className="btn btn--secondary" onClick={() => copy(owner, "address")}><Copy size={17} aria-hidden="true" />{copied === "address" ? t("Address copied", "Endereço copiado") : t("Copy address", "Copiar endereço")}</button>
        {remaining > 0n && <button className="btn btn--secondary" type="button" onClick={() => copy(formatUnits(remaining, 6), "amount")}>{copied === "amount" ? t("Amount copied", "Valor copiado") : t("Copy amount", "Copiar valor")}</button>}
      </div>
      <p className="checkout-hint">{t("USDC contract on Base (not a deposit address)", "Contrato do USDC na Base (não é endereço de depósito)")}: <code>{BASE_USDC.address}</code></p>
      {copied === "error" && <p className="checkout-hint" role="status">{t("Copy the address or amount by selecting the text.", "Selecione o texto para copiar o endereço ou o valor.")}</p>}
      <details className="checkout-qr"><summary>{t("Show address QR code", "Mostrar QR code do endereço")}</summary>
        <div className="qr"><QRCodeSVG value={owner} size={136} title={t("Your Base wallet address", "Endereço da sua carteira na Base")} /></div>
      </details>
    </details>}

    <p className="checkout-hint checkout-next"><Check size={16} aria-hidden="true" />{t("USDC stays in your wallet until you approve a fresh purchase quote.", "O USDC fica na sua carteira até você aprovar uma nova cotação de compra.")}</p>
    <div className="checkout-actions">
      {!transfer && <button className="back-button" disabled={busy} onClick={onEdit}>{t("Change amount", "Alterar valor")}</button>}
      <button className="back-button" disabled={busy} onClick={onClose}>{t("Continue later", "Continuar mais tarde")}</button>
    </div>
  </>;
}
