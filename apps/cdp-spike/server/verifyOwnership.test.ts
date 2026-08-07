import { describe, expect, it } from "bun:test";
import { verifyCdpOwnership } from "./verifyOwnership";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function fetchSequence(responses: Response[]): typeof fetch {
  return (async () => {
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch");
    return next;
  }) as unknown as typeof fetch;
}

describe("CDP ownership verification", () => {
  it("accepts only when Vortex subject, CDP JWT subject, and address agree", async () => {
    const evidence = await verifyCdpOwnership(
      {
        accessToken: "supabase-token",
        address: ADDRESS,
        cdpProjectId: "project-id",
        cdpUserId: "cdp-user-1",
        vortexApiUrl: "https://api.example"
      },
      fetchSequence([
        response({ user_id: "supabase-user-1", valid: true }),
        response({
          authenticationMethods: [{ kid: "key-1", sub: "supabase-user-1", type: "jwt" }],
          evmAccountObjects: [{ address: ADDRESS }],
          userId: "cdp-user-1"
        })
      ])
    );

    expect(evidence).toEqual({
      address: ADDRESS,
      cdpUserId: "cdp-user-1",
      supabaseSubject: "supabase-user-1"
    });
  });

  it("rejects a CDP user bound to another Supabase subject", async () => {
    await expect(
      verifyCdpOwnership(
        {
          accessToken: "supabase-token",
          address: ADDRESS,
          cdpProjectId: "project-id",
          cdpUserId: "cdp-user-2",
          vortexApiUrl: "https://api.example"
        },
        fetchSequence([
          response({ user_id: "supabase-user-1", valid: true }),
          response({
            authenticationMethods: [{ kid: "key-1", sub: "supabase-user-2", type: "jwt" }],
            evmAccountObjects: [{ address: ADDRESS }],
            userId: "cdp-user-2"
          })
        ])
      )
    ).rejects.toThrow("not bound to the authenticated Supabase subject");
  });

  it("rejects an address not returned for the authenticated CDP user", async () => {
    await expect(
      verifyCdpOwnership(
        {
          accessToken: "supabase-token",
          address: ADDRESS,
          cdpProjectId: "project-id",
          cdpUserId: "cdp-user-1",
          vortexApiUrl: "https://api.example"
        },
        fetchSequence([
          response({ user_id: "supabase-user-1", valid: true }),
          response({
            authenticationMethods: [{ kid: "key-1", sub: "supabase-user-1", type: "jwt" }],
            evmAccountObjects: [{ address: OTHER_ADDRESS }],
            userId: "cdp-user-1"
          })
        ])
      )
    ).rejects.toThrow("does not own the requested EVM account");
  });

  it("fails closed when CDP refuses a cross-user lookup", async () => {
    await expect(
      verifyCdpOwnership(
        {
          accessToken: "supabase-token",
          address: ADDRESS,
          cdpProjectId: "project-id",
          cdpUserId: "another-users-id",
          vortexApiUrl: "https://api.example"
        },
        fetchSequence([response({ user_id: "supabase-user-1", valid: true }), response({}, 403)])
      )
    ).rejects.toThrow("CDP rejected the ownership lookup (403)");
  });
});
