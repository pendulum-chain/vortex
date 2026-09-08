import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeLoginReturnTo } from "./login-return";

describe("membership invitation login return", () => {
  const path = "/member-invitations/12345678-1234-1234-1234-123456789abc";
  it("preserves only a local invitation UUID path", () => {
    assert.equal(safeLoginReturnTo(path), path);
    const uppercaseUuid = path.replace("789abc", "789ABC");
    assert.equal(safeLoginReturnTo(uppercaseUuid), uppercaseUuid);
  });
  it("rejects external, encoded, recursive, malformed, and extra URL components", () => {
    for (const value of [
      undefined,
      null,
      {},
      [path],
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/login",
      "/overview",
      `${path}?next=https://evil.test`,
      `${path}#secret`,
      `${path}/../login`,
      "/member-invitations/%2f%2fevil.test",
      `${path}\n`,
      "/member-invitations/not-a-uuid"
    ]) {
      assert.equal(safeLoginReturnTo(value), undefined, String(value));
    }
  });
});
