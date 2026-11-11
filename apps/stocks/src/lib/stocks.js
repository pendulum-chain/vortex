// The launch universe: a bundled allowlist of Stock Tokens on Robinhood Chain (chain id 4663).
// Addresses come from the RHJ registry. The list ships in the bundle;
// scripts/verify-allowlist.mjs re-checks it against the registry and the chain before a release.
// Never take names or addresses from an aggregator's token list: they carry lookalikes (NET
// "NetNet", BULL). tests/stocks-allowlist.test.mjs pins this file.

import { BRAND } from "../brand.js";

/** @typedef {{ symbol:string, namePt:string, descriptionPt:string, underlyingName:string, type:"stock"|"etf",
 *   collections:string[],          // ids from COLLECTIONS (a token can be in several)
 *   badgesPt:string[],             // "Para começar", "Oscila mais", "Nova na bolsa", "Baixa oscilação"
 *   role:"default-first-buy"|"dollar-reserve"|null,
 *   guardTier:"A"|"B",             // all 12 launch tokens passed the liquidity check -> "A" (price-guard.js)
 *   address:`0x${string}`, decimals:18, isin:string, coingeckoId:string,
 *   chart:{ coingeckoId:string, source:"xstocks-proxy"|"token" }, chainlinkFeed:string|null,
 *   multiplierSnapshot:string,     // uiMultiplier() on 2026-09-26 (18-decimal string); the chain read wins
 *   logo:string|null,              // app-local monogram tile "logos/<ticker>.svg" once design delivers; null = ticker chip
 *   searchTerms:string[] }} StockToken */

export const ALLOWLIST_SNAPSHOT = Object.freeze({
  registry: "https://api.robinhood.com/rhj/assets",
  fetchedAt: "2026-09-26",
  chainId: 4663,
});

export const VOLATILITY_BADGE = "Oscila mais";

const token = (entry) => Object.freeze({
  decimals: 18,
  guardTier: "A",
  logo: null,
  ...entry,
  collections: Object.freeze(entry.collections),
  badgesPt: Object.freeze(entry.badgesPt),
  chart: Object.freeze(entry.chart),
  searchTerms: Object.freeze(entry.searchTerms),
});

/** @type {ReadonlyArray<StockToken>} in DEFAULT_ORDER */
export const STOCK_TOKENS = Object.freeze([
  token({
    symbol: "SPY", namePt: "S&P 500", type: "etf", underlyingName: "SPDR S&P 500 ETF Trust",
    descriptionPt: "Cerca de 500 grandes empresas americanas numa compra só. O jeito mais simples de começar.",
    collections: ["fundos-de-indice"], badgesPt: ["Para começar"], role: "default-first-buy",
    address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", isin: "US78462F1030",
    coingeckoId: "spdr-s-p-500-etf-trust-robinhood-tokenized-stock",
    chart: { coingeckoId: "sp500-xstock", source: "xstocks-proxy" },
    chainlinkFeed: "0x319724394D3A0e3669269846abE664Cd621f9f6A",
    multiplierSnapshot: "1.001717991187472003",
    searchTerms: ["ivvb11", "bivb39", "s&p 500", "sp500"],
  }),
  token({
    symbol: "TSLA", namePt: "Tesla", type: "stock", underlyingName: "Tesla, Inc.",
    descriptionPt: "Carros elétricos, baterias e robôs. A empresa de Elon Musk.",
    collections: ["big-techs", "mais-negociadas"], badgesPt: ["Oscila mais"], role: null,
    address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", isin: "US88160R1014",
    coingeckoId: "tesla-robinhood-tokenized-stock",
    chart: { coingeckoId: "tesla-xstock", source: "xstocks-proxy" },
    chainlinkFeed: "0x4A1166a659A55625345e9515b32adECea5547C38",
    multiplierSnapshot: "1.000000000000000000",
    searchTerms: ["tsla34"],
  }),
  token({
    symbol: "NVDA", namePt: "Nvidia", type: "stock", underlyingName: "NVIDIA Corporation",
    descriptionPt: "Fabricante dos chips que treinam e rodam a inteligência artificial.",
    collections: ["big-techs", "inteligencia-artificial", "mais-negociadas"], badgesPt: [], role: null,
    address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", isin: "US67066G1040",
    coingeckoId: "nvidia-robinhood-tokenized-stock",
    chart: { coingeckoId: "nvidia-xstock", source: "xstocks-proxy" },
    chainlinkFeed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
    multiplierSnapshot: "1.000775159164630595",
    searchTerms: ["nvdc34"],
  }),
  token({
    symbol: "AMZN", namePt: "Amazon", type: "stock", underlyingName: "Amazon.com, Inc.",
    descriptionPt: "Compras online, Prime Video e a nuvem AWS.",
    collections: ["big-techs", "mais-negociadas"], badgesPt: [], role: null,
    address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", isin: "US0231351067",
    coingeckoId: "amazon-robinhood-tokenized-stock",
    chart: { coingeckoId: "amazon-xstock", source: "xstocks-proxy" },
    chainlinkFeed: "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C",
    multiplierSnapshot: "1.000000000000000000",
    searchTerms: ["amzo34"],
  }),
  token({
    symbol: "AAPL", namePt: "Apple", type: "stock", underlyingName: "Apple Inc.",
    descriptionPt: "A empresa do iPhone, do Mac e dos AirPods.",
    collections: ["big-techs"], badgesPt: [], role: null,
    address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", isin: "US0378331005",
    coingeckoId: "apple-robinhood-tokenized-stock",
    chart: { coingeckoId: "apple-xstock", source: "xstocks-proxy" },
    chainlinkFeed: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0",
    multiplierSnapshot: "1.000566080061092436",
    searchTerms: ["aapl34"],
  }),
  token({
    symbol: "GOOGL", namePt: "Google (Alphabet)", type: "stock", underlyingName: "Alphabet Inc. Class A",
    descriptionPt: "Dona do Google, do YouTube e do Android.",
    collections: ["big-techs", "inteligencia-artificial"], badgesPt: [], role: null,
    address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", isin: "US02079K3059",
    coingeckoId: "alphabet-class-a-robinhood-tokenized-stock",
    chart: { coingeckoId: "alphabet-xstock", source: "xstocks-proxy" },
    chainlinkFeed: "0xF6f373a037c30F0e5010d854385cA89185AE638b",
    multiplierSnapshot: "1.000193924414112587",
    searchTerms: ["gogl34", "alphabet"],
  }),
  token({
    symbol: "MSFT", namePt: "Microsoft", type: "stock", underlyingName: "Microsoft Corporation",
    descriptionPt: "Windows, Office, Xbox e a nuvem Azure.",
    collections: ["big-techs", "inteligencia-artificial"], badgesPt: [], role: null,
    address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", isin: "US5949181045",
    coingeckoId: "microsoft-robinhood-tokenized-stock",
    chart: { coingeckoId: "microsoft-xstock", source: "xstocks-proxy" },
    chainlinkFeed: "0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E",
    multiplierSnapshot: "1.000412952576205964",
    searchTerms: ["msft34"],
  }),
  token({
    symbol: "QQQ", namePt: "Nasdaq-100", type: "etf", underlyingName: "Invesco QQQ Trust, Series 1",
    descriptionPt: "As 100 maiores empresas não financeiras da Nasdaq, com muito peso em tecnologia.",
    collections: ["fundos-de-indice"], badgesPt: [], role: null,
    address: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", isin: "US46090E1038",
    coingeckoId: "invesco-qqq-robinhood-tokenized-stock",
    chart: { coingeckoId: "nasdaq-xstock", source: "xstocks-proxy" },
    chainlinkFeed: "0x80901d846d5D7B030F26B480776EE3b29374C2ae",
    multiplierSnapshot: "1.000700791241405425",
    searchTerms: ["nasd11", "nasdaq"],
  }),
  token({
    symbol: "SPCX", namePt: "SpaceX", type: "stock", underlyingName: "Space Exploration Technologies Corp. Class A",
    descriptionPt: "Foguetes e internet via satélite Starlink. Na bolsa desde junho de 2026.",
    collections: ["mais-negociadas"], badgesPt: ["Oscila mais", "Nova na bolsa"], role: null,
    address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", isin: "US84615Q1031",
    coingeckoId: "spacex-robinhood-tokenized-stock",
    chart: { coingeckoId: "spacex-xstocks", source: "xstocks-proxy" },
    chainlinkFeed: "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb",
    multiplierSnapshot: "1.000000000000000000",
    searchTerms: ["spcx34"],
  }),
  token({
    symbol: "META", namePt: "Meta", type: "stock", underlyingName: "Meta Platforms, Inc.",
    descriptionPt: "Dona do WhatsApp, do Instagram e do Facebook.",
    collections: ["big-techs", "inteligencia-artificial"], badgesPt: [], role: null,
    address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", isin: "US30303M1027",
    coingeckoId: "meta-platforms-robinhood-tokenized-stock",
    chart: { coingeckoId: "meta-xstock", source: "xstocks-proxy" },
    chainlinkFeed: "0x7C38C00C30BEe9378381E7B6135d7283356D71b1",
    multiplierSnapshot: "1.000541459879451635",
    searchTerms: ["m1ta34", "facebook"],
  }),
  token({
    symbol: "MU", namePt: "Micron", type: "stock", underlyingName: "Micron Technology, Inc.",
    descriptionPt: "Chips de memória, peça-chave dos data centers de inteligência artificial.",
    collections: ["inteligencia-artificial", "mais-negociadas"], badgesPt: ["Oscila mais"], role: null,
    address: "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD", isin: "US5951121038",
    coingeckoId: "micron-technology-robinhood-tokenized-stock",
    // No full-year proxy; found in CoinGecko coins/list, with points since 2026-06-04.
    chart: { coingeckoId: "micron-technology-xstock", source: "xstocks-proxy" },
    chainlinkFeed: "0x425EEFdCf05ed6526C3cE61Af99429A228a6d596",
    multiplierSnapshot: "1.000074823219171086",
    searchTerms: ["mutc34"],
  }),
  token({
    symbol: "SGOV", namePt: "Tesouro americano (até 3 meses)", type: "etf", underlyingName: "iShares 0-3 Month Treasury Bond ETF",
    descriptionPt: "Títulos do Tesouro dos EUA com vencimento de até 3 meses. Oscila pouco; o rendimento é reinvestido.",
    collections: ["fundos-de-indice"], badgesPt: ["Baixa oscilação"], role: "dollar-reserve",
    address: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5", isin: "US46436E7186",
    coingeckoId: "ishares-0-3-month-treasury-bond-etf-robinhood-tokenized-stock",
    // The token's own series: the xStocks SGOV id returned 0 points, and the
    // underlying's price is flat (~100.6) because the yield is reinvested through the multiplier.
    chart: { coingeckoId: "ishares-0-3-month-treasury-bond-etf-robinhood-tokenized-stock", source: "token" },
    chainlinkFeed: "0xa0DF4ee0fFf975306345875E3548Fcc519577A11",
    multiplierSnapshot: "1.005101770003214918",
    searchTerms: ["tesouro americano", "t-bill", "reserva em dólar"],
  }),
]);

export const DEFAULT_ORDER = Object.freeze(["SPY", "TSLA", "NVDA", "AMZN", "AAPL", "GOOGL", "MSFT", "QQQ", "SPCX", "META", "MU", "SGOV"]);

// "Mais negociadas no Brasil" keeps the B3 June 2026 BDR rank order (refresh monthly).
export const COLLECTIONS = Object.freeze([
  { id: "fundos-de-indice", titlePt: "Fundos de índice", subtitlePt: "Muitas empresas (ou títulos) numa compra só", tickers: ["SPY", "QQQ", "SGOV"] },
  { id: "big-techs", titlePt: "Big Techs", subtitlePt: "As 7 Magníficas da bolsa americana", tickers: ["TSLA", "NVDA", "AMZN", "AAPL", "GOOGL", "MSFT", "META"] },
  { id: "inteligencia-artificial", titlePt: "Inteligência artificial", subtitlePt: "Chips, nuvem e apps por trás da IA", tickers: ["NVDA", "GOOGL", "MSFT", "META", "MU"] },
  { id: "mais-negociadas", titlePt: "Mais negociadas no Brasil", subtitlePt: "As que mais giraram em BDRs na B3 em junho de 2026", tickers: ["MU", "NVDA", "SPCX", "AMZN", "TSLA"] },
].map((collection) => Object.freeze({ ...collection, tickers: Object.freeze(collection.tickers) })));

// Tokenized on Robinhood Chain but not launched. Deliberately WITHOUT addresses: a watchlist hit is
// never buyable. BDR tickers are included where known.
export const WATCHLIST = Object.freeze([
  { symbol: "NU", namePt: "Nubank", terms: ["nubank", "nu holdings", "roxo34"], status: "gated-liquidity" },
  { symbol: "AMD", namePt: "AMD", terms: ["a1md34"], status: "wave-2" },
  { symbol: "PLTR", namePt: "Palantir", terms: ["p2lt34"], status: "wave-2" },
  { symbol: "TSM", namePt: "TSMC", terms: ["taiwan semiconductor", "tsmc34"], status: "wave-2" },
  { symbol: "MSTR", namePt: "Strategy (MicroStrategy)", terms: ["microstrategy", "m2st34"], status: "wave-2" },
  { symbol: "NFLX", namePt: "Netflix", terms: ["nflx34"], status: "wave-2" },
  { symbol: "VTI", namePt: "Vanguard Total Stock Market", terms: ["vanguard"], status: "watch" },
  { symbol: "LLY", namePt: "Eli Lilly", terms: ["lilly"], status: "watch" },
  { symbol: "JNJ", namePt: "Johnson & Johnson", terms: ["jnjb34"], status: "watch-income" },
].map((item) => Object.freeze({ ...item, terms: Object.freeze(item.terms) })));

// Wanted by Brazilian investors but not in the RHJ registry (2026-09-26). No date is ever promised.
export const NOT_TOKENIZED = Object.freeze([
  { symbol: "MELI", namePt: "MercadoLibre", terms: ["mercado livre", "mercadolivre", "meli34"] },
  { symbol: "INTR", namePt: "Inter&Co", terms: ["banco inter", "inter & co", "inbr32"] },
  { symbol: "KO", namePt: "Coca-Cola", terms: ["coca cola", "coca34"] },
  { symbol: "BRK.B", namePt: "Berkshire Hathaway", terms: ["berkshire", "brk b", "berk34"] },
  { symbol: "XP", namePt: "XP Inc.", terms: ["xp investimentos", "xpbr31"] },
  { symbol: "DIS", namePt: "Disney", terms: ["walt disney", "disb34"] },
  { symbol: "O", namePt: "Realty Income", terms: ["realty income"] },
].map((item) => Object.freeze({ ...item, terms: Object.freeze(item.terms) })));

// GLD is tokenized and liquid but duplicates ouro. (PAXG): send the user there, same tab.
export const CROSS_LINKS = Object.freeze([
  Object.freeze({ terms: Object.freeze(["gld", "ouro", "gold", "paxg"]), label: "Para ouro, use o ouro. by Vortex", href: "/pt-br/gold/" }),
]);

// Pending issuer corporate actions (RHJ /rhj/corporate-actions, seen 2026-09-26T14:04Z). Expect a multiplier change and a trading pause of about 02:00-15:30 CET on
// the process date (market-hours.js expectedIssuerPause). The chain read (paused/oraclePaused) is
// what actually disables buy and sell. A snapshot goes stale: scripts/verify-allowlist.mjs fails
// before a release when it is older than 14 days or misses a pending action of a launch token.
export const CORPORATE_ACTIONS_SEEN_AT = "2026-09-26";
export const CORPORATE_ACTIONS = Object.freeze([
  Object.freeze({ symbol: "META", kind: "cash-dividend", processDate: "2026-09-28" }),
  Object.freeze({ symbol: "NVDA", kind: "cash-dividend", processDate: "2026-10-01" }),
  Object.freeze({ symbol: "QQQ", kind: "cash-dividend", processDate: "2026-10-08" }),
]);

// Draft copy, brand and legal review pending.
export const SHARED_COPY_PT = Object.freeze({
  whatYouBuy: "Você compra Stock Tokens, emitidos pela Robinhood Assets (Jersey) Limited, que acompanham o preço da ação ou do fundo. Não é a ação em si e não dá direito a voto.",
  dividends: "Dividendos são reinvestidos automaticamente no próprio token. Não há pagamento em dinheiro.",
  hours: "Compre quando quiser, inclusive à noite e no fim de semana. Fora do horário da bolsa americana, o preço pode variar mais.",
  pauses: "Em eventos como pagamento de dividendos, a negociação de um ativo pode pausar por algumas horas.",
});

/** The "hours" line; while buying is not open yet it does not say "Compre quando quiser" as if it were possible today. */
export const hoursPt = (rampOpen) => (rampOpen === false ? `Quando a compra com Pix for liberada: ${SHARED_COPY_PT.hours[0].toLowerCase()}${SHARED_COPY_PT.hours.slice(1)}` : SHARED_COPY_PT.hours);

// A sell's network fee is part of its own quote: a permit sell spends no ETH from the wallet. See
// tests/stocks-allowlist.test.mjs.
export const SELL_NETWORK_FEE_PT = "Para vender, você não precisa comprar ETH à parte: a taxa de rede já vem descontada do valor que você recebe no Pix.";

const BY_SYMBOL = new Map(STOCK_TOKENS.map((item) => [item.symbol, item]));
const BY_ADDRESS = new Map(STOCK_TOKENS.map((item) => [item.address.toLowerCase(), item]));

/** Launch tokens only; case-insensitive. */
export function findStock(symbol) {
  return BY_SYMBOL.get(String(symbol || "").trim().toUpperCase()) ?? null;
}

export function findStockByAddress(address) {
  return BY_ADDRESS.get(String(address || "").toLowerCase()) ?? null;
}

export const tokensInCollection = (collectionId) => STOCK_TOKENS.filter((item) => item.collections.includes(collectionId));

export const isVolatile = (item) => item.badgesPt.includes(VOLATILITY_BADGE);

/** Extra risk lines for the detail screen. */
export function riskNotesPt(item) {
  const notes = [];
  if (isVolatile(item)) notes.push("O preço pode oscilar muito.");
  if (item.role === "dollar-reserve") notes.push("Rendimento reinvestido no token; não há pagamento em dinheiro.");
  return notes;
}

/** The ISIN belongs to the share or fund the token tracks, not to the token (an RHJ debt instrument). */
export const isinLabelPt = (item) => (item.type === "etf" ? "ISIN do fundo acompanhado" : "ISIN da ação acompanhada");

/** Lowercase, accents stripped (NFD + \p{M}), so "Ações" matches "acoes". */
export const normalizeSearch = (value) => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

// Words that say "I want a stock" rather than which one ("ações nubank").
const STOPWORDS = new Set(["acao", "acoes", "bdr", "bdrs", "token", "tokens", "stock", "stocks", "da", "de", "do", "das", "dos", "comprar"]);

function queryWords(query) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => !STOPWORDS.has(word));
  return meaningful.length ? meaningful : words;
}

// 0 = exact, 1 = prefix of the field or of one of its words, 2 = substring, null = no match.
function matchQuality(word, hay) {
  if (hay === word) return 0;
  if (hay.startsWith(word) || hay.split(/[\s()&.,-]+/).some((part) => part.startsWith(word))) return 1;
  return hay.includes(word) ? 2 : null;
}

// Every query word must match some field; the result is the weakest word's best match.
function score(words, symbol, fields) {
  const haystacks = [symbol, ...fields].map(normalizeSearch);
  let worst = 0;
  for (const word of words) {
    let best = null;
    for (const hay of haystacks) {
      const quality = matchQuality(word, hay);
      if (quality !== null && (best === null || quality < best)) best = quality;
    }
    if (best === null) return null;
    worst = Math.max(worst, best);
  }
  return worst;
}

const KIND_ORDER = { token: 0, cross_link: 1, watchlist: 2, not_tokenized: 3 };

/**
 * Accent/case-insensitive search over symbol, name and search terms, so a B3 BDR ticker
 * ("nvdc34") finds the US token.
 * @returns {Array<{kind:"token", token:StockToken}|{kind:"watchlist", item:object}|{kind:"not_tokenized", item:object}|{kind:"cross_link", link:object}>}
 */
export function searchStocks(query) {
  const words = queryWords(query);
  if (!words.length) return [];
  const hits = [];
  STOCK_TOKENS.forEach((item, index) => {
    const quality = score(words, item.symbol, [item.namePt, ...item.searchTerms]);
    if (quality !== null) hits.push({ quality, index, hit: { kind: "token", token: item } });
  });
  WATCHLIST.forEach((item, index) => {
    const quality = score(words, item.symbol, [item.namePt, ...item.terms]);
    if (quality !== null) hits.push({ quality, index, hit: { kind: "watchlist", item } });
  });
  NOT_TOKENIZED.forEach((item, index) => {
    const quality = score(words, item.symbol, [item.namePt, ...item.terms]);
    if (quality !== null) hits.push({ quality, index, hit: { kind: "not_tokenized", item } });
  });
  CROSS_LINKS.forEach((link, index) => {
    // Only a whole term or a prefix of 3+ letters ("our"), never a stray substring.
    const matches = words.some((word) => link.terms.some((term) => term === word || (word.length >= 3 && term.startsWith(word))));
    if (matches) hits.push({ quality: 0, index, hit: { kind: "cross_link", link } });
  });
  hits.sort((a, b) => a.quality - b.quality || KIND_ORDER[a.hit.kind] - KIND_ORDER[b.hit.kind] || a.index - b.index);
  return hits.map((entry) => entry.hit);
}

/** Copy for a non-buyable search hit; never promises a date. */
export function searchHitNotePt(hit, productName = BRAND.name) {
  if (hit.kind === "watchlist") return `${hit.item.namePt} (${hit.item.symbol}): em avaliação, ainda não disponível no ${productName}`;
  if (hit.kind === "not_tokenized") return `${hit.item.namePt} ainda não existe como Stock Token na Robinhood Chain.`;
  if (hit.kind === "cross_link") return `${hit.link.label} →`;
  return null;
}
