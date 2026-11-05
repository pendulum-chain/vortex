// Product name, lockup and colours. A rename touches this file, public/brand/*, index.html
// and the ErrorBoundary copy. The shared sign-in label belongs to @vortexfi/consumer-kit.
// tests/brand.test.mjs pins these values and their WCAG contrast.

// fatia.* colours. Price direction is never shown by colour alone (always ▲/▼ and a sign).
export const COLORS = Object.freeze({
  paper: "#F7F6F2", // page background
  surface: "#FFFFFF", // cards, sheets, inputs
  sunken: "#EFEEE9", // segmented controls, quick-amount chips, skeletons
  line: "#DDDCD8", // hairlines (decorative only)
  ink: "#15161D",
  textMuted: "#5E5F66", // >= 4.5:1 on paper and surface
  textSubtle: "#8A8B91", // placeholders/decoration only, never essential text
  anil50: "#EEEEFC",
  anil100: "#DEDDFA",
  anil200: "#C0BEF4",
  anil300: "#9E9CF0",
  anil400: "#7F7CFF", // period/accents on night
  anil500: "#5956E6",
  anil600: "#3B38D0", // brand primary: period, primary button, links, focus ring
  anil700: "#2F2CAD", // hover/pressed
  anil800: "#24228A",
  anil900: "#15173A", // night: app-icon ground, dark cards
  night: "#15173A",
  nightMuted: "#A9AAC4",
  positive: "#0F7B4B", // price up (with ▲ and +)
  positiveTint: "#E5F2EA",
  negative: "#B42B2B", // price down (with ▼ and −) and errors
  negativeTint: "#FBE9E7",
  warning: "#855600", // market closed, stale price, pending Pix
  warningTint: "#FBF1DC",
  focusRing: "#3B38D0", // 2px solid outline, 2px offset
});

export const FONTS = Object.freeze({
  display: "\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
  body: "\"DM Sans\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
  // Tickers and every ticking number: DM Sans has no tabular figures.
  numeric: "\"DM Mono\", ui-monospace, SFMono-Regular, Menlo, monospace",
  // The wordmark (outlined SVG) and at most one italic accent word per screen.
  accent: "\"Cormorant Garamond\", \"Iowan Old Style\", Georgia, serif",
});

export const RADIUS = Object.freeze({ sm: "8px", md: "12px", lg: "18px", sheet: "24px", pill: "999px" });

export const BRAND = Object.freeze({
  name: "fatia.",
  endorsement: "by Vortex",
  lockupAlt: "fatia. by Vortex",
  // Never show the name alone in marketing: always with the descriptor or the hero line.
  descriptorPt: "Tokens de ações dos EUA com Pix",
  accent: COLORS.anil600,
  // App-relative public files (prefix with import.meta.env.BASE_URL).
  assets: Object.freeze({
    wordmark: "brand/fatia-wordmark.svg", // app header, >= 32 px wordmark height, with live "by Vortex"
    wordmarkSmall: "brand/fatia-wordmark-small.svg", // below 32 px (solid period)
    wordmarkReversed: "brand/fatia-wordmark-reversed.svg", // on night
    lockup: "brand/fatia-lockup.svg", // marketing / landing, >= 160 px wide
    lockupReversed: "brand/fatia-lockup-reversed.svg",
    favicon: "brand/fatia-favicon.svg",
    appIcon: "brand/fatia-app-icon.svg",
    appIcon180: "brand/fatia-app-icon-180.png", // apple-touch-icon
    og: "brand/fatia-og-1200x630.png",
  }),
  // "Operado por …" (brand-final §4 rule 4): the owner supplies the entity text; null hides the line.
  operatorPt: null,
  touchTargetPx: 48, // the 60+ audience: 48 px hit areas
  privy: Object.freeze({
    accentColor: COLORS.anil600,
    // Conditional: a first-time visitor has no wallet yet (Privy creates it at this sign-in).
    loginMessage: "Se você usa o ouro., é o mesmo acesso e a mesma carteira.",
  }),
});

// The family around fatia. (same tab: the Vortex OTP session lives in per-tab storage).
export const FAMILY_LINKS = Object.freeze({
  ouro: Object.freeze({ name: "ouro.", labelPt: "Ir para ouro.", href: "/pt-br/gold/" }),
  business: Object.freeze({ labelPt: "Construído com a API Vortex — para empresas →", href: "/pt-br/business/" }),
  // Concept teaser only: a descriptor, never a "<name>." wordmark (no cleared name yet).
  familySafe: Object.freeze({ descriptorPt: "Plano de emergência digital", descriptorEn: "Family Safe", chipPt: "Conceito", color: "#7A2E55" }),
});

/** CSS custom properties for :root, generated from COLORS ("anil600" -> "--anil-600"). */
export function cssVariables() {
  const kebab = (name) => name.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/([a-z])(\d)/g, "$1-$2").toLowerCase();
  const lines = Object.entries(COLORS).map(([name, value]) => `--${kebab(name)}: ${value};`);
  lines.push(...Object.entries(FONTS).map(([name, value]) => `--font-${name}: ${value};`));
  lines.push(...Object.entries(RADIUS).map(([name, value]) => `--radius-${name}: ${value};`));
  return `:root {\n  ${lines.join("\n  ")}\n}`;
}
