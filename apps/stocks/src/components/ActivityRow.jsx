// One finished (or server-reported) operation: "Compra · NVDA", date, tokens and reais.
import { ArrowDownLeft, ArrowUpRight } from "./icons.js";
import { formatBRL, formatDateTime } from "../format.js";
import { formatTokenAmount } from "../lib/token.js";
import { formatUsdc } from "../lib/international.js";

const STATUS = { failure: ["Não concluída", "badge--volatile"], processing: ["Em andamento", "badge--info"] };

export function ActivityRow({ row, hidden = false }) {
  const buy = row.direction === "BUY";
  const status = STATUS[row.status];
  const sign = row.status === "failure" ? "" : buy ? "+" : "−"; // a failed operation's amount is not a claim that it moved
  const tokens = row.tokenAmount ? `${sign}${formatTokenAmount(row.tokenAmount)} ${row.symbol || ""}`.trim() : "—";
  return (
    <div className="activity-row">
      <span className={`activity-icon activity-icon--${buy ? "buy" : "sell"}`} aria-hidden="true">{buy ? <ArrowDownLeft size={20} weight="bold" /> : <ArrowUpRight size={20} weight="bold" />}</span>
      <span className="activity-row__main">
        <b>{buy ? "Compra" : "Venda"}{row.symbol ? ` · ${row.symbol}` : ""}{row.simulated && <span className="badge badge--sim">Simulação</span>}{status && <span className={`badge ${status[1]}`}>{status[0]}</span>}</b>
        <small>{formatDateTime(row.date) || "Data indisponível"}</small>
        {row.status === "failure" && <small style={{ overflowWrap: "anywhere" }}>Código da operação: {row.id}</small>}
      </span>
      <span className="activity-row__amount">
        <span className="mono">{hidden ? "•••" : tokens}</span>
        <small>{hidden ? row.paymentMethod === "usdc" ? "USDC •••" : "R$ •••" : row.paymentMethod === "usdc" && row.usdcAmount != null ? formatUsdc(row.usdcAmount, 4) : row.brlAmount != null ? `${formatBRL(row.brlAmount)}${buy ? "" : " no Pix"}` : ""}</small>
        {row.explorerLink && <a className="link" href={row.explorerLink} target="_blank" rel="noreferrer">Ver no explorador</a>}
      </span>
    </div>
  );
}
