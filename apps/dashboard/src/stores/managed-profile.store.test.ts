import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  }
});
let accountStateClears = 0;
let identityChangeAllowed = true;
let activatedOwner: string | null = null;

const { AuthService } = await import("@/services/auth");
const { applyStoredManagedProfileForTests, clearManagedProfile, clearManagedProfileSelection, selectManagedProfile } =
  await import("./managed-profile.store");
function configureIdentityEffects(): void {
  AuthService.configureIdentityTransitionEffects({
    activateTransferOwner: (ownerProfileId: string) => {
      activatedOwner = ownerProfileId;
      return true;
    },
    canChangeEffectiveIdentity: () => identityChangeAllowed,
    clearAccountState: () => {
      accountStateClears += 1;
    }
  });
}

beforeEach(() => {
  configureIdentityEffects();
  values.clear();
  identityChangeAllowed = true;
  AuthService.initializeAcceptedIdentitySnapshots();
  applyStoredManagedProfileForTests();
  accountStateClears = 0;
  activatedOwner = null;
  AuthService.storeTokens({ accessToken: "manager-token", refreshToken: "refresh", userId: "manager-1" });
});

after(() => {
  AuthService.configureIdentityTransitionEffects();
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("managed profile transitions", () => {
  it("atomically binds selection to the current bearer and activates its transfer owner", () => {
    assert.equal(
      selectManagedProfile({
        customerType: "business",
        externalSubjectId: "merchant-42",
        targetEmail: "child@example.com",
        targetProfileId: "child-1"
      }),
      true
    );

    assert.equal(AuthService.getManagedProfileSelection()?.managerProfileId, "manager-1");
    assert.equal(accountStateClears, 1);
    assert.equal(activatedOwner, "child-1");
  });

  it("guards before mutating selection", () => {
    identityChangeAllowed = false;

    assert.equal(
      selectManagedProfile({
        customerType: "business",
        externalSubjectId: "merchant-42",
        targetEmail: "child@example.com",
        targetProfileId: "child-1"
      }),
      false
    );
    assert.equal(AuthService.getManagedProfileSelection(), null);
    assert.equal(accountStateClears, 0);
  });

  it("adopts a cross-tab selection once and switches the transfer owner", () => {
    const selection = {
      customerType: "individual",
      externalSubjectId: "person-42",
      managerProfileId: "manager-1",
      targetEmail: "child@example.com",
      targetProfileId: "child-2"
    };
    values.set(AuthService.MANAGED_PROFILE_STORAGE_KEY, JSON.stringify(selection));

    applyStoredManagedProfileForTests();

    assert.deepEqual(AuthService.getManagedProfileSelection(), selection);
    assert.equal(accountStateClears, 1);
    assert.equal(activatedOwner, "child-2");
  });

  it("restores the accepted selection when a cross-tab change is blocked", () => {
    selectManagedProfile({
      customerType: "business",
      externalSubjectId: "merchant-1",
      targetEmail: "first@example.com",
      targetProfileId: "child-1"
    });
    accountStateClears = 0;
    identityChangeAllowed = false;
    const rejected = {
      customerType: "business",
      externalSubjectId: "merchant-2",
      managerProfileId: "manager-1",
      targetEmail: "second@example.com",
      targetProfileId: "child-2"
    };
    values.set(AuthService.MANAGED_PROFILE_STORAGE_KEY, JSON.stringify(rejected));

    applyStoredManagedProfileForTests();

    assert.equal(AuthService.getManagedProfileSelection()?.targetProfileId, "child-1");
    assert.equal(
      AuthService.parseManagedProfileSelectionSnapshot(values.get(AuthService.MANAGED_PROFILE_STORAGE_KEY) ?? null)
        ?.targetProfileId,
      "child-1"
    );
    assert.equal(accountStateClears, 0);
  });

  it("returns to the bearer identity when child mode stops", () => {
    selectManagedProfile({
      customerType: "business",
      externalSubjectId: "merchant-42",
      targetEmail: "child@example.com",
      targetProfileId: "child-1"
    });
    accountStateClears = 0;

    assert.equal(clearManagedProfile(), true);

    assert.equal(AuthService.getManagedProfileSelection(), null);
    assert.equal(accountStateClears, 1);
    assert.equal(activatedOwner, "manager-1");
  });

  it("compare-and-clears the expected denied selection", () => {
    selectManagedProfile({
      customerType: "business",
      externalSubjectId: "merchant-42",
      targetEmail: "child@example.com",
      targetProfileId: "child-1"
    });
    const selectionSnapshot = AuthService.getAcceptedManagedProfileSelectionSnapshot();
    accountStateClears = 0;

    assert.equal(clearManagedProfileSelection(selectionSnapshot ?? undefined), true);

    assert.equal(AuthService.getManagedProfileSelection(), null);
    assert.equal(accountStateClears, 1);
    assert.equal(activatedOwner, "manager-1");
  });

  it("keeps the accepted child identity when clearing a denied selection is blocked", () => {
    selectManagedProfile({
      customerType: "business",
      externalSubjectId: "merchant-42",
      targetEmail: "child@example.com",
      targetProfileId: "child-1"
    });
    const selectionSnapshot = AuthService.getAcceptedManagedProfileSelectionSnapshot();
    accountStateClears = 0;
    activatedOwner = null;
    identityChangeAllowed = false;

    assert.equal(clearManagedProfileSelection(selectionSnapshot ?? undefined), false);

    assert.equal(AuthService.getManagedProfileSelection()?.targetProfileId, "child-1");
    assert.equal(AuthService.getEffectiveProfileId(), "child-1");
    assert.equal(accountStateClears, 0);
    assert.equal(activatedOwner, null);
  });
});
