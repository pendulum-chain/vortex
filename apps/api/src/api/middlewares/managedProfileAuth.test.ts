import { afterEach, describe, expect, it, mock } from "bun:test";
import CustomerEntity from "../../models/customerEntity.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import User from "../../models/user.model";
import { authorizeManagedProfile, type ManagedProfileContext } from "./managedProfileAuth";

const MANAGER_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";

function response() {
  const res = {
    body: undefined as unknown,
    statusCode: 200,
    json: mock((body: unknown) => {
      res.body = body;
      return res;
    }),
    status: mock((statusCode: number) => {
      res.statusCode = statusCode;
      return res;
    })
  };
  return res;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    get: (name: string) => (name === "X-Managed-Profile-Id" ? CHILD_ID : undefined),
    userId: MANAGER_ID,
    ...overrides
  };
}

describe("authorizeManagedProfile", () => {
  const originalManagerFindByPk = ManagedProfileManager.findByPk;
  const originalRelationshipFindOne = ManagedProfile.findOne;
  const originalUserFindByPk = User.findByPk;
  const originalEntityFindAll = CustomerEntity.findAll;

  afterEach(() => {
    ManagedProfileManager.findByPk = originalManagerFindByPk;
    ManagedProfile.findOne = originalRelationshipFindOne;
    User.findByPk = originalUserFindByPk;
    CustomerEntity.findAll = originalEntityFindAll;
  });

  function allowManagedProfile() {
    ManagedProfileManager.findByPk = mock(async () => ({ allowedCorridors: ["BR"], isActive: true })) as never;
    ManagedProfile.findOne = mock(async () => ({ id: "relationship-1" })) as never;
    User.findByPk = mock(async () => ({ activeCustomerEntityId: "entity-1", kind: "managed" })) as never;
    CustomerEntity.findAll = mock(async () => [{ id: "entity-1", status: "active" }]) as never;
  }

  it("does nothing when the managed profile header is absent", async () => {
    const next = mock(() => {});
    await authorizeManagedProfile()(request({ get: () => undefined }) as never, response() as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ManagedProfile.findOne).toBe(originalRelationshipFindOne);
  });

  it("rejects an invalid managed profile id", async () => {
    const res = response();
    const next = mock(() => {});
    await authorizeManagedProfile()(request({ get: () => "not-a-uuid" }) as never, res as never, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("requires an authenticated manager actor", async () => {
    const res = response();
    const next = mock(() => {});
    await authorizeManagedProfile()(request({ userId: undefined }) as never, res as never, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not treat a public API credential as manager authentication", async () => {
    const res = response();
    const next = mock(() => {});
    await authorizeManagedProfile()(
      request({
        credential: {
          credentialId: "credential-1",
          environment: "test",
          partnerId: null,
          profileId: MANAGER_ID,
          strength: "public"
        },
        userId: undefined
      }) as never,
      res as never,
      next
    );
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a manager profile explicitly authenticated by secret-credential middleware", async () => {
    allowManagedProfile();
    const req = request({ authenticatedCredentialProfileId: MANAGER_ID, userId: undefined });
    const next = mock(() => {});
    await authorizeManagedProfile()(req as never, response() as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("derives an immutable actor and child context for a direct active relationship", async () => {
    allowManagedProfile();
    const req = request() as ReturnType<typeof request> & { managedProfileContext?: ManagedProfileContext };
    const next = mock(() => {});
    await authorizeManagedProfile({ corridor: "BR" })(req as never, response() as never, next);
    expect(req).toMatchObject({
      managedProfileContext: {
        actorProfileId: MANAGER_ID,
        customerEntityId: "entity-1",
        managedProfileId: "relationship-1",
        subjectProfileId: CHILD_ID
      },
      userId: MANAGER_ID
    });
    expect(Object.isFrozen(req.managedProfileContext)).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects a child that is not directly managed by the authenticated actor", async () => {
    allowManagedProfile();
    ManagedProfile.findOne = mock(async () => null) as never;
    const res = response();
    const next = mock(() => {});
    await authorizeManagedProfile()(request() as never, res as never, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an inactive manager", async () => {
    allowManagedProfile();
    ManagedProfileManager.findByPk = mock(async () => ({ allowedCorridors: ["BR"], isActive: false })) as never;
    const res = response();
    await authorizeManagedProfile()(request() as never, res as never, mock(() => {}));
    expect(res.statusCode).toBe(403);
  });

  it("rejects a corridor that is not enabled for the manager", async () => {
    allowManagedProfile();
    const res = response();
    await authorizeManagedProfile({ corridor: "MX" })(request() as never, res as never, mock(() => {}));
    expect(res.statusCode).toBe(403);
  });

  it("rejects a managed child with additional customer entities", async () => {
    allowManagedProfile();
    CustomerEntity.findAll = mock(async () => [
      { id: "entity-1", status: "active" },
      { id: "entity-2", status: "archived" }
    ]) as never;
    const res = response();
    await authorizeManagedProfile()(request() as never, res as never, mock(() => {}));
    expect(res.statusCode).toBe(403);
  });
});
