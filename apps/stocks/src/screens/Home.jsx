// S4 home (#/, signed in): portfolio in reais, holdings (multiplier-aware), market status,
// collections and the latest operations.
import { ArrowRight, Clock, Eye, EyeSlash, Receipt, Wallet } from "../components/icons.js";
import { CONSUMER_SIGN_IN } from "@vortexfi/consumer-kit";
import { FAMILY_LINKS } from "../brand.js";
import { ActivityRow } from "../components/ActivityRow.jsx";
import { CollectionCards } from "../components/Collections.jsx";
import { Change, MarketBadge, Notice, SectionLink, Skeleton, StockRow, TickerTile } from "../components/ui.jsx";
import { formatBRL, portfolioTotalPt, shortAddress } from "../format.js";
import { sourceLinePt, updatedAgoPt } from "../lib/market.js";
import { helloPt } from "../lib/greeting.js";
import { exploreHash, historyHash, stockHash } from "../lib/routes.js";
import { DEFAULT_ORDER, findStock } from "../lib/stocks.js";
import { formatSharesApproxPt, formatTokensPt } from "../lib/token.js";

const HIDDEN = "R$ •••••";

function PortfolioCard({ auth, portfolio, market, hidden, onToggleHide, now, rampOpen }) {
  const { status, valued } = portfolio;
  const loading = status === "loading" || status === "idle" || market.loading;
  const holdings = valued?.holdings ?? [];
  const stale = status === "rpc_error";
  const count = holdings.length;
  return (
    <section className="portfolio" aria-labelledby="portfolio-title">
      <div className="portfolio__top">
        <h2 id="portfolio-title" style={{ font: "inherit" }}>Sua carteira{count ? ` · ${count} ${count === 1 ? "posição" : "posições"}` : ""}</h2>
        <button className="icon-button" type="button" onClick={onToggleHide} aria-pressed={hidden} aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}>{hidden ? <EyeSlash size={22} aria-hidden="true" /> : <Eye size={22} aria-hidden="true" />}</button>
      </div>
      <p className={`portfolio__value${stale ? " is-stale" : ""}`} aria-live="polite">
        {loading && !valued ? <Skeleton width={220} height={44} /> : hidden ? HIDDEN : portfolioTotalPt(valued)}
      </p>
      <div className="portfolio__meta">
        {!hidden && count > 0 && <><Change pct={valued?.change24hPct} onNight /><span>em 24 h</span></>}
        <span>{market.state.status === "stale" ? `Preços ${updatedAgoPt(market.state.savedAt, now)}` : sourceLinePt(market.state)}</span>
      </div>
      {valued?.unpricedCount > 0 && <p className="portfolio__meta">{valued.unpricedCount === 1 ? "1 posição sem preço agora" : `${valued.unpricedCount} posições sem preço agora`}, fora do total.</p>}
      {stale && <Notice tone="warning">Saldo indisponível agora. Tente novamente em instantes.</Notice>}
      <div className="portfolio__actions">
        <a className="btn btn--night btn--lg" href={exploreHash()}>{rampOpen ? "Investir com Pix" : "Ver empresas"} <ArrowRight size={18} weight="bold" aria-hidden="true" /></a>
      </div>
      <div className="portfolio__foot">
        <span>{CONSUMER_SIGN_IN.connected} · mesma carteira do <a href={FAMILY_LINKS.ouro.href}>ouro.</a></span>
        <span className="mono" title={auth.address || ""}>{shortAddress(auth.address)}</span>
      </div>
    </section>
  );
}

function Holdings({ portfolio, hidden }) {
  const { status, valued } = portfolio;
  const holdings = valued?.holdings ?? [];
  const loading = !valued && (status === "loading" || status === "idle");
  return (
    <section className="card" aria-labelledby="holdings-title">
      <div className="card__head"><h2 id="holdings-title">Suas posições</h2><span className="card__meta">valor em reais</span></div>
      <div style={{ paddingTop: 8 }}>
        {loading && [0, 1, 2].map((key) => <div key={key} className="holding-row"><Skeleton width={44} height={44} /><span><Skeleton width={120} /><br /><Skeleton width={180} /></span><Skeleton width={90} /></div>)}
        {!loading && holdings.length === 0 && status !== "rpc_error" && (
          <div className="empty">
            <span className="empty__icon"><Wallet size={26} aria-hidden="true" /></span>
            <h3>Você ainda não tem Stock Tokens.</h3>
            <p>Comece pelo S&amp;P 500: cerca de 500 grandes empresas americanas numa compra só.</p>
            <a className="btn btn--primary" href={stockHash("SPY")}>Ver o S&amp;P 500 <ArrowRight size={18} weight="bold" aria-hidden="true" /></a>
          </div>
        )}
        {holdings.map((holding) => (
          <a key={holding.symbol} className={`holding-row${status === "rpc_error" ? " is-stale" : ""}`} href={stockHash(holding.symbol)}>
            <TickerTile symbol={holding.symbol} type={holding.token.type} />
            <span className="holding-row__name">
              <b>{holding.token.namePt}</b>
              <small>{hidden ? "•••" : <><span className="nowrap">{formatTokensPt(holding.raw)}</span> <span className="nowrap">({formatSharesApproxPt(holding.sharesWei)})</span></>}</small>
            </span>
            <span className="holding-row__value">
              <span className="mono">{hidden ? "R$ •••" : holding.valueBrl == null ? "—" : formatBRL(holding.valueBrl)}</span>
              {holding.valueBrl == null ? <small className="muted" style={{ fontSize: 13 }}>sem preço agora</small> : <Change pct={holding.change24hPct} />}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function Home({ auth, market, portfolio, rampOpen, pending, onResume, historyRows, hidden, onToggleHide, now, runtimeError }) {
  const watch = DEFAULT_ORDER.slice(0, 5).map(findStock);
  return (
    <main id="conteudo" tabIndex={-1} className="wrap page">
      <div className="banner-row">
        {pending && (
          <button className="resume-banner" type="button" onClick={onResume}>
            <Clock size={22} aria-hidden="true" />
            <span><b>Você tem uma operação em andamento</b><small>{pending.rampType === "SELL" ? "Venda" : "Compra"}{pending.symbol ? ` de ${pending.symbol}` : ""}{pending.simulated ? " (simulação)" : ""} · toque para acompanhar</small></span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
        {rampOpen === false && <Notice tone="warning" title="Compra com Pix em breve">A compra com Pix será liberada em breve. Enquanto isso, acompanhe os preços.</Notice>}
        {!auth.address && <Notice tone="neutral" title="Preparando sua carteira…">Compra e venda ficam disponíveis assim que ela estiver pronta.</Notice>}
        {runtimeError && <Notice tone="error" title="Não foi possível carregar sua carteira">Atualize a página para tentar de novo.</Notice>}
      </div>
      <div className="greeting">
        <h1>{helloPt(auth.user?.firstName)}</h1>
        <MarketBadge now={now} />
      </div>
      <div className="home-grid">
        <div className="home-col">
          <PortfolioCard auth={auth} portfolio={portfolio} market={market} hidden={hidden} onToggleHide={onToggleHide} now={now} rampOpen={rampOpen} />
          <Holdings portfolio={portfolio} hidden={hidden} />
        </div>
        <div className="home-col">
          <section className="card" aria-labelledby="watch-title">
            <div className="card__head"><h2 id="watch-title">Mais procuradas</h2><span className="card__meta">preço por token</span></div>
            <div className="stock-list" style={{ paddingTop: 6 }}>
              {watch.map((token) => <StockRow key={token.symbol} token={token} price={market.state.prices[token.symbol]} loading={market.loading} />)}
            </div>
            <div className="card__foot"><SectionLink href={exploreHash()}>Ver todas as 12</SectionLink></div>
          </section>
          <section className="card" aria-labelledby="activity-title">
            <div className="card__head"><h2 id="activity-title">Últimas movimentações</h2></div>
            {historyRows.length === 0 ? (
              <div className="empty">
                <span className="empty__icon"><Receipt size={26} aria-hidden="true" /></span>
                <p>Nenhuma movimentação ainda. Suas compras e vendas aparecem aqui.</p>
              </div>
            ) : (
              <div style={{ paddingTop: 6 }}>{historyRows.slice(0, 3).map((row) => <ActivityRow key={row.id} row={row} hidden={hidden} />)}</div>
            )}
            {historyRows.length > 0 && <div className="card__foot"><SectionLink href={historyHash()}>Ver histórico</SectionLink></div>}
          </section>
        </div>
      </div>
      <section aria-labelledby="collections-title" style={{ marginTop: 40 }}>
        <div className="section__head" style={{ marginBottom: 16, alignItems: "center" }}>
          <h2 className="section__title" id="collections-title" style={{ fontSize: 26 }}>Coleções</h2>
          <SectionLink href={exploreHash()}>Explorar</SectionLink>
        </div>
        <CollectionCards />
      </section>
    </main>
  );
}
