// Pay with Pix (Gold's PixStep, restyled). A real ramp shows the QR code and "Pix copia e cola";
// a simulated ramp has no Pix code at all and shows a watermarked placeholder instead (it can
// never be scanned or copied).
import { useEffect, useState } from "react";
import { Check, Clock, Copy } from "../components/icons.js";
import { QRCodeSVG } from "qrcode.react";
import { secondsUntilExpiry } from "@vortexfi/consumer-kit";
import { Notice } from "../components/ui.jsx";
import { formatBRL } from "../format.js";
import { useCopy, useMaintenanceStatus } from "../hooks.js";

export function PixStep({ ramp, tokenLabel, onPaid, busy, error, adapter }) {
  const code = ramp.depositQrCode || "";
  const simulated = !code && ramp.simulatedPix;
  const [deadline] = useState(() => ramp.startDeadline ?? (simulated ? Date.now() + 15 * 60_000 : Number.NaN));
  const [seconds, setSeconds] = useState(() => secondsUntilExpiry(deadline));
  const [copied, copy] = useCopy();
  // Read the clock on every tick: timers pause while the user is in the banking app.
  useEffect(() => { const timer = setInterval(() => setSeconds(secondsUntilExpiry(deadline)), 1_000); return () => clearInterval(timer); }, [deadline]);
  const routeOpen = simulated || adapter?.enabled === true;
  const maintenance = useMaintenanceStatus({ readStatus: adapter?.getMaintenanceStatus, enabled: !simulated && routeOpen });
  const expired = !Number.isFinite(seconds) || seconds <= 0;
  const canPay = !expired && routeOpen && (simulated || maintenance.status?.active === false);
  const pauseMessage = expired ? "O prazo deste Pix terminou. Não pague este código. Se já pagou, feche esta tela e retome o acompanhamento no Início."
    : !routeOpen ? "Novos pagamentos estão pausados. Não faça este Pix agora. Sua operação continua salva."
      : maintenance.status?.active ? "A Vortex está em manutenção. Não faça este Pix agora. Se já pagou, sua operação continua salva para acompanhamento."
        : "Aguarde enquanto verificamos a disponibilidade da Vortex. Não faça um novo Pix até a confirmação.";
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");
  return (
    <div className="pix">
      <div className="pix__main">
        {!canPay ? <Notice tone="warning" title={expired ? "Pix expirado" : "Pagamento pausado"}>{pauseMessage}</Notice> : simulated ? (
          <div className="qr qr--sim" role="img" aria-label="Simulação: sem código Pix">
            <span><b>Simulação</b>Sem código Pix. Nenhum pagamento é necessário.</span>
          </div>
        ) : (
          <div className="qr">{code.startsWith("data:image") ? <img src={code} alt="QR Code Pix" /> : <QRCodeSVG value={code} size={184} level="M" bgColor="#ffffff" fgColor="#15161D" title="QR Code Pix" />}</div>
        )}
        <div>
          <div className="pix__amount"><small>Valor exato</small><strong>{formatBRL(ramp.brlAmount)}</strong></div>
          <span className="countdown"><Clock size={16} aria-hidden="true" />{seconds ? `Expira em ${minutes}:${rest}` : "Pix expirado"}</span>
          {canPay && (simulated ? (
            <ol className="pix__steps">
              <li>Numa compra real, você pagaria este valor pelo app do seu banco.</li>
              <li>Nesta simulação, nenhum pagamento é necessário.</li>
              <li>Toque em “Já fiz o Pix (simulado)” para continuar.</li>
            </ol>
          ) : (
            <ol className="pix__steps">
              <li>Abra o app do seu banco e escolha Pix.</li>
              <li>Leia o QR Code ou use o Pix copia e cola.</li>
              <li>Pague o valor exato e toque em “Já fiz o Pix”.</li>
            </ol>
          ))}
        </div>
      </div>
      {!simulated && canPay && (
        <button className="copy-code" type="button" onClick={() => copy(code, "pix")} disabled={!code}>
          <span><small>Pix copia e cola</small><b>{code}</b></span>
          {copied === "pix" ? <em><Check size={16} aria-hidden="true" /> Copiado</em> : <em><Copy size={16} aria-hidden="true" /> Copiar</em>}
        </button>
      )}
      {canPay && <Notice tone="info" title="Conversão automática">Quando o Pix for identificado, ele é convertido em {tokenLabel} e enviado para a sua carteira na Robinhood Chain.</Notice>}
      {!simulated && routeOpen && !expired && <button className="back-button" type="button" onClick={maintenance.refresh}>Verificar disponibilidade</button>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn btn--primary btn--lg btn--full" type="button" onClick={onPaid} disabled={busy || !canPay}>{busy ? <><span className="spinner" aria-hidden="true" /> Confirmando…</> : simulated ? "Já fiz o Pix (simulado)" : "Já fiz o Pix"}</button>
      <p className="legal-note">{canPay ? "Depois desta confirmação, a compra segue automaticamente. Você pode fechar e voltar sem perder o acompanhamento." : "Você pode fechar esta tela e retomar a mesma operação pelo Início. Não gere outro pagamento se já houve débito."}</p>
    </div>
  );
}
