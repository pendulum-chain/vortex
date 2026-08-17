import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

describe("API security-spec inventory", () => {
  it("keeps the route count and multipart upload inventory current", () => {
    const routeCount = readdirSync(import.meta.dir, { recursive: true }).filter(file =>
      String(file).endsWith(".route.ts")
    ).length;
    const spec = readFileSync(
      resolve(import.meta.dir, "../../../../../docs/security-spec/07-operations/api-surface.md"),
      "utf8"
    );

    expect(spec).toContain(`**Route structure:** ${routeCount} \`*.route.ts\` files`);
    for (const operation of [
      "POST /v1/alfredpay/submitKycFile",
      "submitKybFile",
      "submitKybRelatedPersonFile",
      "POST /v1/mykobo/profiles"
    ]) {
      expect(spec).toContain(operation);
    }
    expect(spec).toContain("5MB");
    expect(spec).toContain("10MB");
    expect(spec).toContain("do not currently configure a MIME/type `fileFilter`");
  });
});
