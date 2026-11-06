// History (#/historico): the device's finished operations for this wallet, merged with the
// Vortex server history when this tab already has a verified Vortex session (never prompts).
import { ArrowRight, Clock, Receipt } from "../components/icons.js";
import { CONSUMER_SIGN_IN } from "@vortexfi/consumer-kit";
import { ActivityRow } from "../components/ActivityRow.jsx";
import { Notice } from "../components/ui.jsx";
import { exploreHash } from "../lib/routes.js";

export function History({ auth, rows, loading, pending, onResume, onLogin, serverNote, simulated }) {
  if (!auth.authenticated) {
    return (
      <main id="conteudo" tabIndex={-1} className="wrap page">
        <div className="card gate">
          <div className="empty">
            <span className="empty__icon"><Receipt size={26} aria-hidden="true" /></span>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Entre para ver seu histórico</h1>
            <p>Suas compras e vendas aparecem aqui. É o mesmo acesso do ouro.</p>
            <button className="btn btn--primary btn--lg" type="button" onClick={onLogin}>{CONSUMER_SIGN_IN.button}</button>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main id="conteudo" tabIndex={-1} className="wrap page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Histórico</h1>
          <p className="page__lede">Compras e vendas desta carteira{simulated ? " (operações simuladas ficam só nesta aba)" : ""}.</p>
        </div>
      </div>
      <div className="banner-row">
        {pending && (
          <button className="resume-banner" type="button" onClick={onResume}>
            <Clock size={22} aria-hidden="true" />
            <span><b>Operação em andamento</b><small>{pending.rampType === "SELL" ? "Venda" : "Compra"}{pending.symbol ? ` de ${pending.symbol}` : ""}{pending.simulated ? " (simulação)" : ""} · toque para acompanhar</small></span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
        {serverNote && <Notice tone="neutral">Mostrando as operações deste aparelho. O histórico completo aparece depois que você confirmar seu e-mail com o código, na próxima compra ou venda.</Notice>}
      </div>
      <section className="card" aria-label="Operações">
        {loading && <div className="empty"><span className="spinner" aria-hidden="true" /><p>Carregando…</p></div>}
        {!loading && rows.length === 0 && (
          <div className="empty">
            <span className="empty__icon"><Receipt size={26} aria-hidden="true" /></span>
            <h3>Nenhuma movimentação ainda</h3>
            <p>Quando você comprar ou vender, a operação aparece aqui com valor, data e status.</p>
            <a className="btn btn--primary" href={exploreHash()}>Explorar empresas <ArrowRight size={18} weight="bold" aria-hidden="true" /></a>
          </div>
        )}
        {!loading && rows.length > 0 && <div style={{ padding: "6px 0" }}>{rows.map((row) => <ActivityRow key={row.id} row={row} />)}</div>}
      </section>
    </main>
  );
}
