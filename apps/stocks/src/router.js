// ~30-line hash router: no router dependency.
import { useCallback, useEffect, useState } from "react";
import { parseHash } from "./lib/routes.js";

const currentHash = () => (typeof window === "undefined" ? "#/" : window.location.hash || "#/");

/** navigate("#/acao/NVDA"); {replace:true} keeps the history entry (search typing). */
export function navigate(hash, { replace = false } = {}) {
  if (hash === currentHash()) return;
  if (replace) {
    window.history.replaceState(window.history.state, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = hash;
  }
}

export function useHashRoute() {
  const [hash, setHash] = useState(currentHash);
  useEffect(() => {
    const onChange = () => setHash(currentHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = useCallback((next, options) => navigate(next, options), []);
  return [parseHash(hash), go, hash];
}
