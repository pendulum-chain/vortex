import { afterEach, describe, expect, it, mock } from "bun:test";
import httpStatus from "http-status";
import { Transaction, UniqueConstraintError } from "sequelize";
import sequelize from "../../../config/database";
import Partner from "../../../models/partner.model";
import ProfilePartnerAssignment from "../../../models/profilePartnerAssignment.model";
import User from "../../../models/user.model";
import { createProfilePartnerAssignment } from "./profilePartnerAssignments.controller";

function createResponse() {
  const res = {
    body: undefined as unknown,
    send: mock(() => res),
    statusCode: Number(httpStatus.OK),
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

describe("createProfilePartnerAssignment", () => {
  const originalTransaction = sequelize.transaction;
  const originalUserFindByPk = User.findByPk;
  const originalPartnerFindAll = Partner.findAll;
  const originalAssignmentUpdate = ProfilePartnerAssignment.update;
  const originalAssignmentCreate = ProfilePartnerAssignment.create;

  const transaction = { id: "profile-assignment-tx" };
  const createdAt = new Date("2026-06-03T12:00:00.000Z");
  const updatedAt = new Date("2026-06-03T12:00:01.000Z");

  afterEach(() => {
    sequelize.transaction = originalTransaction;
    User.findByPk = originalUserFindByPk;
    Partner.findAll = originalPartnerFindAll;
    ProfilePartnerAssignment.update = originalAssignmentUpdate;
    ProfilePartnerAssignment.create = originalAssignmentCreate;
  });

  function mockValidAssignmentDependencies() {
    const transactionMock = mock(async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction));
    const userFindByPkMock = mock(async () => ({ id: "user-1" }));
    const partnerFindAllMock = mock(async () => [{ id: "partner-1", name: "Acme" }]);
    const assignmentUpdateMock = mock(async () => [1]);
    const assignmentCreateMock = mock(async () => ({
      createdAt,
      expiresAt: null,
      id: "assignment-2",
      isActive: true,
      partnerName: "Acme",
      updatedAt,
      userId: "user-1"
    }));

    sequelize.transaction = transactionMock as unknown as typeof sequelize.transaction;
    User.findByPk = userFindByPkMock as unknown as typeof User.findByPk;
    Partner.findAll = partnerFindAllMock as unknown as typeof Partner.findAll;
    ProfilePartnerAssignment.update = assignmentUpdateMock as unknown as typeof ProfilePartnerAssignment.update;
    ProfilePartnerAssignment.create = assignmentCreateMock as unknown as typeof ProfilePartnerAssignment.create;

    return {
      assignmentCreateMock,
      assignmentUpdateMock,
      partnerFindAllMock,
      transactionMock,
      userFindByPkMock
    };
  }

  it("replaces the active assignment inside a transaction after locking the profile row", async () => {
    const { assignmentCreateMock, assignmentUpdateMock, transactionMock, userFindByPkMock } = mockValidAssignmentDependencies();
    const res = createResponse();

    await createProfilePartnerAssignment(
      {
        body: {
          partnerName: "Acme",
          userId: "user-1"
        }
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.CREATED);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(userFindByPkMock).toHaveBeenCalledWith("user-1", {
      lock: Transaction.LOCK.UPDATE,
      transaction
    });
    expect(assignmentUpdateMock).toHaveBeenCalledWith(
      { isActive: false },
      {
        transaction,
        where: {
          isActive: true,
          userId: "user-1"
        }
      }
    );
    expect(assignmentCreateMock).toHaveBeenCalledWith(
      {
        expiresAt: null,
        isActive: true,
        partnerName: "Acme",
        userId: "user-1"
      },
      { transaction }
    );
  });

  it("returns 409 when the active-assignment unique index rejects a concurrent replacement", async () => {
    const { assignmentCreateMock } = mockValidAssignmentDependencies();
    assignmentCreateMock.mockImplementation(async () => {
      throw new UniqueConstraintError({ message: "active assignment already exists" });
    });
    const res = createResponse();

    await createProfilePartnerAssignment(
      {
        body: {
          partnerName: "Acme",
          userId: "user-1"
        }
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(res.body).toEqual({
      error: {
        code: "ASSIGNMENT_CONFLICT",
        message: "An active assignment already exists for this profile. Please retry the request.",
        status: httpStatus.CONFLICT
      }
    });
  });
});
