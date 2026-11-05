// Top bar: wordmark, primary navigation, "Entrar com Vortex" or the account menu; plus the mobile
// tab bar for signed-in users. Cross-links to ouro. stay in the same tab (the Vortex code session
// is per tab).
import { useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, CaretDown, Check, ClockCounterClockwise, Copy, House, MagnifyingGlass, ShieldCheck, SignOut, Wallet } from "./icons.js";
import { CONSUMER_SIGN_IN } from "@vortexfi/consumer-kit";
import { BRAND, FAMILY_LINKS } from "../brand.js";
import { initials, shortAddress } from "../format.js";
import { useCopy } from "../hooks.js";
import { exploreHash, historyHash, homeHash } from "../lib/routes.js";

const asset = (path) => `${import.meta.env.BASE_URL}${path}`;

export function Wordmark() {
  return (
    <a className="brand" href={homeHash()} aria-label={`${BRAND.lockupAlt}, início`}>
      <img src={asset(BRAND.assets.wordmark)} alt="" width="88" height="42" />
      <span className="brand__by" aria-hidden="true">{BRAND.endorsement}</span>
    </a>
  );
}

function AccountMenu({ auth, demo, onLogout, onResetDemo }) {
  const [open, setOpen] = useState(false);
  const [copied, copy] = useCopy();
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") { setOpen(false); root.current?.querySelector("button")?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const user = auth.user;
  return (
    <div className="account" ref={root}>
      <button className="avatar-button" type="button" aria-expanded={open} aria-haspopup="true" aria-label={user?.name ? `Sua conta: ${user.name}` : "Sua conta"} onClick={() => setOpen((value) => !value)}>
        <span className="avatar" aria-hidden="true">{initials(user?.name || user?.email)}</span>
        <CaretDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-menu">
          <div className="account-menu__who">
            {user?.name ? <><b>{user.name}</b><small>{user?.email}</small></> : <b>{user?.email}</b>}
            <span className="account-menu__label"><ShieldCheck size={16} weight="fill" aria-hidden="true" /> {CONSUMER_SIGN_IN.connected}</span>
          </div>
          <div className="account-menu__wallet">
            <div className="account-menu__wallet-row">
              <span><small>Sua carteira</small><span className="mono" title={auth.address || ""}>{shortAddress(auth.address)}</span></span>
              <button className="copy-button" type="button" onClick={() => copy(auth.address, "address")} disabled={!auth.address} aria-label="Copiar endereço da carteira">
                {copied === "address" ? <><Check size={16} aria-hidden="true" /> Copiado</> : <><Copy size={16} aria-hidden="true" /> Copiar</>}
              </button>
            </div>
            <small>Mesma carteira no ouro. · rede Robinhood Chain</small>
          </div>
          <a className="account-menu__item" href={FAMILY_LINKS.ouro.href}><Wallet size={20} aria-hidden="true" /> {FAMILY_LINKS.ouro.labelPt}</a>
          <a className="account-menu__item" href={historyHash()} onClick={() => setOpen(false)}><ClockCounterClockwise size={20} aria-hidden="true" /> Histórico</a>
          {demo && <button className="account-menu__item" type="button" onClick={() => { setOpen(false); onResetDemo(); }}><ArrowCounterClockwise size={20} aria-hidden="true" /> Reiniciar demonstração</button>}
          <hr />
          <button className="account-menu__item account-menu__item--danger" type="button" onClick={() => { setOpen(false); onLogout(); }}><SignOut size={20} aria-hidden="true" /> Sair (ouro. e fatia.)</button>
        </div>
      )}
    </div>
  );
}

function SignIn({ auth, onLogin, pending }) {
  const opening = auth.status === "loading" && auth.returning && !auth.queued;
  const busy = Boolean(pending) || Boolean(auth.queued) || opening;
  return (
    <div className="signin">
      <span className="signin__helper">Google ou e-mail · sem nova senha</span>
      <button className="btn btn--secondary" type="button" onClick={() => onLogin()} disabled={busy} aria-busy={busy || undefined}>
        {busy ? <><span className="spinner" aria-hidden="true" /> {opening ? "Abrindo sua conta…" : "Entrando…"}</> : CONSUMER_SIGN_IN.button}
      </button>
    </div>
  );
}

export function AppHeader({ auth, route, demo, onLogin, onLogout, onResetDemo, pendingLogin }) {
  const signedIn = auth.authenticated;
  const current = (name) => (route.name === name ? "page" : undefined);
  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <Wordmark />
        <nav className="site-nav" aria-label="Principal">
          <a href={homeHash()} aria-current={current("home")}>Início</a>
          <a href={exploreHash()} aria-current={current("explore")}>Explorar</a>
          {signedIn && <a href={historyHash()} aria-current={current("history")}>Histórico</a>}
        </nav>
        <div className="site-header__right">
          <a className="link locale-switch" href="/en/stocks/">English · USDC</a>
          {signedIn ? (
            <>
              <span className="secure-pill"><ShieldCheck size={17} weight="fill" aria-hidden="true" /> Protegido</span>
              <AccountMenu auth={auth} demo={demo} onLogout={onLogout} onResetDemo={onResetDemo} />
            </>
          ) : (
            <>
              <a className="header-explore" href={exploreHash()}>Explorar</a>
              <SignIn auth={auth} onLogin={onLogin} pending={pendingLogin} />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Phones, signed in: Início / Explorar / Histórico at thumb reach. */
export function TabBar({ route }) {
  const current = (name) => (route.name === name ? "page" : undefined);
  return (
    <nav className="tabbar" aria-label="Navegação">
      <a href={homeHash()} aria-current={current("home")}><House size={24} weight={route.name === "home" ? "fill" : "regular"} aria-hidden="true" />Início</a>
      <a href={exploreHash()} aria-current={current("explore")}><MagnifyingGlass size={24} weight={route.name === "explore" ? "bold" : "regular"} aria-hidden="true" />Explorar</a>
      <a href={historyHash()} aria-current={current("history")}><ClockCounterClockwise size={24} weight={route.name === "history" ? "bold" : "regular"} aria-hidden="true" />Histórico</a>
    </nav>
  );
}
