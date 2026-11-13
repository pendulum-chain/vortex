import { useId, useRef, useState } from "react";

const PHOTOS = [
  { name: "carousel-fair-fees", height: 960, position: "64% 50%", widePosition: "64% 12%" },
  { name: "carousel-access", height: 960, position: "63% 50%", widePosition: "63% 25%" },
  { name: "carousel-wallet", height: 960, position: "63% 50%", widePosition: "63% 25%" }
];
const COPY = {
  "pt-BR": {
    eyebrow: "Tokens de ações dos EUA",
    slides: [
      { title: "Seu dinheiro merece", accent: "taxas justas.", label: "Taxas justas" },
      { title: "Empresas que você conhece.", accent: "Acesso mais simples.", label: "Acesso simples" },
      { title: "Na sua carteira.", accent: "No seu controle.", label: "Sua carteira" }
    ],
    lede: "Comece com R$ 100 e pague com Pix. Veja todos os custos antes de pagar.",
    monthly: "Sem mensalidade",
    extra: "Sem taxa extra além da taxa Vortex",
    action: "Comprar com Pix",
    preview: "Ver custos da compra",
    soon: "Compra com Pix em breve",
    reassurance: "Confira a cotação antes de pagar.",
    rights: "Um Stock Token acompanha a ação, mas não é a ação.",
    learn: "Como funciona?",
    carousel: "Carrossel",
    navigation: "Escolha um destaque",
    track: "Destaques. Use as setas do teclado para mudar de destaque.",
    show: "Mostrar destaque"
  },
  en: {
    eyebrow: "US Stock Tokens",
    slides: [
      { title: "Your money deserves", accent: "fair fees.", label: "Fair fees" },
      { title: "Companies you know.", accent: "Simple access.", label: "Simple access" },
      { title: "In your wallet.", accent: "In your control.", label: "Your wallet" }
    ],
    lede: "Start with 10 USDC on Base. See every cost before you pay.",
    monthly: "No monthly fee",
    extra: "No extra fee beyond the Vortex fee",
    action: "Buy with USDC",
    preview: "See purchase costs",
    soon: "USDC purchases are coming soon",
    reassurance: "Review your quote before you pay.",
    rights: "A Stock Token tracks a share; it is not the share itself.",
    carousel: "Carousel",
    navigation: "Choose a highlight",
    track: "Highlights. Use the left and right arrow keys to change highlight.",
    show: "Show slide"
  }
};

// buyOpen follows rampOpenState: true promises the purchase, false shows "em breve", and null (not known yet,
// or a failed listing) promises neither.
export function FairFeesHero({ locale = "pt-BR", previewId, contained = false, onLearn, buyOpen = true }) {
  const copy = COPY[locale];
  const base = import.meta.env.BASE_URL;
  const id = useId();
  const track = useRef(null);
  const gesture = useRef(null);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const clamp = value => Math.max(0, Math.min(copy.slides.length - 1, value));
  const show = next => {
    const node = track.current;
    if (!node?.clientWidth) return;
    node.scrollTo({ left: clamp(next) * node.clientWidth, behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const pointerDown = event => {
    // Touch uses native scrolling, including vertical page scroll and pinch zoom.
    if (event.pointerType !== "mouse" || event.button !== 0 || event.isPrimary === false) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, moved: false };
  };
  const pointerMove = event => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.moved) {
      if (Math.abs(dy) > Math.max(8, Math.abs(dx))) { gesture.current = null; return; }
      if (Math.abs(dx) < 8) return;
      start.moved = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(true);
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = start.left - dx;
  };
  const pointerEnd = (event, cancelled = false) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    const node = event.currentTarget;
    if (start.moved && node.clientWidth) {
      const dx = event.clientX - start.x;
      const next = !cancelled && Math.abs(dx) >= Math.min(60, node.clientWidth / 5)
        ? Math.round(start.left / node.clientWidth) + (dx < 0 ? 1 : -1)
        : Math.round(node.scrollLeft / node.clientWidth);
      show(next);
    }
    if (node.hasPointerCapture?.(event.pointerId)) node.releasePointerCapture(event.pointerId);
  };
  const preview = () => {
    const target = document.getElementById(previewId);
    target?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    target?.querySelector("select, input")?.focus({ preventScroll: true });
  };
  return (
    <section className={`fair-hero ${contained ? "fair-hero--contained" : "wrap"}`} aria-labelledby="hero-title" aria-roledescription={copy.carousel}>
      <div className="fair-hero__media">
        <div className={`fair-hero__track${dragging ? " is-dragging" : ""}`} id={id} ref={track} tabIndex={0} role="group" aria-label={copy.track}
          onScroll={event => { const node = event.currentTarget; if (node.clientWidth) setIndex(clamp(Math.round(node.scrollLeft / node.clientWidth))); }}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => pointerEnd(event)}
          onPointerCancel={event => pointerEnd(event, true)} onLostPointerCapture={event => pointerEnd(event, true)}
          onPointerLeave={() => { if (!gesture.current?.moved) gesture.current = null; }}
          onKeyDown={event => {
            const next = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: copy.slides.length - 1 }[event.key];
            if (next !== undefined) { event.preventDefault(); show(next); }
          }}>
          {PHOTOS.map((photo, i) => <div className="fair-hero__slide" key={photo.name} aria-hidden={i !== index}>
            <img src={`${base}images/${photo.name}-800.jpg`} srcSet={`${base}images/${photo.name}-800.jpg 800w, ${base}images/${photo.name}-1440.jpg 1440w`}
              sizes="(min-width: 1280px) 1200px, 100vw" width="1440" height={photo.height} style={{ "--photo-position": photo.position, "--photo-position-wide": photo.widePosition }}
              alt="" draggable={false} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "low"} decoding="async" />
          </div>)}
        </div>
        <div className="fair-hero__caption" aria-live="polite" aria-atomic="true">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="fair-hero__title" id="hero-title">{copy.slides[index].title} <span className="accent">{copy.slides[index].accent}</span></h1>
        </div>
        <div className="fair-hero__pagination" role="group" aria-label={copy.navigation}>
          {copy.slides.map((slide, i) => <button key={slide.label} type="button" aria-label={`${copy.show} ${i + 1}: ${slide.label}`} aria-controls={id} aria-pressed={i === index} onClick={() => show(i)}><span aria-hidden="true" /></button>)}
        </div>
      </div>
      <div className="fair-hero__body">
        <p className="fair-hero__lede">{copy.lede}</p>
        <ul className="fair-hero__fees" aria-label={locale === "en" ? "fatia. fees" : "Taxas da fatia."}>
          <li>{copy.monthly}</li><li>{copy.extra}</li>
        </ul>
        <button className="btn btn--primary btn--lg fair-hero__action" type="button" onClick={preview} aria-controls={previewId}>{buyOpen === true ? copy.action : copy.preview}</button>
        {buyOpen === false && <p className="hero__soon" role="status">{copy.soon}</p>}
        <p className="fair-hero__reassurance">{copy.reassurance}</p>
        <div className="fair-hero__rights"><p>{copy.rights}</p>{onLearn && <button className="link link-button" type="button" onClick={onLearn}>{copy.learn}</button>}</div>
      </div>
    </section>
  );
}
