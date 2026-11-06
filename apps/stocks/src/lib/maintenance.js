import { createApi } from "@vortexfi/consumer-kit";
import { StocksRampError } from "./ramp-contract.js";

export const MAINTENANCE_ACTIVE_PT = "A Vortex está em manutenção. Aguarde para continuar; não faça um novo Pix agora.";

export function createMaintenanceReader({ apiBase, api } = {}) {
  let client = api;
  return async () => {
    try {
      client ??= createApi({ apiBase });
      const raw = await client("/v1/maintenance/status", { method: "GET" });
      if (raw?.is_maintenance_active === false) return { active: false, details: null };
      if (raw?.is_maintenance_active !== true || !raw.maintenance_details || !Number.isFinite(Date.parse(raw.maintenance_details.end_datetime))) throw new Error("Invalid maintenance status");
      return { active: true, details: raw.maintenance_details };
    } catch {
      throw new StocksRampError("MAINTENANCE_STATUS_UNAVAILABLE", "Não conseguimos verificar a disponibilidade da Vortex. Aguarde e tente novamente; não faça um novo Pix.");
    }
  };
}

export async function assertMaintenanceAvailable(readStatus) {
  const status = await readStatus();
  if (!status || typeof status.active !== "boolean") throw new StocksRampError("MAINTENANCE_STATUS_UNAVAILABLE", "Não conseguimos verificar a disponibilidade da Vortex. Tente novamente em alguns minutos.");
  if (status.active) throw new StocksRampError("MAINTENANCE_ACTIVE", MAINTENANCE_ACTIVE_PT);
  return status;
}
