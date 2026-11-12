// Lazy chunk (recharts): the detail screen's price chart. Loaded only when a detail screen opens;
// the series comes from chart.js (6 h cache, 429 cool-down) and always names its source and period.
import { useEffect, useState } from "react";
import { ArrowClockwise } from "./icons.js";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "../format.js";
import { CHART_PERIODS, MAX_PERIOD, availablePeriods, chartCaptionPt, chartWindow, maxPeriodLabelPt } from "../lib/chart.js";
import { Change } from "./ui.jsx";

const dayMonth = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short" });
const monthYear = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short", year: "2-digit" });
const fullDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" });
const clean = (text) => text.replace(/\./g, "").replace(" de ", " ");

const PERIOD_WORDS = { "7D": "em 7 dias", "30D": "em 30 dias", "3M": "em 3 meses", "1A": "em 1 ano", [MAX_PERIOD]: "no período" };

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return <div className="chart-tooltip"><b>{formatBRL(point.value)}</b><span>{fullDate.format(new Date(point.t))}</span></div>;
}

export default function PriceChart({ token, loader, reducedMotion = false }) {
  const [result, setResult] = useState({ status: "loading" });
  const [period, setPeriod] = useState("1A");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setResult({ status: "loading" });
    loader.load(token, { force: attempt > 0 }).then((next) => { if (alive) setResult(next); }, () => { if (alive) setResult({ status: "unavailable" }); });
    return () => { alive = false; };
  }, [loader, token, attempt]);

  const ok = result.status === "ok";
  const periods = ok ? availablePeriods(result.points) : [];
  const active = periods.includes(period) ? period : periods[periods.length - 1];
  const shown = ok && active ? chartWindow(result.points, active) : { points: [], change: null };
  // Five evenly spaced dates inside the window (edges would clip); months only for long windows.
  const first = shown.points[0]?.t ?? 0;
  const span = shown.points.length > 1 ? shown.points[shown.points.length - 1].t - first : 0;
  const long = span > 200 * 86_400_000;
  const tick = (t) => clean((long ? monthYear : dayMonth).format(new Date(t)));
  const ticks = span ? [0.08, 0.3, 0.52, 0.74, 0.94].map((share) => first + span * share) : undefined;
  const values = shown.points.map((point) => point.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = (max - min) * 0.12 || max * 0.01;
  const tabs = [...CHART_PERIODS, ...(periods.includes(MAX_PERIOD) ? [MAX_PERIOD] : [])];

  return (
    <section className="card chart-card" aria-labelledby="chart-title">
      <div className="chart-card__top">
        <div className="chart-card__change">
          <h2 id="chart-title" className="visually-hidden">Gráfico de preço de {token.namePt}</h2>
          {ok && active ? <><Change pct={shown.change} period={PERIOD_WORDS[active]} /><span>{PERIOD_WORDS[active]}</span></> : <span>Preço em reais</span>}
        </div>
        <div className="period-tabs" role="tablist" aria-label="Período do gráfico">
          {tabs.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={active === item} disabled={ok ? !periods.includes(item) : true} onClick={() => setPeriod(item)} title={item === MAX_PERIOD && ok ? maxPeriodLabelPt(result.points) : undefined}>{item}</button>
          ))}
        </div>
      </div>
      {result.status === "loading" && <div className="chart-state" aria-busy="true"><span className="skeleton" style={{ width: "92%", height: 200 }} aria-hidden="true" /><span className="visually-hidden">Carregando gráfico…</span></div>}
      {(result.status === "rate_limited" || result.status === "unavailable") && (
        <div className="chart-state">
          <p>Gráfico indisponível agora.</p>
          <button className="btn btn--secondary" type="button" onClick={() => setAttempt((value) => value + 1)}><ArrowClockwise size={18} aria-hidden="true" /> Tentar novamente</button>
        </div>
      )}
      {ok && (
        <div className="chart-area" role="img" aria-label={`Preço de ${token.namePt} em reais, ${PERIOD_WORDS[active]}: de ${formatBRL(values[0])} para ${formatBRL(values[values.length - 1])}.`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={shown.points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="anilArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B38D0" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="#3B38D0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} interval={0} tickFormatter={tick} axisLine={false} tickLine={false} tick={{ fill: "#5E5F66", fontSize: 12 }} />
              <YAxis hide domain={[min - pad, max + pad]} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#9E9CF0", strokeDasharray: "3 3" }} />
              <Area type="monotone" dataKey="value" stroke="#3B38D0" strokeWidth={2} fill="url(#anilArea)" isAnimationActive={!reducedMotion} animationDuration={600} activeDot={{ r: 4, fill: "#3B38D0", stroke: "#fff", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {ok && <p className="chart-caption">{chartCaptionPt(token, result)}{result.stale ? " · pode estar desatualizado" : ""}</p>}
    </section>
  );
}
