import { afterEach, describe, expect, it, mock } from "bun:test";
import { Op } from "sequelize";
import CustomerEntity from "../../models/customerEntity.model";
import ManagedProfile from "../../models/managedProfile.model";
import ManagedProfileManager from "../../models/managedProfileManager.model";
import ManagedProfileMembership from "../../models/managedProfileMembership.model";
import User from "../../models/user.model";
import type { CredentialContext } from "../services/apiCredential.service";
import {
  authorizeManagedProfile,
  ManagedProfileCapability,
  rejectDirectManagedCredential,
  type ManagedProfileContext
} from "./managedProfileAuth";

const MANAGER_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";

function response() {
  const res = {
    body: undefined as unknown,
    headersSent: false,
    locals: {} as Record<string, unknown>,
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
  const originalMembershipFindOne = ManagedProfileMembership.findOne;
  const originalMembershipCount = ManagedProfileMembership.count;
  const originalRelationshipFindOne = ManagedProfile.findOne;
  const originalUserFindByPk = User.findByPk;
  const originalEntityFindAll = CustomerEntity.findAll;

  afterEach(() => {
    ManagedProfileManager.findByPk = originalManagerFindByPk;
    ManagedProfileMembership.findOne = originalMembershipFindOne;
    ManagedProfileMembership.count = originalMembershipCount;
    ManagedProfile.findOne = originalRelationshipFindOne;
    User.findByPk = originalUserFindByPk;
    CustomerEntity.findAll = originalEntityFindAll;
  });

  function allowManagedProfile() {
    ManagedProfileManager.findByPk = mock(async () => ({
      allowedCorridors: ["BR"],
      allowedCustomerTypes: null,
      isActive: true
    })) as never;
    ManagedProfileMembership.findOne = mock(async () => ({ id: "membership-1", role: "manager" })) as never;
    ManagedProfile.findOne = mock(async () => ({
      id: "relationship-1", managerProfileId: OWNER_ID, createdAt: new Date("2026-01-01"), deletedAt: null
    })) as never;
    User.findByPk = mock(async () => ({ activeCustomerEntityId: "entity-1", kind: "managed" })) as never;
    CustomerEntity.findAll = mock(async () => [{ id: "entity-1", status: "active", type: "individual" }]) as never;
  }

  it("does nothing when the managed profile header is absent", async () => {
    const next = mock(() => {});
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(
      request({ get: () => undefined }) as never,
      response() as never,
      next
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(ManagedProfile.findOne).toBe(originalRelationshipFindOne);
  });

  it("rejects an invalid managed profile id", async () => {
    const res = response();
    const next = mock(() => {});
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(
      request({ get: () => "not-a-uuid" }) as never,
      res as never,
      next
    );
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("requires an authenticated manager actor", async () => {
    const res = response();
    const next = mock(() => {});
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(
      request({ userId: undefined }) as never,
      res as never,
      next
    );
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not treat a public API credential as manager authentication", async () => {
    const res = response();
    const next = mock(() => {});
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(
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
    const req = request({
      authenticatedCredentialProfileId: MANAGER_ID,
      credential: { profileId: MANAGER_ID, strength: "secret" },
      userId: undefined
    });
    const next = mock(() => {});
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(req as never, response() as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("derives an immutable actor and child context for a direct active relationship", async () => {
    allowManagedProfile();
    const req = request() as ReturnType<typeof request> & { managedProfileContext?: ManagedProfileContext };
    const next = mock(() => {});
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read, corridor: "BR" })(
      req as never,
      response() as never,
      next
    );
    expect(req).toMatchObject({
      managedProfileContext: {
        actorProfileId: MANAGER_ID,
        capability: ManagedProfileCapability.Read,
        controllingManagerProfileId: OWNER_ID,
        customerEntityId: "entity-1",
        managedProfileId: "relationship-1",
        membershipId: "membership-1",
        membershipRole: "manager",
        subjectProfileId: CHILD_ID
      },
      userId: MANAGER_ID
    });
    expect(Object.isFrozen(req.managedProfileContext)).toBe(true);
    expect(ManagedProfileMembership.findOne).toHaveBeenCalledWith({
      where: { ownerProfileId: OWNER_ID, memberProfileId: MANAGER_ID, revokedAt: null }
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("allows read-only members to read but not manage the selected child", async () => {
    allowManagedProfile();
    ManagedProfileMembership.findOne = mock(async () => ({ id: "membership-1", role: "read_only" })) as never;
    const readNext = mock(() => {});

    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(
      request() as never,
      response() as never,
      readNext
    );

    expect(readNext).toHaveBeenCalledTimes(1);
    const denied = response();
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Manage })(
      request() as never,
      denied as never,
      mock(() => {})
    );
    expect(denied.statusCode).toBe(403);
    expect(denied.body).toMatchObject({ error: { code: "MANAGED_PROFILE_MANAGER_REQUIRED" } });
  });

  it("uses one live organization grant for every child and denies foreign owners", async () => {
    allowManagedProfile();
    const siblingIds = [CHILD_ID, "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
    const foreignId = "66666666-6666-4666-8666-666666666666";
    let role = "manager";
    let revoked = false;
    ManagedProfile.findOne = mock(async ({ where }: { where: { profileId: string } }) => ({
      id: where.profileId, managerProfileId: where.profileId === foreignId ? "foreign-owner" : OWNER_ID
    })) as never;
    ManagedProfileMembership.findOne = mock(async ({ where }: { where: { ownerProfileId: string; memberProfileId: string; revokedAt: null } }) =>
      where.ownerProfileId === OWNER_ID && where.memberProfileId === MANAGER_ID && where.revokedAt === null && !revoked
        ? { id: "one-org-grant", role } : null
    ) as never;
    for (const state of ["manager", "read_only", "revoked"]) {
      role = state;
      revoked = state === "revoked";
      for (const subject of [...siblingIds, foreignId]) {
        for (const capability of Object.values(ManagedProfileCapability)) {
          const next = mock(() => {});
          const res = response();
          await authorizeManagedProfile({ capability })(request({
            get: () => subject, userId: undefined, authenticatedCredentialProfileId: MANAGER_ID,
            credential: { profileId: MANAGER_ID, strength: "secret" }
          }) as never, res as never, next);
          const allowed = subject !== foreignId && !revoked && (role === "manager" || capability === ManagedProfileCapability.Read);
          expect(next.mock.calls.length).toBe(allowed ? 1 : 0);
          expect(res.statusCode).toBe(allowed ? 200 : 403);
        }
      }
    }
  });

  it("rejects provider mutations and ramp execution for a selected-child bearer session", async () => {
    allowManagedProfile();

    const credentialNext = mock(() => {});
    const credentialDenied = response();
    await authorizeManagedProfile({ capability: ManagedProfileCapability.CredentialManage })(
      request() as never,
      credentialDenied as never,
      credentialNext
    );
    expect(credentialNext).not.toHaveBeenCalled();
    expect(credentialDenied.body).toMatchObject({ error: { code: "MANAGED_PROFILE_REQUIRES_API_CREDENTIAL" } });

    const rampDenied = response();
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Ramp })(
      request() as never,
      rampDenied as never,
      mock(() => {})
    );
    expect(rampDenied.body).toMatchObject({ error: { code: "MANAGED_PROFILE_RAMP_REQUIRES_API_CREDENTIAL" } });
  });

  it("enforces read-only membership for a member-owned secret credential", async () => {
    allowManagedProfile();
    ManagedProfileMembership.findOne = mock(async () => ({ id: "membership-1", role: "read_only" })) as never;
    const secretRequest = request({
      authenticatedCredentialProfileId: MANAGER_ID,
      credential: { profileId: MANAGER_ID, strength: "secret" },
      userId: undefined
    });

    for (const capability of [
      ManagedProfileCapability.Manage,
      ManagedProfileCapability.CredentialManage,
      ManagedProfileCapability.Ramp
    ]) {
      const denied = response();
      await authorizeManagedProfile({ capability })(secretRequest as never, denied as never, mock(() => {}));
      expect(denied.body).toMatchObject({ error: { code: "MANAGED_PROFILE_MANAGER_REQUIRED" } });
    }
  });

  it("allows a manager member's authenticated secret credential to use credential-only capabilities", async () => {
    allowManagedProfile();
    const secretRequest = request({
      authenticatedCredentialProfileId: MANAGER_ID,
      credential: { profileId: MANAGER_ID, strength: "secret" },
      userId: undefined
    });

    for (const capability of [ManagedProfileCapability.CredentialManage, ManagedProfileCapability.Ramp]) {
      const next = mock(() => {});
      await authorizeManagedProfile({ capability })(secretRequest as never, response() as never, next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps generic selected-child probing separate from bearer membership bootstrap", async () => {
    allowManagedProfile();
    ManagedProfileMembership.findOne = mock(async () => null) as never;
    const res = response();

    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(
      request() as never,
      res as never,
      mock(() => {})
    );

    expect(res.body).toMatchObject({ error: { code: "MANAGED_PROFILE_ACCESS_DENIED" } });
    const bootstrapResponse = response();
    ManagedProfileMembership.count = mock(async () => 0) as never;
    await authorizeManagedProfile({
      allowDeleted: true,
      capability: ManagedProfileCapability.Read,
      membershipBootstrap: true,
      subjectProfileId: () => CHILD_ID
    })(request() as never, bootstrapResponse as never, mock(() => {}));
    expect(bootstrapResponse.body).toMatchObject({ error: { code: "MANAGED_PROFILE_NOT_FOUND" } });
    ManagedProfileMembership.count = mock(async () => 1) as never;
    const historicalResponse = response();
    await authorizeManagedProfile({
      allowDeleted: true,
      capability: ManagedProfileCapability.Read,
      membershipBootstrap: true,
      subjectProfileId: () => CHILD_ID
    })(request() as never, historicalResponse as never, mock(() => {}));
    expect(historicalResponse.body).toMatchObject({ error: { code: "MANAGED_PROFILE_MEMBERSHIP_INVALID" } });
    expect(ManagedProfileMembership.count).toHaveBeenCalledWith({
      where: {
        ownerProfileId: OWNER_ID,
        memberProfileId: MANAGER_ID,
        createdAt: { [Op.lte]: expect.any(Date) },
        [Op.or]: [{ revokedAt: null }, { revokedAt: { [Op.gt]: new Date("2026-01-01") } }]
      }
    });
  });

  it("fails closed for unknown membership roles and unclassified delegated or direct-child routes", async () => {
    allowManagedProfile();
    ManagedProfileMembership.findOne = mock(async () => ({ id: "membership-1", role: "admin" })) as never;
    const denied = response();
    const next = mock(() => {});
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(request() as never, denied as never, next);
    expect(denied.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    for (const req of [request(), request({
      get: () => undefined, userId: undefined,
      credential: { profileId: CHILD_ID, strength: "secret", managedProfile: { controllingManagerProfileId: OWNER_ID } }
    })]) {
      const unclassified = response();
      await authorizeManagedProfile({ capability: undefined as never })(req as never, unclassified as never, next);
      expect(unclassified.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("hides a missing path-subject membership as not found", async () => {
    allowManagedProfile();
    ManagedProfileMembership.findOne = mock(async () => null) as never;
    const res = response();

    await authorizeManagedProfile({
      capability: ManagedProfileCapability.Read,
      subjectProfileId: () => CHILD_ID
    })(request({ get: () => undefined }) as never, res as never, mock(() => {}));

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "MANAGED_PROFILE_NOT_FOUND" } });
  });

  it("rejects a child that is not directly managed by the authenticated actor", async () => {
    allowManagedProfile();
    ManagedProfile.findOne = mock(async () => null) as never;
    const res = response();
    const next = mock(() => {});
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(request() as never, res as never, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("builds direct child context and enforces the controlling manager corridors", async () => {
    allowManagedProfile();
    const req = request({
      credential: {
        credentialId: "credential-1",
        environment: "test",
        managedProfile: {
          allowedCorridors: ["BR"],
          controllingManagerProfileId: MANAGER_ID,
          relationshipId: "relationship-1"
        },
        partnerId: null,
        profileId: CHILD_ID,
        strength: "secret"
      },
      get: () => undefined,
      userId: undefined
    }) as ReturnType<typeof request> & { managedProfileContext?: ManagedProfileContext };
    const next = mock(() => {});

    await authorizeManagedProfile({ capability: ManagedProfileCapability.Ramp, corridor: "BR" })(
      req as never,
      response() as never,
      next
    );

    expect(req.managedProfileContext).toEqual({
      actorProfileId: CHILD_ID,
      capability: ManagedProfileCapability.Ramp,
      controllingManagerProfileId: MANAGER_ID,
      customerEntityId: "entity-1",
      managedProfileId: "relationship-1",
      subjectProfileId: CHILD_ID
    });
    expect(next).toHaveBeenCalledTimes(1);

    const denied = response();
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Ramp, corridor: "MX" })(
      req as never,
      denied as never,
      mock(() => {})
    );
    expect(denied.statusCode).toBe(403);
  });

  it("does not let a direct child credential select another managed child", async () => {
    const res = response();
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(
      request({
        credential: {
          managedProfile: {
            allowedCorridors: ["BR"],
            controllingManagerProfileId: MANAGER_ID,
            relationshipId: "relationship-1"
          },
          profileId: CHILD_ID
        },
        userId: undefined
      }) as never,
      res as never,
      mock(() => {})
    );
    expect(res.statusCode).toBe(403);
  });

  it("rejects a selected child that differs from the route subject", async () => {
    const res = response();
    await authorizeManagedProfile({
      capability: ManagedProfileCapability.Read,
      subjectProfileId: () => OWNER_ID
    })(request() as never, res as never, mock(() => {}));

    expect(res.body).toMatchObject({ error: { code: "MANAGED_PROFILE_ACCESS_DENIED" } });
    expect(ManagedProfileMembership.findOne).toBe(originalMembershipFindOne);
  });

  it("rejects an inactive manager", async () => {
    allowManagedProfile();
    ManagedProfileManager.findByPk = mock(async () => ({ allowedCorridors: ["BR"], isActive: false })) as never;
    const res = response();
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(
      request() as never,
      res as never,
      mock(() => {})
    );
    expect(res.statusCode).toBe(403);
  });

  it("rejects a corridor that is not enabled for the manager", async () => {
    allowManagedProfile();
    const res = response();
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read, corridor: "MX" })(
      request() as never,
      res as never,
      mock(() => {})
    );
    expect(res.statusCode).toBe(403);
  });

  it("applies customer-type narrowing and the canonical corridor matrix", async () => {
    allowManagedProfile();
    ManagedProfileManager.findByPk = mock(async () => ({
      allowedCorridors: ["AR", "BR"],
      allowedCustomerTypes: ["business"],
      isActive: true
    })) as never;

    const narrowed = response();
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read, corridor: "BR" })(
      request() as never,
      narrowed as never,
      mock(() => {})
    );
    expect(narrowed.statusCode).toBe(403);

    CustomerEntity.findAll = mock(async () => [{ id: "entity-1", status: "active", type: "business" }]) as never;
    const unsupported = response();
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read, corridor: "AR" })(
      request() as never,
      unsupported as never,
      mock(() => {})
    );
    expect(unsupported.statusCode).toBe(403);
  });

  it("does not apply customer-type narrowing to policy-free reads", async () => {
    allowManagedProfile();
    ManagedProfileManager.findByPk = mock(async () => ({
      allowedCorridors: ["BR"],
      allowedCustomerTypes: ["business"],
      isActive: true
    })) as never;
    const next = mock(() => {});

    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(request() as never, response() as never, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("applies customer-type narrowing when explicitly required for list reads", async () => {
    allowManagedProfile();
    ManagedProfileManager.findByPk = mock(async () => ({
      allowedCorridors: ["BR"],
      allowedCustomerTypes: ["business"],
      isActive: true
    })) as never;
    const res = response();

    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read, enforceCustomerTypePolicy: true })(
      request() as never,
      res as never,
      mock(() => {})
    );

    expect(res.statusCode).toBe(403);
  });

  it("requires the route customer type to match the immutable child entity type", async () => {
    allowManagedProfile();
    const res = response();
    await authorizeManagedProfile({
      capability: ManagedProfileCapability.Read,
      corridor: "BR",
      customerType: "business"
    })(
      request() as never,
      res as never,
      mock(() => {})
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "MANAGED_PROFILE_CUSTOMER_TYPE_MISMATCH" } });
  });

  it("requires every resolved corridor to be enabled for the manager", async () => {
    allowManagedProfile();
    const denied = response();
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read, corridor: () => ["BR", "MX"] })(
      request() as never,
      denied as never,
      mock(() => {})
    );
    expect(denied.statusCode).toBe(403);

    ManagedProfileManager.findByPk = mock(async () => ({ allowedCorridors: ["BR", "MX"], isActive: true })) as never;
    const next = mock(() => {});
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read, corridor: () => ["BR", "MX"] })(
      request() as never,
      response() as never,
      next
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects a managed child with additional customer entities", async () => {
    allowManagedProfile();
    CustomerEntity.findAll = mock(async () => [
      { id: "entity-1", status: "active", type: "individual" },
      { id: "entity-2", status: "archived", type: "individual" }
    ]) as never;
    const res = response();
    await authorizeManagedProfile({ capability: ManagedProfileCapability.Read })(
      request() as never,
      res as never,
      mock(() => {})
    );
    expect(res.statusCode).toBe(403);
  });
});

describe("rejectDirectManagedCredential", () => {
  it("rejects managed child credentials and preserves ordinary credentials", () => {
    const managedReq = request() as ReturnType<typeof request> & { credential?: CredentialContext };
    managedReq.credential = {
      credentialId: "credential-1",
      environment: "test",
      managedProfile: {
        allowedCorridors: ["BR"],
        allowedCustomerTypes: null,
        controllingManagerProfileId: MANAGER_ID,
        relationshipId: "relationship-1"
      },
      partnerId: null,
      profileId: CHILD_ID,
      strength: "secret"
    };
    const managedRes = response();
    const managedNext = mock(() => undefined);

    rejectDirectManagedCredential(managedReq as never, managedRes as never, managedNext);

    expect(managedRes.statusCode).toBe(403);
    expect(managedNext).not.toHaveBeenCalled();

    const ordinaryReq = request();
    const ordinaryNext = mock(() => undefined);
    rejectDirectManagedCredential(ordinaryReq as never, response() as never, ordinaryNext);
    expect(ordinaryNext).toHaveBeenCalledTimes(1);
  });
});
