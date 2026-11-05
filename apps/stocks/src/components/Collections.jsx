// The four collections as cards; each opens Explore filtered to it.
import { exploreHash } from "../lib/routes.js";
import { COLLECTIONS, findStock } from "../lib/stocks.js";
import { TickerTile } from "./ui.jsx";

export function CollectionCards() {
  return (
    <div className="collections">
      {COLLECTIONS.map((collection) => {
        const shown = collection.tickers.slice(0, 4);
        return (
          <a key={collection.id} className="card collection-card" href={exploreHash({ collection: collection.id })}>
            <h3>{collection.titlePt}</h3>
            <p>{collection.subtitlePt}</p>
            <span className="collection-card__tiles" aria-hidden="true">
              {shown.map((symbol) => <TickerTile key={symbol} symbol={symbol} type={findStock(symbol)?.type} size="sm" />)}
              <span className="collection-card__count">{collection.tickers.length} tokens</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}
