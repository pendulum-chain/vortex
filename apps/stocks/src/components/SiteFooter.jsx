// Every showcase page ends with the B2B band and the issuer / risk lines.
import { ArrowRight } from "./icons.js";
import { LEGAL_URLS } from "@vortexfi/consumer-kit";
import { BRAND, FAMILY_LINKS } from "../brand.js";
import { Wordmark } from "./AppHeader.jsx";
import { exploreHash, historyHash, homeHash } from "../lib/routes.js";

export function B2BBand() {
  return (
    <section className="wrap" aria-labelledby="b2b-title">
      <div className="b2b">
        <div>
          <p className="eyebrow">Para empresas</p>
          <h2 id="b2b-title" style={{ marginTop: 10 }}>Quer oferecer isto aos seus clientes?</h2>
          <p>O {BRAND.name} é construído com a API Vortex: Pix, câmbio e entrega on-chain numa integração. Leve tokens de ações dos EUA para o seu app.</p>
        </div>
        <a className="btn btn--night btn--lg" href={FAMILY_LINKS.business.href}>Construa com a API Vortex <ArrowRight size={18} weight="bold" aria-hidden="true" /></a>
      </div>
    </section>
  );
}

export function SiteFooter({ signedIn }) {
  const { familySafe, ouro, business } = FAMILY_LINKS;
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="site-footer__grid">
          <div className="site-footer__brand">
            <Wordmark />
            <p>{BRAND.descriptorPt}. Um token que acompanha o preço da ação, direto na sua carteira.</p>
          </div>
          <div>
            <h2>Navegue</h2>
            <ul>
              <li><a href={homeHash()}>Início</a></li>
              <li><a href={exploreHash()}>Explorar empresas</a></li>
              {signedIn && <li><a href={historyHash()}>Histórico</a></li>}
            </ul>
          </div>
          <div>
            <h2>Também by Vortex</h2>
            <ul>
              <li><a href={ouro.href}>{ouro.name} <span className="muted">ouro com Pix</span></a></li>
              <li><span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", minHeight: 40 }}>{familySafe.descriptorPt}<span className="badge badge--concept">{familySafe.chipPt}</span></span></li>
            </ul>
          </div>
          <div>
            <h2>Vortex</h2>
            <ul>
              <li><a href={business.href}>{business.labelPt}</a></li>
              <li><a href={LEGAL_URLS.termsAndConditionsUrl}>Termos de Uso</a></li>
              <li><a href={LEGAL_URLS.privacyPolicyUrl}>Política de Privacidade</a></li>
            </ul>
          </div>
        </div>
        <div className="site-footer__legal">
          <p>Stock Tokens emitidos pela Robinhood Assets (Jersey) Limited na Robinhood Chain. Um Stock Token acompanha o preço de uma ação ou fundo dos EUA, mas não é a ação: não dá direito a voto, e os dividendos são reinvestidos no próprio token.</p>
          <p>Não oferecido nos EUA, no Canadá, no Reino Unido e na Suíça, conforme o emissor. Preços de referência: CoinGecko. Investir envolve riscos: o valor pode cair, e operações em blockchain são definitivas.</p>
          {BRAND.operatorPt && <p>Operado por {BRAND.operatorPt}.</p>}
        </div>
      </div>
    </footer>
  );
}
