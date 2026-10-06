import { describe, expect, it } from "bun:test";
import { UUID_PATTERN } from "./uuid";

describe("UUID_PATTERN", () => {
  it("accepts UUIDs in either case", () => {
    expect(UUID_PATTERN.test("d3ff0000-0000-4000-8000-000000000001")).toBe(true);
    expect(UUID_PATTERN.test("D3FF0000-0000-4000-8000-00000000000A")).toBe(true);
  });

  it.each(["", "not-a-uuid", "d3ff0000-0000-4000-8000-00000000000", "d3ff0000-0000-4000-8000-0000000000012", " d3ff0000-0000-4000-8000-000000000001"])(
    "rejects %p",
    value => {
      expect(UUID_PATTERN.test(value)).toBe(false);
    }
  );
});
