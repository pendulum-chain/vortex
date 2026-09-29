import { isValidCnpj, isValidCpf, normalizeTaxId } from "@vortexfi/shared";
import type { Request, RequestHandler, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { hashTaxReference } from "../services/avenia/avenia-customer.service";
import { getEffectiveUserId } from "./effectiveUser";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_FOREIGN_TAX_IDS = 5;
const SWEEP_ABOVE_PRINCIPALS = 10_000;

// Only an answer about another profile's tax id leaks anything or blocks its owner: the lookups
// answer 403 for it, createSubaccount 409. Own tax ids (200) and unknown ones (404, which is also
// the "create it first" signal for a new customer) never count, so a partner serving many
// customers from one profile is not limited.
function answeredForeignTaxId(req: Request, res: Response): boolean {
  return (
    res.statusCode === httpStatus.FORBIDDEN ||
    (res.statusCode === httpStatus.CONFLICT && req.method === "POST" && req.path === "/createSubaccount")
  );
}

/**
 * Limits how many DISTINCT tax ids owned by other profiles one principal may probe on the
 * tax-keyed /brl routes per window, to curb CPF existence enumeration (403 vs. 404) and squatting
 * probes (409). After that many hits the principal gets 429 for any new tax id until the oldest
 * hit ages out. Only checksum-valid CPF/CNPJ are considered.
 *
 * The principal is the effective user (the managed child for delegated calls), else the client IP.
 * ponytail: state is per API instance and in memory, so the effective cap is 5 x instances and
 * resets on deploy; move it to the database if abuse persists.
 */
export function createDistinctTaxIdLimiter(): RequestHandler {
  // principal -> (hash of another profile's tax id it probed -> when)
  const foreignHits = new Map<string, Map<string, number>>();

  const dropExpired = (hits: Map<string, number>, now: number) => {
    for (const [taxIdHash, at] of hits) if (now - at >= WINDOW_MS) hits.delete(taxIdHash);
  };

  return (req, res, next) => {
    // Read the same place the controllers do: the POST routes use the body, the read routes (GET,
    // and the HEAD Express routes to them) the query. A body on a GET must not shadow the query.
    const raw: unknown = req.method === "POST" ? req.body?.taxId : req.query?.taxId;
    const taxId = typeof raw === "string" ? normalizeTaxId(raw) : "";
    if (!isValidCpf(taxId) && !isValidCnpj(taxId)) {
      next();
      return;
    }

    const principal = getEffectiveUserId(req) ?? `ip:${req.ip}`;
    const taxIdHash = hashTaxReference(taxId);
    const hits = foreignHits.get(principal);
    if (hits) dropExpired(hits, Date.now());
    if (hits && !hits.has(taxIdHash) && hits.size >= MAX_FOREIGN_TAX_IDS) {
      logger.warn("Foreign tax id probe limit reached", { principal });
      res.status(httpStatus.TOO_MANY_REQUESTS).json({ error: "Too many distinct tax IDs for this account. Try again later." });
      return;
    }

    res.on("finish", () => {
      if (!answeredForeignTaxId(req, res)) return;
      const now = Date.now();
      const entries = foreignHits.get(principal) ?? new Map<string, number>();
      entries.set(taxIdHash, now);
      foreignHits.set(principal, entries);
      if (foreignHits.size > SWEEP_ABOVE_PRINCIPALS) {
        for (const [key, stale] of foreignHits) {
          dropExpired(stale, now);
          if (stale.size === 0) foreignHits.delete(key);
        }
      }
    });
    next();
  };
}

export const limitDistinctTaxIds = createDistinctTaxIdLimiter();
