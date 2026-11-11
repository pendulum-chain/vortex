// Sign-in sheet: shared Vortex identity, with Google and email both visible.
import { EnvelopeSimple, Fingerprint, Wallet } from "./icons.js";
import { CONSUMER_SIGN_IN, LEGAL_URLS } from "@vortexfi/consumer-kit";
import { Modal } from "./Modal.jsx";

export function LoginSheet({ onClose, onLogin, pending, demo }) {
  return (
    <Modal title={CONSUMER_SIGN_IN.button} description="Entre para continuar. Você confere a cotação atualizada antes de pagar." onClose={onClose}>
      <ul className="points">
        <li><span><Fingerprint size={22} aria-hidden="true" /></span><div><b>Sem criar uma nova senha</b><small>Use sua conta Google ou receba um código por e-mail.</small></div></li>
        <li><span><Wallet size={22} aria-hidden="true" /></span><div><b>Sua carteira, no seu controle</b><small>Ela é criada no seu primeiro acesso. Você confirma cada movimentação.</small></div></li>
      </ul>
      <div className="login-options" style={{ marginTop: 24 }}>
        <button className="btn btn--google btn--full" type="button" onClick={() => onLogin("google")} disabled={Boolean(pending)}>
          {pending === "google" ? <span className="spinner" aria-hidden="true" /> : <span className="google-mark" aria-hidden="true">G</span>}
          {pending === "google" ? "Entrando…" : "Continuar com Google"}
        </button>
          <button className="btn btn--secondary btn--full btn--lg" type="button" onClick={() => onLogin("email")} disabled={Boolean(pending)}>
            {pending === "email" ? <span className="spinner" aria-hidden="true" /> : <EnvelopeSimple size={20} aria-hidden="true" />}
            {pending === "email" ? "Entrando…" : "Continuar com e-mail"}
          </button>
      </div>
      <p className="hint" style={{ marginTop: 16 }}>Já usa o ouro.? Entre com o mesmo acesso.</p>
      {demo && <p className="demo-hint" style={{ marginTop: 16 }}>Ambiente de teste: o acesso é simulado e nenhum dado sai deste navegador.</p>}
      <p className="legal-note" style={{ marginTop: 18 }}>
        Ao continuar, você aceita os <a href={LEGAL_URLS.termsAndConditionsUrl} target="_blank" rel="noreferrer">Termos de Uso</a> e a <a href={LEGAL_URLS.privacyPolicyUrl} target="_blank" rel="noreferrer">Política de Privacidade</a>.
      </p>
    </Modal>
  );
}
