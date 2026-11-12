// Last line of defence: a render error never leaves a blank page or a half-drawn money screen.
import React from "react";
import { BRAND } from "./brand.js";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error(`${BRAND.name} UI error`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const english = this.props.locale === "en";
    return (
      <main className="fatal">
        <img src={`${import.meta.env.BASE_URL}${BRAND.assets.wordmark}`} alt={BRAND.name} width="100" height="48" />
        <h1>{english ? "Something did not go as expected." : "Algo não saiu como esperado."}</h1>
        <p>{english ? "Check your order status after reloading before attempting another payment." : "Nenhuma movimentação foi confirmada nesta tela. Atualize para tentar novamente."}</p>
        <button className="btn btn--primary btn--lg" type="button" onClick={() => window.location.reload()}>{english ? "Reload safely" : "Atualizar com segurança"}</button>
      </main>
    );
  }
}
