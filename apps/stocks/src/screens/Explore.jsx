// S5 explore (#/explorar?c=&q=): collections as filters and an accent-insensitive search that
// understands B3 BDR tickers. Names that are not launch tokens are listed but never buyable.
import { useEffect, useState } from "react";
import { MagnifyingGlass, X } from "../components/icons.js";
import { MarketBadge, Notice, StockRow, TickerTile } from "../components/ui.jsx";
import { sourceLinePt, updatedAgoPt } from "../lib/market.js";
import { exploreHash } from "../lib/routes.js";
import { COLLECTIONS, STOCK_TOKENS, findStock, searchHitNotePt, searchStocks } from "../lib/stocks.js";

/** "2 de 12 disponíveis" / "Nenhum dos 12 Stock Tokens disponíveis" */
const searchCountPt = (count) => (count ? `${count} de 12 disponíveis` : "Nenhum dos 12 Stock Tokens disponíveis");

function HitRow({ hit }) {
  if (hit.kind === "cross_link") {
    return <div className="hit-row"><TickerTile symbol="OURO" size="md" /><span><a href={hit.link.href}>{hit.link.label} →</a></span></div>;
  }
  return <div className="hit-row"><TickerTile symbol={hit.item.symbol} /><span>{searchHitNotePt(hit)}</span></div>;
}

export function Explore({ route, market, navigate, now }) {
  const [query, setQuery] = useState(route.query);
  // Back/forward and links change the query; typing only rewrites the hash (trimmed), so keep
  // the user's own spacing while it means the same search.
  useEffect(() => { setQuery((current) => (current.trim() === route.query.trim() ? current : route.query)); }, [route.query]);
  const collection = COLLECTIONS.find((item) => item.id === route.collection) ?? null;
  const searching = query.trim().length > 0;
  const hits = searching ? searchStocks(query) : null;
  const tokens = collection ? collection.tickers.map(findStock) : STOCK_TOKENS;
  const { state, loading } = market;

  const onQuery = (value) => {
    setQuery(value);
    navigate(exploreHash({ collection: null, query: value }), { replace: true });
  };
  const pick = (id) => { setQuery(""); navigate(exploreHash({ collection: id })); };

  return (
    <main id="conteudo" tabIndex={-1} className="wrap page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Explorar</h1>
          <p className="page__lede">12 tokens de ações e fundos dos EUA. Preço por token, em reais.</p>
        </div>
        <MarketBadge now={now} />
      </div>
      {route.notFound && <div style={{ marginBottom: 16 }}><Notice tone="neutral" title="Não encontrado">Não encontramos “{route.notFound}” entre os 12 Stock Tokens disponíveis.</Notice></div>}
      <label className="search">
        <span className="visually-hidden">Buscar empresa ou ticker (ex.: Apple, NVDC34)</span>
        <MagnifyingGlass size={20} aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Empresa, ticker ou BDR" autoComplete="off" spellCheck="false" />
        {query && <button className="icon-button search__clear" type="button" onClick={() => onQuery("")} aria-label="Limpar busca"><X size={18} /></button>}
      </label>
      <div className="segmented" role="group" aria-label="Coleções">
        <button type="button" aria-pressed={!collection && !searching} onClick={() => pick(null)}>Todas</button>
        {COLLECTIONS.map((item) => <button key={item.id} type="button" aria-pressed={collection?.id === item.id && !searching} onClick={() => pick(item.id)}>{item.titlePt}</button>)}
      </div>

      <div className="explore-meta" aria-live="polite">
        {searching
          ? <h2>{hits.length ? `Resultados para “${query.trim()}”` : "Nenhum resultado"}</h2>
          : <h2>{collection ? collection.titlePt : "Todas as empresas e fundos"}</h2>}
        <p>{searching ? searchCountPt(hits.filter((hit) => hit.kind === "token").length) : collection ? collection.subtitlePt : "Das mais procuradas para as menos procuradas"}</p>
      </div>

      {!loading && state.status === "unavailable" && <div style={{ marginBottom: 14 }}><Notice tone="neutral" title="Preços indisponíveis agora">Você ainda pode abrir cada empresa. O preço exato aparece na cotação, antes do Pix.</Notice></div>}
      <div className="card">
        {(!searching || hits.some((hit) => hit.kind === "token")) && <div className="list-head" aria-hidden="true"><span /><span>Empresa ou fundo</span><span /><span>Preço por token</span><span>24 h</span><span /></div>}
        <div className="stock-list">
          {searching
            ? hits.map((hit) => hit.kind === "token"
              ? <StockRow key={hit.token.symbol} token={hit.token} price={state.prices[hit.token.symbol]} loading={loading} wide />
              : <HitRow key={`${hit.kind}-${hit.item?.symbol ?? hit.link?.href}`} hit={hit} />)
            : tokens.map((token) => <StockRow key={token.symbol} token={token} price={state.prices[token.symbol]} loading={loading} wide />)}
          {searching && hits.length === 0 && <div className="empty"><p>Nenhuma empresa encontrada entre as 12 disponíveis.</p></div>}
        </div>
      </div>
      <p className="source-line">{state.status === "stale" ? `Preços ${updatedAgoPt(state.savedAt, now)} · ` : ""}{sourceLinePt(state)}. Preço por token, que pode representar um pouco mais que uma ação (dividendos reinvestidos).</p>
    </main>
  );
}
