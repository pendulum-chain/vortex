// "Como funciona?" sheet: the token explained before anyone pays (brand: explain "token" first).
import { SELL_NETWORK_FEE_PT, hoursPt } from "../lib/stocks.js";
import { Modal } from "./Modal.jsx";
import { TokenRights } from "./TokenRights.jsx";

export function LearnSheet({ onClose, rampOpen = null }) {
  return (
    <Modal title="Como funciona?" description="Você paga com Pix e recebe um token que acompanha o preço de uma ação ou fundo dos EUA." onClose={onClose} wide>
      <ol className="timeline" aria-label="Passo a passo">
        <li className="is-done"><i aria-hidden="true">1</i><span><b>Escolha uma empresa ou fundo</b><small>12 opções, com preço por token em reais.</small></span></li>
        <li className="is-done"><i aria-hidden="true">2</i><span><b>Pague com Pix</b><small>O custo total aparece antes de você gerar o Pix.</small></span></li>
        <li className="is-done"><i aria-hidden="true">3</i><span><b>Receba o token na sua carteira</b><small>O token acompanha o preço da ação. Venda quando quiser e receba no Pix. {SELL_NETWORK_FEE_PT}</small></span></li>
      </ol>
      <p className="hint" style={{ marginTop: 12 }}>{hoursPt(rampOpen)}</p>
      <div style={{ marginTop: 24 }}><TokenRights headingLevel={3} /></div>
      <button className="btn btn--primary btn--lg btn--full" type="button" style={{ marginTop: 20 }} onClick={onClose}>Entendi</button>
    </Modal>
  );
}
