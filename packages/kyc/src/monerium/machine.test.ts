import { describe, expect, it } from "bun:test";
import { createActor, waitFor } from "xstate";
import type { MoneriumKycApi } from "./api";
import { createMoneriumKycMachine } from "./machine";
import { MoneriumAuthorizationRequiredError, type MoneriumStatusResponse } from "./types";

const approved: MoneriumStatusResponse = {
  customerType: "individual",
  profileId: "profile-1",
  status: "APPROVED",
  statusExternal: "approved"
};

function machineWith(api: MoneriumKycApi, openAuthorizationUrl = (_url: string) => undefined) {
  return createMoneriumKycMachine({ api, openAuthorizationUrl });
}

describe("moneriumKycMachine", () => {
  it("resumes an approved profile", async () => {
    const machine = machineWith({
      completeOAuth: async () => approved,
      getStatus: async () => approved,
      startOAuth: async () => ({ authorizationUrl: "https://example.com/auth" })
    });
    const actor = createActor(machine, { input: { customerType: "individual" } }).start();

    await waitFor(actor, snapshot => snapshot.matches("Approved"));
    expect(actor.getSnapshot().context.profileId).toBe("profile-1");
  });

  it("starts authorization when no backend credentials exist", async () => {
    let openedUrl: string | undefined;
    const machine = machineWith(
      {
        completeOAuth: async () => approved,
        getStatus: async () => {
          throw new MoneriumAuthorizationRequiredError();
        },
        startOAuth: async customerType => ({ authorizationUrl: `https://example.com/auth?type=${customerType}` })
      },
      url => {
        openedUrl = url;
      }
    );
    const actor = createActor(machine, { input: { customerType: "business" } }).start();
    await waitFor(actor, snapshot => snapshot.matches("Ready"));

    actor.send({ type: "START_OAUTH" });
    await waitFor(actor, snapshot => snapshot.matches("Redirecting"));
    expect(openedUrl).toBe("https://example.com/auth?type=business");
  });

  it("completes an OAuth callback before checking status", async () => {
    let completedWith: { code: string; state: string } | undefined;
    const machine = machineWith({
      completeOAuth: async (code, state) => {
        completedWith = { code, state };
        return { ...approved, status: "PENDING", statusExternal: "pending" };
      },
      getStatus: async () => {
        throw new Error("should not run");
      },
      startOAuth: async () => ({ authorizationUrl: "https://example.com/auth" })
    });
    const actor = createActor(machine, {
      input: { callback: { code: "code-1", state: "state-1" }, customerType: "individual" }
    }).start();

    await waitFor(actor, snapshot => snapshot.matches("InReview"));
    expect(completedWith).toEqual({ code: "code-1", state: "state-1" });
  });

  it("surfaces a provider callback error without calling the API", async () => {
    const machine = machineWith({} as MoneriumKycApi);
    const actor = createActor(machine, {
      input: {
        callback: { error: "access_denied", errorDescription: "The user declined access" },
        customerType: "individual"
      }
    }).start();

    await waitFor(actor, snapshot => snapshot.matches("Failure"));
    expect(actor.getSnapshot().context.error?.message).toBe("The user declined access");
  });

  it("refreshes a pending profile to approved", async () => {
    let checks = 0;
    const machine = machineWith({
      completeOAuth: async () => approved,
      getStatus: async () => {
        checks += 1;
        return checks === 1 ? { ...approved, status: "PENDING", statusExternal: "pending" } : approved;
      },
      startOAuth: async () => ({ authorizationUrl: "https://example.com/auth" })
    });
    const actor = createActor(machine, { input: { customerType: "individual" } }).start();
    await waitFor(actor, snapshot => snapshot.matches("InReview"));

    actor.send({ type: "REFRESH" });
    await waitFor(actor, snapshot => snapshot.matches("Approved"));
  });

  it("routes an incomplete profile back to authorization", async () => {
    const machine = machineWith({
      completeOAuth: async () => approved,
      getStatus: async () => ({ ...approved, status: "PENDING", statusExternal: "incomplete" }),
      startOAuth: async () => ({ authorizationUrl: "https://example.com/auth" })
    });
    const actor = createActor(machine, { input: { customerType: "individual" } }).start();

    await waitFor(actor, snapshot => snapshot.matches("Ready"));
  });
});
