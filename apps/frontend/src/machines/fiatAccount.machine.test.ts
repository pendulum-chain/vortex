import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { fiatAccountMachine } from "./fiatAccount.machine";

function createFiatAccountActor() {
  const actor = createActor(fiatAccountMachine);
  actor.start();
  return actor;
}

function openedActor(country = "MX") {
  const actor = createFiatAccountActor();
  actor.send({ country, type: "OPEN" });
  return actor;
}

describe("fiatAccountMachine", () => {
  it("starts closed with an empty context", () => {
    const actor = createFiatAccountActor();

    expect(actor.getSnapshot().value).toBe("Closed");
    expect(actor.getSnapshot().context).toEqual({
      fiatRegistrationCountry: null,
      selectedAccountType: undefined,
      selectedFiatAccountId: null
    });
  });

  it("OPEN stores the country and shows the accounts list", () => {
    const actor = openedActor("CO");

    expect(actor.getSnapshot().value).toEqual({ Open: "AccountsList" });
    expect(actor.getSnapshot().context.fiatRegistrationCountry).toBe("CO");
  });

  it("selects an account while closed without opening the dialog", () => {
    const actor = createFiatAccountActor();

    actor.send({ id: "account-1", type: "SELECT_ACCOUNT" });

    expect(actor.getSnapshot().value).toBe("Closed");
    expect(actor.getSnapshot().context.selectedFiatAccountId).toBe("account-1");
  });

  it("selects an account from the accounts list", () => {
    const actor = openedActor();

    actor.send({ id: "account-2", type: "SELECT_ACCOUNT" });

    expect(actor.getSnapshot().value).toEqual({ Open: "AccountsList" });
    expect(actor.getSnapshot().context.selectedFiatAccountId).toBe("account-2");
  });

  it("GO_BACK from the accounts list closes the dialog and clears the country and selection", () => {
    const actor = openedActor();
    actor.send({ id: "account-1", type: "SELECT_ACCOUNT" });

    actor.send({ type: "GO_BACK" });

    expect(actor.getSnapshot().value).toBe("Closed");
    expect(actor.getSnapshot().context.fiatRegistrationCountry).toBeNull();
    expect(actor.getSnapshot().context.selectedFiatAccountId).toBeNull();
  });

  it("walks the registration flow: add new, pick a type, register, back to the list", () => {
    const actor = openedActor();

    actor.send({ type: "ADD_NEW" });
    expect(actor.getSnapshot().value).toEqual({ Open: "PickAccountType" });

    actor.send({ accountType: "SPEI", type: "SELECT_ACCOUNT_TYPE" });
    expect(actor.getSnapshot().value).toEqual({ Open: "RegisterAccount" });
    expect(actor.getSnapshot().context.selectedAccountType).toBe("SPEI");

    actor.send({ type: "REGISTER_DONE" });
    expect(actor.getSnapshot().value).toEqual({ Open: "AccountsList" });
    expect(actor.getSnapshot().context.selectedAccountType).toBeUndefined();
  });

  it("GO_BACK steps back through the registration flow one screen at a time", () => {
    const actor = openedActor();
    actor.send({ type: "ADD_NEW" });
    actor.send({ accountType: "WIRE", type: "SELECT_ACCOUNT_TYPE" });

    actor.send({ type: "GO_BACK" });
    expect(actor.getSnapshot().value).toEqual({ Open: "PickAccountType" });
    // Stepping back does not clear the previously picked type.
    expect(actor.getSnapshot().context.selectedAccountType).toBe("WIRE");

    actor.send({ type: "GO_BACK" });
    expect(actor.getSnapshot().value).toEqual({ Open: "AccountsList" });
  });
});
