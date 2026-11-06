// US market status and the issuer's windows, computed locally (no network). All wall-clock logic
// goes through Intl time zones, so daylight-saving changes in New York, Berlin and the (DST-free)
// São Paulo clock are handled by the platform's time-zone database.
import { CORPORATE_ACTIONS } from "./stocks.js";

const NEW_YORK = "America/New_York";
const BERLIN = "Europe/Berlin";
const SAO_PAULO = "America/Sao_Paulo";

// https://www.nyse.com/markets/hours-calendars (seen 2026-09-26).
export const NYSE_HOLIDAYS = Object.freeze({
  2026: Object.freeze(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]),
  2027: Object.freeze(["2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"]),
});

// Early closes at 13:00 New York: the day after Thanksgiving and Christmas Eve (2027's Christmas Eve
// is the observed holiday). Same source; re-check it with the holiday table each year.
export const NYSE_EARLY_CLOSES = Object.freeze({
  2026: Object.freeze(["2026-11-27", "2026-12-24"]),
  2027: Object.freeze(["2027-11-26"]),
});

const OPEN_MINUTES = 9 * 60 + 30; // 09:30 New York
const CLOSE_MINUTES = 16 * 60; // 16:00 New York
const EARLY_CLOSE_MINUTES = 13 * 60; // 13:00 New York
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatters = new Map();
function zonedParts(date, timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second), weekday: WEEKDAYS.indexOf(parts.weekday) };
}

function zoneOffsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Wall-clock time in a zone -> the instant (re-checked once, for a DST change between guess and result). */
export function zonedTimeToDate({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = zoneOffsetMs(new Date(guess), timeZone);
  const second = zoneOffsetMs(new Date(guess - first), timeZone);
  return new Date(guess - second);
}

const isoDate = ({ year, month, day }) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// Calendar arithmetic on a date without a time zone (UTC is only the carrier).
function addDays({ year, month, day }, days) {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
}

/** Years without a table only know weekends. */
export const isNyseHoliday = (day) => (NYSE_HOLIDAYS[day.year] ?? []).includes(isoDate(day));

function isTradingDay(day) {
  const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isNyseHoliday(day);
}

const isEarlyClose = (day) => (NYSE_EARLY_CLOSES[day.year] ?? []).includes(isoDate(day));

/**
 * Regular session 09:30-16:00 America/New_York (13:00 on NYSE early-close days).
 * @returns {{open:boolean, reason:"weekend"|"holiday"|"pre_market"|"after_hours"|null, nextOpen:Date, closesAt:Date|null}}
 *   nextOpen: the next session's opening bell (the next one after today's while open).
 */
export function usMarketStatus(now = new Date()) {
  const current = zonedParts(now, NEW_YORK);
  const minutes = current.hour * 60 + current.minute;
  const close = isEarlyClose(current) ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES;
  let reason = null;
  if (current.weekday === 0 || current.weekday === 6) reason = "weekend";
  else if (isNyseHoliday(current)) reason = "holiday";
  else if (minutes < OPEN_MINUTES) reason = "pre_market";
  else if (minutes >= close) reason = "after_hours";
  let candidate = reason === "pre_market" ? addDays(current, 0) : addDays(current, 1);
  for (let guard = 0; guard < 14 && !isTradingDay(candidate); guard += 1) candidate = addDays(candidate, 1);
  const nextOpen = zonedTimeToDate({ ...candidate, hour: 9, minute: 30 }, NEW_YORK);
  const closesAt = reason === null ? zonedTimeToDate({ ...current, hour: Math.floor(close / 60), minute: close % 60 }, NEW_YORK) : null;
  return { open: reason === null, reason, nextOpen, closesAt };
}

/**
 * Issuer mint/burn window Mon 02:00 - Sat 02:00 "CET" (docs.robinhood.com/chain/stock-tokens).
 * Computed in Europe/Berlin local time; whether Robinhood means fixed UTC+1 or CET/CEST is UNVERIFIED.
 * On-chain trading continues 24/7 outside it, with thinner liquidity.
 */
export function tokenizationWindowOpen(now = new Date()) {
  const { weekday, hour, minute } = zonedParts(now, BERLIN);
  const minutes = hour * 60 + minute;
  if (weekday === 0) return false;
  if (weekday === 6) return minutes < 120;
  if (weekday === 1) return minutes >= 120;
  return true;
}

const brasiliaWeekday = new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO, weekday: "short" });
const brasiliaWeekdayLong = new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO, weekday: "long" });
const brasiliaTime = new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** The issuer window of the Berlin week that contains `now`, plus the next opening after `now`. */
function tokenizationWindow(now) {
  const today = zonedParts(now, BERLIN);
  const monday = addDays(today, -((today.weekday + 6) % 7));
  const opens = zonedTimeToDate({ ...monday, hour: 2, minute: 0 }, BERLIN);
  const closes = zonedTimeToDate({ ...addDays(monday, 5), hour: 2, minute: 0 }, BERLIN);
  const nextOpening = now.getTime() < opens.getTime() ? opens : zonedTimeToDate({ ...addDays(monday, 7), hour: 2, minute: 0 }, BERLIN);
  return { opens, closes, nextOpening };
}

// Brazilian users do not read "CET": the window is shown in Brasília time (21:00 while Berlin is on
// summer time, 22:00 in the European winter).
/** "de domingo 21:00 a sexta-feira 21:00 (horário de Brasília)" */
export function tokenizationWindowPt(now = new Date()) {
  const { opens, closes } = tokenizationWindow(now);
  const moment = (date) => `${brasiliaWeekdayLong.format(date)} ${brasiliaTime.format(date)}`;
  return `de ${moment(opens)} a ${moment(closes)} (horário de Brasília)`;
}

/** Shown while the window is closed: "Até amanhã 21:00 (Brasília), o emissor não cria nem resgata tokens; …" */
export function tokenizationClosedNotePt(now = new Date()) {
  const reopens = formatNextOpenBrasilia(tokenizationWindow(now).nextOpening, { now });
  return `Até ${reopens}, o emissor não cria nem resgata tokens; nesse período, a cotação pode ficar menos favorável.`;
}

function brasiliaDayNumber(date) {
  const { year, month, day } = zonedParts(date, SAO_PAULO);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** "seg 10:30 (Brasília)"; with {now}: "hoje 10:30 (Brasília)" / "amanhã 11:30 (Brasília)". */
export function formatNextOpenBrasilia(date, { now } = {}) {
  const time = brasiliaTime.format(date);
  let day = brasiliaWeekday.format(date).replace(/\.$/, "");
  if (now) {
    const diff = brasiliaDayNumber(date) - brasiliaDayNumber(now);
    if (diff === 0) day = "hoje";
    else if (diff === 1) day = "amanhã";
  }
  return `${day} ${time} (Brasília)`;
}

/** MarketBadge copy: "Bolsa dos EUA aberta" / "Bolsa dos EUA fechada · abre seg 10:30 (Brasília)". */
export function marketBadgePt(status, now = new Date()) {
  return status.open ? "Bolsa dos EUA aberta" : `Bolsa dos EUA fechada · abre ${formatNextOpenBrasilia(status.nextOpen, { now })}`;
}

export const MARKET_CLOSED_NOTE_PT = "A bolsa dos EUA está fechada. Você ainda pode comprar; o preço do token pode ficar diferente do último fechamento.";
export const MARKET_CLOSED_SELL_NOTE_PT = "A bolsa dos EUA está fechada. Você ainda pode vender; o preço do token pode ficar diferente do último fechamento.";

/**
 * The issuer's expected trading pause for a pending corporate action (about 02:00-15:30 CET on the
 * process date, Europe/Berlin clock). A hint for the UI only; paused/oraclePaused from the chain
 * decide whether buy and sell are disabled.
 * @returns {null|{symbol:string, kind:string, processDate:string, start:Date, end:Date, active:boolean, upcoming:boolean}}
 */
export function expectedIssuerPause(symbol, now = new Date(), actions = CORPORATE_ACTIONS) {
  const windows = actions
    .filter((action) => action.symbol === String(symbol || "").toUpperCase())
    .map((action) => {
      const [year, month, day] = action.processDate.split("-").map(Number);
      return { ...action, start: zonedTimeToDate({ year, month, day, hour: 2, minute: 0 }, BERLIN), end: zonedTimeToDate({ year, month, day, hour: 15, minute: 30 }, BERLIN) };
    })
    .filter((window) => window.end.getTime() > now.getTime())
    .sort((a, b) => a.start - b.start);
  const next = windows[0];
  if (!next) return null;
  return { symbol: next.symbol, kind: next.kind, processDate: next.processDate, start: next.start, end: next.end, active: next.start.getTime() <= now.getTime(), upcoming: now.getTime() < next.start.getTime() };
}

// Show the expected pause from a few days before it (a dividend date is announced ahead).
export const ISSUER_PAUSE_NOTICE_DAYS = 7;
const brasiliaDayMonth = new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO, day: "2-digit", month: "2-digit" });
const brasiliaMoment = (date) => `${brasiliaWeekday.format(date).replace(/\.$/, "")} ${brasiliaDayMonth.format(date)} ${brasiliaTime.format(date)}`;

/**
 * Detail-screen notice for expectedIssuerPause() (a corporate-action pause), in Brasília
 * time. null when there is no pause or it is more than ISSUER_PAUSE_NOTICE_DAYS away.
 * @returns {null|{active:boolean, title:string, text:string}}
 */
export function issuerPauseNotePt(pause, now = new Date()) {
  if (!pause) return null;
  if (!pause.active && pause.start.getTime() - now.getTime() > ISSUER_PAUSE_NOTICE_DAYS * 86_400_000) return null;
  const reason = pause.kind === "cash-dividend" ? "para processar dividendos (reinvestidos no token)" : "por um evento corporativo";
  if (pause.active) {
    return { active: true, title: "Pausa do emissor em andamento", text: `O emissor pode pausar este token até ${brasiliaMoment(pause.end)} (Brasília), ${reason}. Compra e venda podem ficar indisponíveis.` };
  }
  return { active: false, title: "Pausa prevista pelo emissor", text: `De ${brasiliaMoment(pause.start)} a ${brasiliaMoment(pause.end)} (Brasília), ${reason}. Compra e venda podem ficar indisponíveis nesse período.` };
}
