import assert from "node:assert/strict";
import test from "node:test";
import { sourceFiles } from "./helpers.mjs";
import { MARKET_CLOSED_NOTE_PT, MARKET_CLOSED_SELL_NOTE_PT, NYSE_EARLY_CLOSES, NYSE_HOLIDAYS, expectedIssuerPause, isNyseHoliday, issuerPauseNotePt, tokenizationClosedNotePt, tokenizationWindowOpen, tokenizationWindowPt, usMarketStatus, zonedTimeToDate } from "../src/lib/market-hours.js";

const at = (iso) => new Date(iso);

test("weekends are closed and the next open is Monday 09:30 New York", () => {
  const status = usMarketStatus(at("2026-09-26T14:00:00Z")); // Saturday
  assert.equal(status.open, false);
  assert.equal(status.reason, "weekend");
  assert.equal(status.nextOpen.toISOString(), "2026-09-28T13:30:00.000Z");
  assert.equal(status.closesAt, null);
  assert.equal(usMarketStatus(at("2026-09-27T20:00:00Z")).reason, "weekend"); // Sunday
});

test("a weekday session is open 09:30-16:00 New York (EDT in September)", () => {
  const open = usMarketStatus(at("2026-09-28T14:00:00Z")); // 10:00 EDT
  assert.equal(open.open, true);
  assert.equal(open.reason, null);
  assert.equal(open.closesAt.toISOString(), "2026-09-28T20:00:00.000Z");
  assert.equal(usMarketStatus(at("2026-09-28T13:00:00Z")).reason, "pre_market"); // 09:00 EDT
  assert.equal(usMarketStatus(at("2026-09-28T13:00:00Z")).nextOpen.toISOString(), "2026-09-28T13:30:00.000Z");
  assert.equal(usMarketStatus(at("2026-09-28T13:30:00Z")).open, true);
  assert.equal(usMarketStatus(at("2026-09-28T19:59:00Z")).open, true);
  assert.equal(usMarketStatus(at("2026-09-28T20:00:00Z")).reason, "after_hours");
});

test("NYSE holidays are closed, including observed ones", () => {
  const thanksgiving = usMarketStatus(at("2026-11-26T15:00:00Z"));
  assert.equal(thanksgiving.reason, "holiday");
  assert.equal(thanksgiving.nextOpen.toISOString(), "2026-11-27T14:30:00.000Z");
  assert.equal(usMarketStatus(at("2026-07-03T15:00:00Z")).reason, "holiday"); // Independence Day observed (Fri)
  assert.equal(usMarketStatus(at("2027-12-24T15:00:00Z")).reason, "holiday"); // Christmas observed (Fri)
  assert.equal(usMarketStatus(at("2027-03-26T15:00:00Z")).reason, "holiday"); // Good Friday 2027
  assert.equal(NYSE_HOLIDAYS[2026].length, 10);
  assert.equal(NYSE_HOLIDAYS[2027].length, 10);
  for (const list of Object.values(NYSE_HOLIDAYS)) {
    for (const iso of list) {
      const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay();
      assert.ok(weekday >= 1 && weekday <= 5, `${iso} is a weekend day`);
    }
  }
  // A holiday before a weekend: the next open skips both.
  assert.equal(usMarketStatus(at("2026-04-03T15:00:00Z")).nextOpen.toISOString(), "2026-04-06T13:30:00.000Z");
});

test("the opening bell follows New York daylight saving time", () => {
  // 2026-11-01: EDT ends. Monday 2026-11-02 opens at 14:30 UTC (09:30 EST).
  assert.equal(usMarketStatus(at("2026-11-02T14:30:00Z")).open, true);
  assert.equal(usMarketStatus(at("2026-11-02T14:29:00Z")).open, false);
  assert.equal(usMarketStatus(at("2026-11-02T14:29:00Z")).reason, "pre_market");
  // 2027-03-14: EDT starts. Monday 2027-03-15 opens at 13:30 UTC again.
  assert.equal(usMarketStatus(at("2027-03-15T13:30:00Z")).open, true);
  assert.equal(usMarketStatus(at("2027-03-15T13:29:00Z")).open, false);
  // After Friday's close the next open is Monday.
  const friday = usMarketStatus(at("2026-10-30T20:30:00Z"));
  assert.equal(friday.reason, "after_hours");
  assert.equal(friday.nextOpen.toISOString(), "2026-11-02T14:30:00.000Z");
});

test("years without a holiday table only know weekends", () => {
  assert.equal(isNyseHoliday({ year: 2028, month: 1, day: 17 }), false);
  assert.equal(usMarketStatus(at("2028-01-17T15:00:00Z")).open, true);
});

test("the issuer's tokenization window closes Saturday 02:00 and reopens Monday 02:00 (Berlin clock)", () => {
  // Berlin is CEST (UTC+2) in September.
  assert.equal(tokenizationWindowOpen(at("2026-09-25T23:59:00Z")), true); // Sat 01:59
  assert.equal(tokenizationWindowOpen(at("2026-09-26T00:01:00Z")), false); // Sat 02:01
  assert.equal(tokenizationWindowOpen(at("2026-09-27T12:00:00Z")), false); // Sunday
  assert.equal(tokenizationWindowOpen(at("2026-09-27T23:59:00Z")), false); // Mon 01:59
  assert.equal(tokenizationWindowOpen(at("2026-09-28T00:01:00Z")), true); // Mon 02:01
  // CET (UTC+1) in December.
  assert.equal(tokenizationWindowOpen(at("2026-12-05T00:59:00Z")), true); // Sat 01:59
  assert.equal(tokenizationWindowOpen(at("2026-12-05T01:01:00Z")), false); // Sat 02:01
});

test("the issuer window is shown in Brasília time, never as CET", () => {
  // Mon/Sat 02:00 Berlin = Sun/Fri 21:00 in Brasília while Berlin is on summer time, 22:00 in winter.
  assert.equal(tokenizationWindowPt(at("2026-09-30T12:00:00Z")), "de domingo 21:00 a sexta-feira 21:00 (horário de Brasília)");
  assert.equal(tokenizationWindowPt(at("2026-12-09T12:00:00Z")), "de domingo 22:00 a sexta-feira 22:00 (horário de Brasília)");
  // Saturday afternoon in Brasília: it reopens tomorrow (Sunday) 21:00; on Sunday it is "hoje".
  assert.equal(tokenizationClosedNotePt(at("2026-09-26T15:00:00Z")), "Até amanhã 21:00 (Brasília), o emissor não cria nem resgata tokens; nesse período, a cotação pode ficar menos favorável.");
  assert.match(tokenizationClosedNotePt(at("2026-09-27T12:00:00Z")), /^Até hoje 21:00 \(Brasília\),/);
  assert.match(tokenizationClosedNotePt(at("2026-09-27T23:30:00Z")), /^Até hoje 21:00 \(Brasília\),/, "Sunday 20:30 in Brasília, Monday 01:30 in Berlin");
  assert.match(tokenizationClosedNotePt(at("2026-12-05T15:00:00Z")), /^Até amanhã 22:00 \(Brasília\),/);
});

test("wall-clock conversion is DST-safe", () => {
  assert.equal(zonedTimeToDate({ year: 2026, month: 7, day: 1, hour: 9, minute: 30 }, "America/New_York").toISOString(), "2026-07-01T13:30:00.000Z");
  assert.equal(zonedTimeToDate({ year: 2026, month: 12, day: 1, hour: 9, minute: 30 }, "America/New_York").toISOString(), "2026-12-01T14:30:00.000Z");
  assert.equal(zonedTimeToDate({ year: 2026, month: 12, day: 1, hour: 2, minute: 0 }, "Europe/Berlin").toISOString(), "2026-12-01T01:00:00.000Z");
});

test("a pending corporate action announces the issuer's expected pause window", () => {
  const before = expectedIssuerPause("META", at("2026-09-26T14:00:00Z"));
  assert.equal(before.processDate, "2026-09-28");
  assert.equal(before.start.toISOString(), "2026-09-28T00:00:00.000Z"); // 02:00 CEST
  assert.equal(before.end.toISOString(), "2026-09-28T13:30:00.000Z"); // 15:30 CEST
  assert.equal(before.upcoming, true);
  assert.equal(before.active, false);
  const during = expectedIssuerPause("meta", at("2026-09-28T10:00:00Z"));
  assert.equal(during.active, true);
  assert.equal(expectedIssuerPause("META", at("2026-09-28T13:30:00Z")), null, "over once the window ends");
  assert.equal(expectedIssuerPause("AAPL", at("2026-09-26T14:00:00Z")), null);
  assert.equal(expectedIssuerPause("QQQ", at("2026-10-01T12:00:00Z")).processDate, "2026-10-08");
});

test("the corporate-action pause notice shows a week ahead, in Brasília time", () => {
  const saturday = new Date("2026-09-26T14:00:00Z");
  const meta = issuerPauseNotePt(expectedIssuerPause("META", saturday), saturday);
  assert.equal(meta.active, false);
  // 02:00-15:30 in Berlin (CEST) = 21:00 the evening before to 10:30 in Brasília.
  assert.equal(meta.text, "De dom 27/09 21:00 a seg 28/09 10:30 (Brasília), para processar dividendos (reinvestidos no token). Compra e venda podem ficar indisponíveis nesse período.");
  assert.equal(issuerPauseNotePt(expectedIssuerPause("QQQ", saturday), saturday), null, "12 days away: not yet");
  assert.equal(issuerPauseNotePt(expectedIssuerPause("SPY", saturday), saturday), null);
  const during = new Date("2026-09-28T05:00:00Z");
  const active = issuerPauseNotePt(expectedIssuerPause("META", during), during);
  assert.equal(active.active, true);
  assert.match(active.text, /até seg 28\/09 10:30 \(Brasília\)/);
});

test("NYSE early closes end the session at 13:00 New York", () => {
  // Day after Thanksgiving 2026 (EST): open at 12:00, closed from 13:00 (15:00 Brasília).
  const morning = usMarketStatus(at("2026-11-27T17:00:00Z"));
  assert.equal(morning.open, true);
  assert.equal(morning.closesAt.toISOString(), "2026-11-27T18:00:00.000Z");
  assert.equal(usMarketStatus(at("2026-11-27T18:00:00Z")).reason, "after_hours");
  assert.equal(usMarketStatus(at("2026-11-27T20:30:00Z")).reason, "after_hours", "15:30 New York: closed, not \"aberta\"");
  assert.equal(usMarketStatus(at("2026-12-24T18:30:00Z")).reason, "after_hours"); // Christmas Eve 2026
  assert.equal(usMarketStatus(at("2027-11-26T18:30:00Z")).reason, "after_hours");
  assert.equal(usMarketStatus(at("2026-11-30T18:30:00Z")).open, true, "a normal Monday is still open at 13:30");
  for (const [year, list] of Object.entries(NYSE_EARLY_CLOSES)) {
    for (const iso of list) {
      assert.ok(iso.startsWith(year));
      assert.ok(!NYSE_HOLIDAYS[year].includes(iso), `${iso} is a holiday, not an early close`);
    }
  }
});

test("both flows warn when the US market is closed, worded for buying and for selling", () => {
  assert.match(MARKET_CLOSED_NOTE_PT, /ainda pode comprar/);
  assert.match(MARKET_CLOSED_SELL_NOTE_PT, /ainda pode vender/);
  for (const [path, note] of [["src/flows/BuyFlow.jsx", "MARKET_CLOSED_NOTE_PT"], ["src/flows/SellFlow.jsx", "MARKET_CLOSED_SELL_NOTE_PT"]]) {
    const text = sourceFiles().find((file) => file.path === path).text;
    const amountStep = text.slice(text.indexOf("function AmountStep"), text.indexOf("\n}\n", text.indexOf("function AmountStep")));
    assert.match(amountStep, new RegExp(`!usMarketStatus\\(now\\)\\.open|!market\\.open`), path);
    assert.ok(amountStep.includes(note) && amountStep.includes("tokenizationClosedNotePt(now)"), path);
  }
});
