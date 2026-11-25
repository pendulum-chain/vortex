import { useEffect, useState } from "react";
import { formatUsdc } from "../lib/international.js";

export function BaseUsdcBalance({ api, owner, refreshKey }) {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    if (!owner || !api?.enabled || api.simulated !== false) return;
    let current = true, reading = false;
    async function refresh() {
      if (reading) return;
      reading = true;
      try {
        const raw = await api.refreshBalance(owner);
        if (current) setSnapshot({ owner, api, raw, failed: false });
      } catch {
        if (current) setSnapshot({ owner, api, raw: api.balanceRaw(owner), failed: true });
      } finally { reading = false; }
    }
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => { current = false; clearInterval(timer); };
  }, [owner, api, refreshKey]);

  const active = snapshot && snapshot.owner === owner && snapshot.api === api ? snapshot : null;
  const simulated = api?.simulated !== false;
  const raw = !owner || !api?.enabled ? null : simulated ? api.balanceRaw(owner) : active?.raw;
  const value = raw == null ? null : formatUsdc(Number(raw) / 1e6, 4);
  let label = value ?? "Checking balance…";
  if (active?.failed) label = value ? value + " (last confirmed, update unavailable)" : "Balance unavailable";
  if (!api?.enabled || !owner) label = "—";
  return <p className="hint">Available Base USDC: {label}</p>;
}
