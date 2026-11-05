// "É um token, não a ação" (spec S6): facts only, with the issuer's documentation and the contract.
import { ArrowSquareOut, CheckCircle } from "./icons.js";
import { explorerUrl, robinhoodChain } from "@vortexfi/consumer-kit";
import { tokenizationWindowPt } from "../lib/market-hours.js";
import { isinLabelPt } from "../lib/stocks.js";
import { dividendsLinePt, multiplierWeiFor } from "../lib/token.js";

export const ROBINHOOD_CHAIN_DOCS = "https://docs.robinhood.com/chain/stock-tokens/";

export function tokenRightsPt(multiplierWei = null, now = new Date()) {
  return [
    // A Stock Token gives economic exposure to its reference asset.
    "Emitido pela Robinhood Assets (Jersey) Limited como título de dívida tokenizado; as ações ficam custodiadas pela Alpaca Securities, e o token não dá a você direito sobre elas.",
    dividendsLinePt(multiplierWei),
    "O emissor pode pausar o token (por exemplo em eventos corporativos) e pode atualizar o contrato.",
    `Emissão e resgate pelo emissor: ${tokenizationWindowPt(now)}. Negociação na Robinhood Chain 24 horas; fora do horário da bolsa, o preço pode se afastar do último fechamento.`,
    "Não é oferecido nos EUA, no Canadá, no Reino Unido e na Suíça, conforme o emissor.",
    "Fica na sua carteira; a Vortex não guarda seus tokens.",
  ];
}

export function TokenRights({ token, multiplierWei = null, headingLevel = 2 }) {
  const Heading = `h${headingLevel}`;
  const multiplier = token ? multiplierWeiFor(token, multiplierWei) : null;
  return (
    <section className="card card__body rights" aria-labelledby="rights-title">
      <Heading id="rights-title">É um token, não a ação</Heading>
      <p className="rights__lede">Um Stock Token acompanha o preço {token ? `${token.type === "etf" ? "do fundo" : "da ação"} ${token.namePt}` : "da ação"}, mas o que fica na sua carteira é o token.</p>
      <ul>
        {tokenRightsPt(multiplier).map((line) => <li key={line}><CheckCircle size={20} weight="fill" aria-hidden="true" /><span>{line}</span></li>)}
      </ul>
      <div className="rights__links">
        <a className="link" href={ROBINHOOD_CHAIN_DOCS} target="_blank" rel="noreferrer">Documentação da Robinhood Chain <ArrowSquareOut size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /></a>
        {token && <a className="link" href={explorerUrl(robinhoodChain, "token", token.address)} target="_blank" rel="noreferrer">Contrato no explorador <ArrowSquareOut size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /></a>}
        {token && <span className="muted">{isinLabelPt(token)} <span className="mono">{token.isin}</span></span>}
      </div>
    </section>
  );
}
