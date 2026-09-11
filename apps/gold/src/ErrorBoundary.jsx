import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error("ouro. UI error", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fatal-error">
        <span>ouro<span className="gold-period">.</span></span>
        <h1>Algo não saiu como esperado.</h1>
        <p>Nenhuma movimentação foi confirmada nesta tela. Atualize para tentar novamente.</p>
        <button type="button" onClick={() => window.location.reload()}>Atualizar com segurança</button>
      </main>
    );
  }
}
