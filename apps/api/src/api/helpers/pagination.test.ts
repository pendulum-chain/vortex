import { describe, expect, it } from "bun:test";
import { pageOf } from "./pagination";

describe("pageOf", () => {
  it("defaults, caps the page size and keeps a valid offset", () => {
    expect(pageOf({})).toEqual({ limit: 20, offset: 0 });
    expect(pageOf({ limit: "500", offset: "40" })).toEqual({ limit: 100, offset: 40 });
    expect(pageOf({ limit: "7" })).toEqual({ limit: 7, offset: 0 });
  });

  it("falls back to the defaults for invalid values", () => {
    for (const limit of ["0", "-3", "abc", "1.5"]) expect(pageOf({ limit }).limit).toBe(20);
    for (const offset of ["-1", "x", "2.5"]) expect(pageOf({ offset }).offset).toBe(0);
  });

  it("caps a huge offset instead of passing it to Postgres", () => {
    expect(pageOf({ offset: "1e21" }).offset).toBe(Number.MAX_SAFE_INTEGER);
    expect(pageOf({ offset: "10000000000000000000" }).offset).toBe(Number.MAX_SAFE_INTEGER);
  });
});
