import { ArrowRight } from "./icons.js";

const COPY = {
  "pt-BR": {
    eyebrow: "Tokens de ações dos EUA · com Pix",
    title: "Seu dinheiro merece",
    accent: "taxas justas.",
    lede: "Comece com R$ 100 e pague com Pix. Todos os custos claros antes de pagar.",
    monthly: "Sem mensalidade",
    extra: "Sem taxa extra da fatia.",
    action: "Simular minha compra",
    reassurance: "Simule sem cadastro. Veja o custo total.",
    rights: "Você compra um token que acompanha a ação.",
    learn: "Como funciona?"
  },
  en: {
    eyebrow: "US Stock Tokens · USDC on Base",
    title: "Your money deserves",
    accent: "fair fees.",
    lede: "Start with 10 USDC on Base. See every cost before you pay.",
    monthly: "No monthly fee",
    extra: "No extra fatia. fee",
    action: "Preview your purchase",
    reassurance: "No sign-up to preview. See the total cost.",
    rights: "You receive a Stock Token that tracks a share, not the share itself."
  }
};

export function FairFeesHero({ locale = "pt-BR", previewId, contained = false, onLearn, availabilityNotice }) {
  const copy = COPY[locale];
  const base = import.meta.env.BASE_URL;
  const preview = () => {
    const target = document.getElementById(previewId);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    target?.querySelector("select, input")?.focus({ preventScroll: true });
  };
  return (
    <section className={`fair-hero ${contained ? "fair-hero--contained" : "wrap"}`} aria-labelledby="hero-title">
      <div className="fair-hero__media">
        <img src={`${base}images/fair-fees-cafe-800.jpg`}
          srcSet={`${base}images/fair-fees-cafe-800.jpg 800w, ${base}images/fair-fees-cafe-1440.jpg 1440w`}
          sizes="(min-width: 1024px) 580px, 100vw" width="1440" height="810"
          alt="" fetchPriority="high" decoding="async" />
      </div>
      <div className="fair-hero__body">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="fair-hero__title" id="hero-title">{copy.title} <span className="accent">{copy.accent}</span></h1>
        <p className="fair-hero__lede">{copy.lede}</p>
        <ul className="fair-hero__fees" aria-label={locale === "en" ? "fatia. fees" : "Taxas da fatia."}>
          <li>{copy.monthly}</li><li>{copy.extra}</li>
        </ul>
        <button className="btn btn--primary btn--lg fair-hero__action" type="button" onClick={preview} aria-controls={previewId}>
          {copy.action}<ArrowRight size={20} weight="bold" aria-hidden="true" />
        </button>
        {availabilityNotice && <p className="hero__soon" role="status">{availabilityNotice}</p>}
        <p className="fair-hero__reassurance">{copy.reassurance}</p>
        <div className="fair-hero__rights"><p>{copy.rights}</p>{onLearn && <button className="link link-button" type="button" onClick={onLearn}>{copy.learn}</button>}</div>
      </div>
    </section>
  );
}
