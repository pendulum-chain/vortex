import { describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({ AuthService: {} }));

import { apiErrorMessage } from "./api-client";

describe("apiErrorMessage", () => {
  it("extracts the message from structured API errors", () => {
    expect(apiErrorMessage({ error: { code: "INVITE_EXPIRED", message: "Invite has expired", status: 410 } }, "Gone")).toBe(
      "Invite has expired"
    );
  });
});
