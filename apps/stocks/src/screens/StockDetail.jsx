// Stock detail (#/acao/<SYMBOL>): price in reais with its source and time, the lazy 1-year
// chart, market status, the token-vs-share explainer, the issuer pause notice and buy/sell.
import { Suspense, lazy } from "react";
import { ArrowLeft, ArrowSquareOut, CalendarBlank } from "../components/icons.js";
import { explorerUrl, robinhoodChain } from "@vortexfi/consumer-kit";
import { TokenRights } from "../components/TokenRights.jsx";
import { PurchasePreview } from "../components/PurchasePreview.jsx";
import { Badge, Change, MarketBadge, Notice, Skeleton, TickerTile } from "../components/ui.jsx";
import { formatBRL, priceBRL, priceUSD, shortAddress } from "../format.js";
import { useReducedMotion } from "../hooks.js";
import { expectedIssuerPause, issuerPauseNotePt, tokenizationClosedNotePt, tokenizationWindowOpen } from "../lib/market-hours.js";
import { sourceLinePt, updatedAgoPt } from "../lib/market.js";
import { detailActions } from "../lib/detail-actions.js";
import { exploreHash } from "../lib/routes.js";
import { findStock, isinLabelPt, riskNotesPt } from "../lib/stocks.js";
import { formatMultiplier, formatSharesApproxPt, formatTokenAmount, multiplierWeiFor } from "../lib/token.js";

const PriceChart = lazy(() => import("../components/PriceChart.jsx"));

function ChartFallback() {
  return <section className="card chart-card" aria-label="Gráfico de preço"><div className="chart-state"><Skeleton width="92%" height={200} /></div></section>;
}

function ActionButtons({ actions, onBuy, onSell }) {
  return (
    <>
      <button className="btn btn--primary btn--lg" type="button" onClick={onBuy} disabled={actions.buy.disabled}>{actions.buy.loading ? <span className="spinner" aria-hidden="true" /> : null}{actions.buy.label}</button>
      {actions.sell && <button className="btn btn--secondary btn--lg" type="button" onClick={onSell} disabled={actions.sell.disabled}>{actions.sell.label}</button>}
    </>
  );
}

export function StockDetail({ symbol, auth, market, portfolio, availability, comingSoon, pending = null, onBuy, onPreview, canPreviewContinue, onSell, now }) {
  const token = findStock(symbol);
  const reducedMotion = useReducedMotion();
  const { state, loading, fx, chartLoader } = market;
  const price = state.status === "unavailable" ? null : state.prices[symbol];
  const flag = portfolio.flags?.[symbol];
  const multiplierWei = multiplierWeiFor(token, flag?.multiplierWei ?? null);
  const holding = portfolio.valued?.holdings.find((item) => item.symbol === symbol) ?? null;
  const date = new Date(now);
  const pause = issuerPauseNotePt(expectedIssuerPause(symbol, date), date);
  const actions = detailActions({ auth, availability, comingSoon, holding, symbol, pending });
  const usd = price?.usd ?? (price?.brl && fx?.bid ? price.brl / fx.bid : null);
  const risks = riskNotesPt(token);
  const priceMissing = !loading && !(Number(price?.brl) > 0);

  return (
    <main id="conteudo" tabIndex={-1} className={`wrap page${actions.buy ? " has-action-bar" : ""}`}>
      <a className="back-link" href={exploreHash()}><ArrowLeft size={16} aria-hidden="true" /> Explorar</a>
      <div className="detail">
        <header className="detail__head">
          <div className="detail-head">
            <TickerTile symbol={token.symbol} type={token.type} size="lg" />
            <div>
              <h1>{token.namePt}</h1>
              <p>{token.symbol} · Stock Token · Robinhood Chain</p>
            </div>
          </div>
          {token.badgesPt.length > 0 && <div className="badges detail-badges">{token.badgesPt.map((label) => <Badge key={label} label={label} />)}</div>}
          <div className="price-block">
            {priceMissing ? (
              <>
                <p className="price-block__missing">Preço indisponível agora</p>
                <p className="source-line" style={{ marginTop: 8 }}>Tentamos de novo a cada minuto. O preço exato sempre aparece na cotação, antes do Pix.</p>
              </>
            ) : (
              <>
                <p className="source-line">Preço de 1 token</p>
                <p className="price-block__value">{loading ? <Skeleton width={260} height={44} /> : priceBRL(price?.brl)}</p>
                <p className="preview-minimum">Compre uma fração do token a partir de R$ 100.</p>
                <div className="price-block__row">
                  <Change pct={price?.change24hPct} />
                  <span>em 24 h</span>
                  <span aria-hidden="true">·</span>
                  <span><span className="mono">{priceUSD(usd)}</span> por token</span>
                </div>
                <p className="source-line" style={{ marginTop: 8 }}>{state.status === "stale" ? `${updatedAgoPt(state.savedAt, now)} · ` : ""}{sourceLinePt(state)}</p>
              </>
            )}
            <div className="price-block__facts">
              <span className="multiplier">1 token ≈ <span className="mono">{formatMultiplier(multiplierWei)}</span> ação</span>
              <MarketBadge now={now} />
            </div>
          </div>
        </header>

        <aside className="detail__side" aria-label={`Comprar ou vender ${token.symbol}`}>
          {!auth.authenticated ? <><PurchasePreview id="simular" symbol={symbol} prices={state.prices} onContinue={onPreview} canContinue={canPreviewContinue} />
            {pause && <Notice tone={pause.active ? "warning" : "info"} title={pause.title}>{pause.text}</Notice>}
            {risks.length > 0 && <Notice tone="warning">{risks.join(" ")}</Notice>}
          </> : <>
          <section className="card action-card">
            <h2>{holding ? "Sua posição" : `Comprar tokens ${token.symbol}`}</h2>
            {holding && (
              <dl className="position">
                <div><dt>Tokens</dt><dd>{formatTokenAmount(holding.tokenAmount)}</dd></div>
                <div><dt>Equivale a</dt><dd>{formatSharesApproxPt(holding.sharesWei)}</dd></div>
                <div><dt>Valor</dt><dd>{holding.valueBrl == null ? "—" : formatBRL(holding.valueBrl)}</dd></div>
                <div><dt>24 h</dt><dd><Change pct={holding.change24hPct} pill={false} /></dd></div>
              </dl>
            )}
            <div className="action-card__buttons" style={actions.sell ? undefined : { gridTemplateColumns: "1fr" }}>
              <ActionButtons actions={actions} onBuy={onBuy} onSell={onSell} />
            </div>
            {actions.note && <p className="action-card__note">{actions.note}</p>}
            {pause && <Notice tone={pause.active ? "warning" : "info"} title={pause.title}>{pause.text}</Notice>}
            {!tokenizationWindowOpen(date) && <Notice tone="neutral">{tokenizationClosedNotePt(date)}</Notice>}
            {risks.length > 0 && <Notice tone="warning">{risks.join(" ")}</Notice>}
          </section>
          </>}
        </aside>

        <div className="detail__main">
          <Suspense fallback={<ChartFallback />}>
            <PriceChart token={token} loader={chartLoader} reducedMotion={reducedMotion} />
          </Suspense>
          <section className="card card__body" aria-labelledby="about-title">
            <h2 id="about-title" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>Sobre {token.type === "etf" ? "o fundo" : "a empresa"}</h2>
            <p style={{ marginTop: 8, color: "var(--text-muted)" }}>{token.descriptionPt}</p>
            <dl className="facts" style={{ marginTop: 16 }}>
              <div><dt>Acompanha</dt><dd>{token.underlyingName} ({token.symbol})</dd></div>
              <div><dt>{isinLabelPt(token)}</dt><dd className="mono">{token.isin}</dd></div>
              <div><dt>Tipo</dt><dd>{token.type === "etf" ? "Stock Token de fundo de índice (ETF)" : "Stock Token de ação"}</dd></div>
              <div><dt>Emissor do token</dt><dd>Robinhood Assets (Jersey) Limited</dd></div>
              <div><dt>Rede</dt><dd>Robinhood Chain</dd></div>
              <div><dt>Contrato</dt><dd><a className="link mono" href={explorerUrl(robinhoodChain, "token", token.address)} target="_blank" rel="noreferrer">{shortAddress(token.address)} <ArrowSquareOut size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /></a></dd></div>
            </dl>
          </section>
          <TokenRights token={token} multiplierWei={flag?.multiplierWei ?? null} />
          {pause && <p className="source-line"><CalendarBlank size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /> Datas de eventos corporativos: registro do emissor (Robinhood Assets), sujeitas a mudança.</p>}
        </div>
      </div>
      {actions.buy && (
        <div className={`action-bar${actions.sell ? "" : " action-bar--single"}`}>
          {auth.authenticated ? <ActionButtons actions={actions} onBuy={onBuy} onSell={onSell} /> : <a className="btn btn--primary btn--lg" href="#simular" onClick={e => { e.preventDefault(); document.getElementById("simular")?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" }); }}>Simular compra · a partir de R$ 100</a>}
        </div>
      )}
    </main>
  );
}
