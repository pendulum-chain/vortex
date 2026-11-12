// Landing (#/, anonymous). Renders from the eager bundle with no Privy, SDK or chart code.
import { ArrowSquareOut, Bank, CheckCircle, CurrencyCircleDollar, HandCoins, Plus } from "../components/icons.js";
import { B2BBand } from "../components/SiteFooter.jsx";
import { BRAND } from "../brand.js";
import { ROBINHOOD_CHAIN_DOCS } from "../components/TokenRights.jsx";
import { Notice, SectionLink, StockRow, TickerTile } from "../components/ui.jsx";
import { formatBRL, formatNumber } from "../format.js";
import { DEMO_PRICES_BRL, sourceLinePt, updatedAgoPt } from "../lib/market.js";
import { MIN_BUY } from "../lib/purchase-options.js";
import { exploreHash } from "../lib/routes.js";
import { DEFAULT_ORDER, SHARED_COPY_PT, findStock, hoursPt } from "../lib/stocks.js";
import { formatTokenAmount } from "../lib/token.js";
import { FairFeesHero } from "../components/FairFeesHero.jsx";
import { PurchasePreview } from "../components/PurchasePreview.jsx";
import { estimatePurchase } from "../lib/purchase-preview.js";

const EXAMPLE_AMOUNT = 500;

function CostReceipt({ price }) {
  const example = estimatePurchase({ symbol: "NVDA", method: "pix", amount: String(EXAMPLE_AMOUNT), locale: "pt-BR" }, price || DEMO_PRICES_BRL.NVDA);
  const fees = { total: example.total };
  const tokens = example.tokenAmount;
  return (
    <div className="card receipt">
      <div className="receipt__head"><h3>Comprar Nvidia</h3><TickerTile symbol="NVDA" size="sm" /></div>
      <div className="receipt__amount" aria-label={`Valor de exemplo: ${formatBRL(EXAMPLE_AMOUNT)}`}><span>R$</span><strong>{EXAMPLE_AMOUNT}</strong></div>
      <dl className="breakdown" style={{ marginTop: 14 }}>
        <div><dt>Você paga</dt><dd>{formatBRL(EXAMPLE_AMOUNT)}</dd></div>
        <div><dt>Custo total (já incluído)</dt><dd>{formatBRL(fees.total)} · {formatNumber((fees.total / EXAMPLE_AMOUNT) * 100, 2)}%</dd></div>
        <div className="is-total"><dt>Você recebe</dt><dd>≈ {formatTokenAmount(tokens)} NVDA (token)</dd></div>
      </dl>
      <p className="receipt__note">Exemplo ilustrativo, com uma pequena reserva de ETH que fica na sua carteira. A cotação final é atualizada antes do pagamento.</p>
    </div>
  );
}

const faq = (rampOpen) => [
  ["O que eu recebo quando compro?", SHARED_COPY_PT.whatYouBuy],
  ["Recebo dividendos? Posso votar?", `${SHARED_COPY_PT.dividends} Stock Tokens não dão direito a voto.`],
  ["Posso comprar à noite ou no fim de semana?", `${hoursPt(rampOpen)} ${SHARED_COPY_PT.pauses}`],
  ["Onde ficam meus tokens?", "Na sua carteira, na Robinhood Chain. Ela é criada quando você entra com Vortex, sem precisar instalar outra aplicação. A Vortex não guarda seus tokens."],
  ["Quanto custa?", `A cotação mostra quanto você paga, os custos incluídos e quantos tokens recebe, antes de gerar o Pix. Nos detalhes, você vê cada provedor: conversão de moeda, transferência entre redes, compra do token e serviço Vortex. A ${BRAND.name} não cobra uma taxa extra; nossa remuneração vem da taxa Vortex. Quando incluída, uma pequena reserva de ETH, que fica na sua carteira, também aparece na cotação. Não há mensalidade. A compra mínima é de ${formatBRL(MIN_BUY, 0)}; em compras pequenas, os custos fixos pesam mais.`],
  ["Como eu vendo?", "Escolha quantos tokens vender e informe uma chave Pix da sua própria conta. Você vê o valor líquido antes de confirmar na sua carteira. A taxa de rede já vem descontada desse valor: você não precisa comprar ETH à parte."],
  ["Como faço meu primeiro acesso?", "Entre com sua conta Google ou seu e-mail, sem criar uma nova senha. Na primeira compra com Pix, a Vortex confirma seu e-mail com um código e verifica sua identidade, se necessário. Se você já usa o ouro., pode usar o mesmo acesso."],
  ["Quem pode usar?", "Pessoas no Brasil, com CPF e uma chave Pix. Stock Tokens não são oferecidos nos EUA, no Canadá, no Reino Unido e na Suíça, conforme o emissor."],
];

export function Landing({ market, rampOpen, onPreview, canPreviewContinue, onLearn, now }) {
  const featured = DEFAULT_ORDER.slice(0, 6).map(findStock);
  const { state, loading } = market;
  const unavailable = !loading && state.status === "unavailable";
  return (
    <main id="conteudo" tabIndex={-1}>
      <FairFeesHero previewId="simular" onLearn={onLearn} availabilityNotice={rampOpen === false ? "Compra com Pix em breve" : null} />
      <div className="wrap fair-preview">
        <PurchasePreview id="simular" prices={state.prices} onContinue={onPreview} canContinue={canPreviewContinue} />
      </div>

      <section className="section wrap" aria-labelledby="featured-title">
        <div className="section__head">
          <div>
            <p className="eyebrow">Mais procuradas</p>
            <h2 className="section__title" id="featured-title" style={{ marginTop: 10 }}>Comece por quem você já conhece.</h2>
          </div>
          <div className="section__aside">
            <span>Preço de 1 token · {state.status === "stale" ? updatedAgoPt(state.savedAt, now) : sourceLinePt(state)}</span>
            <SectionLink href={exploreHash()}>Ver todas as 12</SectionLink>
          </div>
        </div>
        <p className="featured-minimum">Você não precisa comprar um token inteiro. Escolha quanto investir, a partir de R$ 100.</p>
        <div className="card" style={{ padding: "4px 24px" }}>
          <div className="featured">
            {featured.map((token) => <StockRow key={token.symbol} token={token} price={state.prices[token.symbol]} loading={loading} />)}
          </div>
        </div>
        {unavailable && <div style={{ marginTop: 14 }}><Notice tone="neutral" title="Preços indisponíveis agora">Você ainda pode abrir cada empresa. O preço exato aparece na cotação.</Notice></div>}
      </section>

      <section className="section wrap" id="como-funciona" aria-labelledby="how-title" style={{ paddingTop: 0 }}>
        <div className="section__head">
          <div>
            <p className="eyebrow">Como funciona</p>
            <h2 className="section__title" id="how-title" style={{ marginTop: 10 }}>Da cotação à sua carteira.</h2>
          </div>
        </div>
        <ol className="steps">
          <li className="card step"><span className="step__num">01</span><h3>Veja os custos antes de comprar</h3><p>Escolha uma empresa e o valor. Veja uma estimativa de quanto recebe e dos custos.</p></li>
          <li className="card step"><span className="step__num">02</span><h3>Entre e confira os valores</h3><p>Use Google ou e-mail. Na primeira compra com Pix, confirme seu e-mail e verifique sua identidade, se necessário. Confira a cotação atualizada antes de pagar.</p></li>
          <li className="card step"><span className="step__num">03</span><h3>Pague com Pix e receba</h3><p>Após a confirmação do pagamento, os tokens chegam à sua carteira. Para vender, confira a cotação e receba na sua chave Pix.</p></li>
        </ol>
        <div className="explainer">
          <div>
            <p className="eyebrow">O que você recebe</p>
            <h3>É um token, não a ação.</h3>
            <p>{SHARED_COPY_PT.whatYouBuy}</p>
            <p><a className="link" href={ROBINHOOD_CHAIN_DOCS} target="_blank" rel="noreferrer" style={{ color: "var(--anil-300)" }}>Documentação da Robinhood Chain <ArrowSquareOut size={15} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /></a></p>
          </div>
          <ul>
            <li><CheckCircle size={20} weight="fill" aria-hidden="true" /><span>{SHARED_COPY_PT.dividends}</span></li>
            <li><CheckCircle size={20} weight="fill" aria-hidden="true" /><span>{hoursPt(rampOpen)}</span></li>
            <li><CheckCircle size={20} weight="fill" aria-hidden="true" /><span>{SHARED_COPY_PT.pauses}</span></li>
            <li><CheckCircle size={20} weight="fill" aria-hidden="true" /><span>Fica na sua carteira; a Vortex não guarda seus tokens.</span></li>
          </ul>
        </div>
      </section>

      <section className="section wrap" aria-labelledby="costs-title" style={{ paddingTop: 0 }}>
        <div className="costs">
          <div>
            <p className="eyebrow">Custos</p>
            <h2 className="section__title" id="costs-title" style={{ marginTop: 10 }}>O custo total em reais, antes do Pix.</h2>
            <p className="section__lede">Veja quanto você paga, os custos incluídos e quantos tokens recebe. Sem mensalidade ou taxa de custódia da {BRAND.name}</p>
            <ul className="costs__list">
              <li><span className="costs__icon"><CurrencyCircleDollar size={22} aria-hidden="true" /></span><div><b>Saiba para onde vai cada valor</b><span>Abra os detalhes da cotação para ver a conversão, a compra do token e a taxa Vortex. A {BRAND.name} não cobra uma taxa extra.</span></div></li>
              <li><span className="costs__icon"><Bank size={22} aria-hidden="true" /></span><div><b>Taxas de rede incluídas</b><span>O custo de receber os tokens e, quando incluída, uma pequena reserva de ETH, que fica na sua carteira.</span></div></li>
              <li><span className="costs__icon"><HandCoins size={22} aria-hidden="true" /></span><div><b>Venda com Pix</b><span>Na venda, as taxas aparecem antes e o valor líquido cai na sua chave Pix.</span></div></li>
            </ul>
          </div>
          <CostReceipt price={state.prices.NVDA?.brl} />
        </div>
      </section>

      <section className="section wrap" aria-labelledby="faq-title" style={{ paddingTop: 0 }}>
        <div className="faq">
          <div>
            <p className="eyebrow">Perguntas frequentes</p>
            <h2 className="section__title" id="faq-title" style={{ marginTop: 10 }}>Antes de começar.</h2>
            <p className="section__lede">Respostas curtas sobre o que você compra, onde fica e quanto custa.</p>
          </div>
          <div className="faq__list">
            {faq(rampOpen).map(([question, answer]) => (
              <details key={question}>
                <summary>{question}<Plus size={20} weight="bold" aria-hidden="true" /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <B2BBand />
    </main>
  );
}
