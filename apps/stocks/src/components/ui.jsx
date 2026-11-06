// Small shared UI pieces: ticker tile, change, badges, market status, stock rows, notices.
import { ArrowRight, CaretRight, Info, WarningCircle } from "./icons.js";
import { changeLabel, formatChange, priceBRL } from "../format.js";
import { marketBadgePt, usMarketStatus } from "../lib/market-hours.js";
import { stockHash } from "../lib/routes.js";

/** Monogram tile (tickers as typography; never a company or Robinhood logo). */
export function TickerTile({ symbol, type, size = "md", night = false }) {
  const className = ["tile", size !== "md" && `tile--${size}`, type === "etf" && "tile--etf", night && "tile--night"].filter(Boolean).join(" ");
  return <span className={className} data-len={symbol.length} aria-hidden="true">{symbol}</span>;
}

/** "▲ +1,24%" / "▼ −0,52%": arrow + sign, never colour alone; "—" when unknown. */
export function Change({ pct, pill = true, onNight = false, period = "em 24 horas" }) {
  const missing = pct == null || !Number.isFinite(Number(pct));
  const text = missing ? "—" : formatChange(pct);
  const direction = missing || /^[0.,]+%$/.test(text) ? "flat" : Number(pct) < 0 ? "down" : "up";
  const className = ["chg", `chg--${direction}`, pill && "chg--pill", onNight && "chg--on-night"].filter(Boolean).join(" ");
  return <span className={className}><span aria-hidden="true">{text}</span><span className="visually-hidden">{changeLabel(pct, period)}</span></span>;
}

const BADGE_CLASS = { "Oscila mais": "badge--volatile", "Baixa oscilação": "badge--calm" };

export function Badge({ label }) {
  return <span className={`badge ${BADGE_CLASS[label] ?? "badge--info"}`}>{label}</span>;
}

export function MarketBadge({ now }) {
  const date = new Date(now);
  const status = usMarketStatus(date);
  return <span className={`market-badge market-badge--${status.open ? "open" : "closed"}`}><span className="dot" aria-hidden="true" />{marketBadgePt(status, date)}</span>;
}

export function Skeleton({ width = 80, height }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

/** One launch token with its BRL price per token and 24 h change; links to the detail screen. */
export function StockRow({ token, price, loading = false, wide = false }) {
  return (
    <a className={`stock-row${wide ? " stock-row--wide" : ""}`} href={stockHash(token.symbol)}>
      <TickerTile symbol={token.symbol} type={token.type} />
      <span className="stock-row__name"><b>{token.namePt}</b><small>{token.symbol} · token</small></span>
      {wide && <span className="stock-row__badges">{token.badgesPt.map((label) => <Badge key={label} label={label} />)}</span>}
      <span className="stock-row__price">
        {loading ? <Skeleton width={104} /> : <span className="mono">{priceBRL(price?.brl)}</span>}
        {loading ? <Skeleton width={72} /> : <Change pct={price?.change24hPct} />}
      </span>
      {wide && <CaretRight className="stock-row__chevron" size={18} aria-hidden="true" />}
    </a>
  );
}

const NOTICE_ICONS = { info: Info, warning: WarningCircle, error: WarningCircle, neutral: Info, positive: Info };

export function Notice({ tone = "info", title, children, action, role }) {
  const Icon = NOTICE_ICONS[tone] ?? Info;
  return (
    <div className={`notice notice--${tone}`} role={role}>
      <Icon size={20} weight={tone === "warning" || tone === "error" ? "fill" : "regular"} aria-hidden="true" />
      <div>{title && <b>{title}</b>}{children}{action}</div>
    </div>
  );
}

export function SectionLink({ href, children }) {
  return <a className="text-link" href={href}>{children} <ArrowRight size={16} weight="bold" aria-hidden="true" /></a>;
}
