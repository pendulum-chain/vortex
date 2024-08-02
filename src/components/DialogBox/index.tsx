import { WalletIcon } from '@heroicons/react/20/solid';
import React from 'preact/compat';
import { FC } from 'preact/compat';

export const DialogBox: FC = () => (
  <section className="toast toast-end">
    <header>
      <h1>Action Required</h1>
    </header>
    <main>
      <WalletIcon className="icon" />
      <p>Please sign the transaction in your connected wallet to proceed</p>
    </main>
    <footer>Waiting for signature 1/4</footer>
  </section>
);
