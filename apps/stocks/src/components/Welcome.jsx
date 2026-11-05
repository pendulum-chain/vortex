// S3 welcome sheet, once per Privy user on this device.
import { ArrowRight, Fingerprint, ShieldCheck, Wallet } from "./icons.js";
import { CONSUMER_SIGN_IN } from "@vortexfi/consumer-kit";
import { shortAddress } from "../format.js";
import { welcomeTitlePt } from "../lib/greeting.js";
import { Modal } from "./Modal.jsx";

/** rampOpen: true / false ("em breve") / null (not known yet: neither promise). */
export function WelcomeSheet({ firstName, address, onContinue, continueLabel = "Ver meu painel", rampOpen = null }) {
  const lede = rampOpen === true ? "Seu acesso está pronto. Escolha um token e confira a cotação antes de pagar com Pix."
    : rampOpen === false ? "Acompanhe os preços. A compra com Pix será liberada em breve." : "Seu acesso está pronto. Acompanhe os preços em reais.";
  return (
    <Modal title={welcomeTitlePt(firstName)} description={lede} onClose={onContinue}>
      <div className="wallet-chip">
        <div><small>{CONSUMER_SIGN_IN.connected} · sua carteira</small><span className="mono">{shortAddress(address)}</span></div>
        <ShieldCheck size={24} weight="fill" color="var(--positive)" aria-hidden="true" />
      </div>
      <ul className="points" style={{ marginTop: 20 }}>
        <li><span><ShieldCheck size={22} aria-hidden="true" /></span><div><b>Sem instalar outra carteira</b><small>Sua carteira é criada no primeiro acesso e fica vinculada à sua conta.</small></div></li>
        <li><span><Wallet size={22} aria-hidden="true" /></span><div><b>Seus tokens ficam na sua carteira</b><small>Você acompanha o saldo e confirma compras e vendas por aqui.</small></div></li>
        <li><span><Fingerprint size={22} aria-hidden="true" /></span><div><b>Você confirma cada movimentação</b><small>Nenhuma compra ou venda acontece sem a sua confirmação.</small></div></li>
      </ul>
      <button className="btn btn--primary btn--lg btn--full" type="button" style={{ marginTop: 24 }} onClick={onContinue}>{continueLabel} <ArrowRight size={18} weight="bold" aria-hidden="true" /></button>
    </Modal>
  );
}
