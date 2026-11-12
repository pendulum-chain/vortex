// The landing remains usable while Privy loads. A terminal initialization error must release
// queued sign-in, rather than keeping a returning user on an endless loading state.
export function pendingAuth({ returning, queued, queue, error = null }) {
  return {
    kind: "privy", status: error ? "error" : "loading", error, ready: false, authenticated: false,
    returning: error ? false : returning, queued: error ? null : queued,
    user: null, address: null,
    login: async (method) => { if (!error) queue(method || "google"); },
    logout: async () => {}, getEthereumProvider: async () => null,
    switchChain: async () => { throw new Error("A carteira ainda está sendo preparada."); },
    getIdentityToken: () => null,
  };
}
