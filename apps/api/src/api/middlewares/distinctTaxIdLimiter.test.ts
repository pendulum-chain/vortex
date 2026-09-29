import { EventEmitter } from "node:events";
import { isValidCnpj, isValidCpf } from "@vortexfi/shared";
import { afterEach, describe, expect, it, mock, setSystemTime } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import brlaRoutes from "../routes/v1/brla.route";
import { createDistinctTaxIdLimiter, limitDistinctTaxIds } from "./distinctTaxIdLimiter";

// Synthetic identifiers with valid check digits (never real people or companies).
const CPFS = ["52998224725", "11144477735", "39053344705", "15350972057", "16899535009", "87435698032", "00783214090"];
const CNPJ = "11222333000181";
const { FORBIDDEN, CONFLICT, NOT_FOUND, OK, TOO_MANY_REQUESTS } = httpStatus;

// Runs the limiter; when it passes the request on, the "controller" answers with `answer`.
function call(
  limiter: ReturnType<typeof createDistinctTaxIdLimiter>,
  request: { body?: unknown; ip?: string; method?: string; path?: string; query?: unknown; userId?: string },
  answer: number = OK
) {
  const req = { ip: "203.0.113.7", method: "GET", path: "/getUser", ...request } as unknown as Request;
  const res = Object.assign(new EventEmitter(), { statusCode: 0, body: undefined as unknown }) as unknown as Response & {
    body?: unknown;
  };
  res.status = mock((code: number) => {
    res.statusCode = code;
    return res;
  }) as Response["status"];
  res.json = mock((payload: unknown) => {
    res.body = payload;
    return res;
  }) as Response["json"];
  const next = mock(() => {
    res.statusCode = answer;
    res.emit("finish");
  }) as unknown as NextFunction;
  limiter(req, res, next);
  return { limited: res.statusCode === TOO_MANY_REQUESTS, next, res };
}

const get = (taxId: unknown, userId = "user-1") => ({ method: "GET", query: { taxId }, userId });
const createSubaccount = (taxId: string, userId = "user-1") => ({
  body: { taxId },
  method: "POST",
  path: "/createSubaccount",
  query: {},
  userId
});
// Five distinct probes of other profiles' tax ids exhaust the budget.
const exhaust = (limiter: ReturnType<typeof createDistinctTaxIdLimiter>, userId = "user-1") => {
  for (const cpf of CPFS.slice(0, 5)) expect(call(limiter, get(cpf, userId), FORBIDDEN).limited).toBe(false);
};

afterEach(() => setSystemTime());

describe("distinctTaxIdLimiter", () => {
  it("uses only checksum-valid identifiers in this file", () => {
    expect(CPFS.every(isValidCpf)).toBe(true);
    expect(isValidCnpj(CNPJ)).toBe(true);
  });

  it("never limits a profile's own or unknown tax ids, however many", () => {
    const limiter = createDistinctTaxIdLimiter();
    // A partner serving many customers from one profile: each is new (404), then its own (200).
    for (let i = 0; i < 200; i++) {
      const cpf = CPFS[i % CPFS.length];
      expect(call(limiter, get(cpf), i < CPFS.length ? NOT_FOUND : OK).limited).toBe(false);
      expect(call(limiter, createSubaccount(cpf), OK).limited).toBe(false);
    }
  });

  it("rejects a sixth distinct tax id after five probes of other profiles' tax ids", () => {
    const limiter = createDistinctTaxIdLimiter();
    exhaust(limiter);

    const sixth = call(limiter, get(CPFS[5]));
    expect(sixth.limited).toBe(true);
    expect(sixth.next).not.toHaveBeenCalled();
    expect(sixth.res.body).toEqual({ error: "Too many distinct tax IDs for this account. Try again later." });
    // Repeating a tax id already probed reveals nothing new and still passes.
    expect(call(limiter, get(CPFS[0]), FORBIDDEN).limited).toBe(false);
  });

  it("counts a createSubaccount conflict but not a conflict on the lookups", () => {
    const limiter = createDistinctTaxIdLimiter();
    for (const cpf of CPFS.slice(0, 5)) call(limiter, { ...get(cpf), path: "/getKycStatus" }, CONFLICT);
    expect(call(limiter, get(CPFS[5])).limited).toBe(false);

    for (const cpf of CPFS.slice(0, 5)) call(limiter, createSubaccount(cpf), CONFLICT);
    expect(call(limiter, get(CPFS[5])).limited).toBe(true);
  });

  it("treats formatted and plain forms of one tax id as the same probe", () => {
    const limiter = createDistinctTaxIdLimiter();
    exhaust(limiter);

    expect(call(limiter, get("529.982.247-25"), FORBIDDEN).limited).toBe(false);
    expect(call(limiter, get("111.444.777-35"), FORBIDDEN).limited).toBe(false);
  });

  it("counts CNPJs and CPFs in the same budget", () => {
    const limiter = createDistinctTaxIdLimiter();
    for (const cpf of CPFS.slice(0, 4)) call(limiter, get(cpf), FORBIDDEN);
    call(limiter, get(CNPJ), FORBIDDEN);

    expect(call(limiter, get(CPFS[4])).limited).toBe(true);
  });

  it("keeps principals independent", () => {
    const limiter = createDistinctTaxIdLimiter();
    exhaust(limiter, "user-1");

    expect(call(limiter, get(CPFS[5], "user-1")).limited).toBe(true);
    expect(call(limiter, get(CPFS[5], "user-2")).limited).toBe(false);
  });

  it("falls back to the client IP for anonymous callers", () => {
    const limiter = createDistinctTaxIdLimiter();
    const anonymous = (taxId: string, ip: string) => ({ ...get(taxId), ip, userId: undefined });
    for (const cpf of CPFS.slice(0, 5)) call(limiter, anonymous(cpf, "203.0.113.1"), FORBIDDEN);

    expect(call(limiter, anonymous(CPFS[5], "203.0.113.1")).limited).toBe(true);
    expect(call(limiter, anonymous(CPFS[5], "203.0.113.2")).limited).toBe(false);
  });

  it("frees the budget once the window has passed", () => {
    const limiter = createDistinctTaxIdLimiter();
    const start = new Date("2026-01-01T00:00:00Z");
    setSystemTime(start);
    exhaust(limiter);
    expect(call(limiter, get(CPFS[5])).limited).toBe(true);

    setSystemTime(new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1));
    expect(call(limiter, get(CPFS[5])).limited).toBe(true);

    setSystemTime(new Date(start.getTime() + 24 * 60 * 60 * 1000));
    expect(call(limiter, get(CPFS[5])).limited).toBe(false);
  });

  it("ignores requests without a checksum-valid tax id", () => {
    const limiter = createDistinctTaxIdLimiter();
    const junk = ["abc", "", "12345678901", "52998224724", CPFS[0].slice(0, 10), undefined, null, 52998224725, [CPFS[1]]];
    for (const taxId of junk) {
      const { limited, next } = call(limiter, get(taxId), FORBIDDEN);
      expect(limited).toBe(false);
      expect(next).toHaveBeenCalledTimes(1);
    }

    // Junk did not consume any of the budget.
    exhaust(limiter);
    expect(call(limiter, get(CPFS[5])).limited).toBe(true);
  });

  it("reads the body on POST and the query on GET and HEAD", () => {
    const limiter = createDistinctTaxIdLimiter();
    for (const cpf of CPFS.slice(0, 5)) call(limiter, createSubaccount(cpf), CONFLICT);

    expect(call(limiter, createSubaccount(CPFS[5])).limited).toBe(true);
    expect(call(limiter, get(CPFS[5])).limited).toBe(true);
    expect(call(limiter, { ...get(CPFS[5]), method: "HEAD" }).limited).toBe(true);
  });

  it("cannot be bypassed by a body that shadows the query on a read route", () => {
    const limiter = createDistinctTaxIdLimiter();
    const shadowed = (taxId: string) => ({ body: { taxId: CPFS[0] }, method: "GET", query: { taxId }, userId: "user-1" });
    for (const cpf of CPFS.slice(0, 5)) call(limiter, shadowed(cpf), FORBIDDEN);

    expect(call(limiter, shadowed(CPFS[5])).limited).toBe(true);
  });
});

describe("brla routes", () => {
  it("run the limiter on every tax-keyed route", () => {
    const routes = [
      ["get", "/getUser"],
      ["get", "/getUserRemainingLimit"],
      ["get", "/getKycStatus"],
      ["get", "/getSelfieLivenessUrl"],
      ["post", "/createSubaccount"],
      ["post", "/getUploadUrls"]
    ] as const;
    const stack = (brlaRoutes as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> } }> })
      .stack;

    for (const [method, path] of routes) {
      const layer = stack.find(entry => entry.route?.path === path && entry.route.methods[method]);
      expect(layer?.route?.stack.some(handler => handler.handle === limitDistinctTaxIds)).toBe(true);
    }
  });
});
