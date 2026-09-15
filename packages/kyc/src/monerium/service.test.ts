import { describe, expect, it } from "bun:test";
import { createMoneriumKycApi, type MoneriumKycApiClient } from "./service";
import { MoneriumAuthorizationRequiredError } from "./types";

function client(status?: number) {
  const calls: Array<{ method: string; url: string; data?: unknown; params?: unknown }> = [];
  const apiClient: MoneriumKycApiClient = {
    async get<T>(url: string, config?: { params?: Record<string, unknown> }): Promise<T> {
      calls.push({ method: "get", params: config?.params, url });
      if (status) throw { status };
      return { status: "APPROVED" } as T;
    },
    async post<T>(url: string, data?: unknown): Promise<T> {
      calls.push({ data, method: "post", url });
      return { ok: true } as T;
    }
  };
  return { api: createMoneriumKycApi(apiClient), calls };
}

describe("createMoneriumKycApi", () => {
  it("names the OAuth client only when one is given", async () => {
    const { api, calls } = client();
    await api.startOAuth("individual");
    await api.startOAuth("business", "widget");
    expect(calls).toEqual([
      { data: { customerType: "individual" }, method: "post", url: "/monerium/oauth/start" },
      { data: { client: "widget", customerType: "business" }, method: "post", url: "/monerium/oauth/start" }
    ]);
  });

  it("posts wallet links and IBAN moves to the readiness routes", async () => {
    const { api, calls } = client();
    await api.linkWallet({ address: "0xabc", chain: "polygon", signature: "0xsig" });
    await api.moveIban({ address: "0xabc", chain: "polygon" });
    expect(calls.map(call => call.url)).toEqual(["/monerium/wallet", "/monerium/iban/move"]);
    expect(calls[0]?.data).toEqual({ address: "0xabc", chain: "polygon", signature: "0xsig" });
  });

  it.each([401, 404])("maps a %i status read to authorization required", async status => {
    const { api } = client(status);
    await expect(api.getStatus("individual")).rejects.toBeInstanceOf(MoneriumAuthorizationRequiredError);
  });
});
