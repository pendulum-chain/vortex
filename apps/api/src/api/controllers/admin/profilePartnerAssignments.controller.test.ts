import {afterEach, describe, expect, it, mock} from "bun:test";
import {RampDirection} from "@vortexfi/shared";
import {Request, Response} from "express";
import httpStatus from "http-status";
import {Op, Transaction, UniqueConstraintError} from "sequelize";
import sequelize from "../../../config/database";
import Partner from "../../../models/partner.model";
import ProfilePartnerAssignment from "../../../models/profilePartnerAssignment.model";
import User from "../../../models/user.model";
import {createProfilePartnerAssignment, listProfilePartnerAssignments} from "./profilePartnerAssignments.controller";

interface AssignmentFindAllOptions {
  where: {
    isActive?: boolean;
    [Op.or]?: unknown[];
  };
}

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
  const originalAssignmentFindAll = ProfilePartnerAssignment.findAll;

  const transaction = { id: "profile-assignment-tx" };
  const createdAt = new Date("2026-06-03T12:00:00.000Z");
  const updatedAt = new Date("2026-06-03T12:00:01.000Z");

  afterEach(() => {
    sequelize.transaction = originalTransaction;
    User.findByPk = originalUserFindByPk;
    Partner.findAll = originalPartnerFindAll;
    ProfilePartnerAssignment.update = originalAssignmentUpdate;
    ProfilePartnerAssignment.create = originalAssignmentCreate;
    ProfilePartnerAssignment.findAll = originalAssignmentFindAll;
  });

  function mockValidAssignmentDependencies() {
    const transactionMock = mock(async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction));
    const userFindByPkMock = mock(async () => ({ id: "user-1" }));
    const partnerFindAllMock = mock(async () => [
      { id: "buy-partner-1", name: "Acme", rampType: RampDirection.BUY },
      { id: "sell-partner-1", name: "Acme", rampType: RampDirection.SELL }
    ]);
    const assignmentUpdateMock = mock(async () => [1]);
    const assignmentCreateMock = mock(async () => ({
      createdAt,
      expiresAt: null,
      buyPartnerId: "buy-partner-1",
      id: "assignment-2",
      isActive: true,
      partnerName: "Acme",
      sellPartnerId: "sell-partner-1",
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
      } as unknown as Request,
      res as unknown as Response
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
        buyPartnerId: "buy-partner-1",
        expiresAt: null,
        isActive: true,
        partnerName: "Acme",
        sellPartnerId: "sell-partner-1",
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
      } as unknown as Request,
      res as unknown as Response
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

  it("rejects ambiguous active partners for the same ramp type", async () => {
    mockValidAssignmentDependencies();
    Partner.findAll = mock(async () => [
      { id: "buy-partner-1", name: "Acme", rampType: RampDirection.BUY },
      { id: "buy-partner-2", name: "Acme", rampType: RampDirection.BUY }
    ]) as unknown as typeof Partner.findAll;
    const res = createResponse();

    await createProfilePartnerAssignment(
      {
        body: {
          partnerName: "Acme",
          userId: "user-1"
        }
      } as unknown as Request,
      res as unknown as Response
    );

    expect(res.statusCode).toBe(httpStatus.CONFLICT);
    expect(res.body).toEqual({
      error: {
        code: "AMBIGUOUS_PARTNER_ASSIGNMENT",
        message: `Multiple active ${RampDirection.BUY} partners found with this name`,
        status: httpStatus.CONFLICT
      }
    });
  });

  it("excludes expired assignments from the default list", async () => {
    const assignmentFindAllMock = mock(async (_options: AssignmentFindAllOptions) => []);
    ProfilePartnerAssignment.findAll = assignmentFindAllMock as unknown as typeof ProfilePartnerAssignment.findAll;
    const res = createResponse();

    await listProfilePartnerAssignments({ query: {} } as unknown as Request, res as unknown as Response);

    expect(res.statusCode).toBe(httpStatus.OK);
    expect(assignmentFindAllMock).toHaveBeenCalledTimes(1);
    const findOptions = assignmentFindAllMock.mock.calls[0]?.[0];
    expect(findOptions).toBeDefined();
    if (!findOptions) {
      throw new Error("ProfilePartnerAssignment.findAll was not called with options");
    }
    expect(findOptions.where.isActive).toBe(true);
    expect(findOptions.where[Op.or]).toHaveLength(2);
  });

  it("includes expired assignments when includeInactive is true", async () => {
    const assignmentFindAllMock = mock(async (_options: AssignmentFindAllOptions) => []);
    ProfilePartnerAssignment.findAll = assignmentFindAllMock as unknown as typeof ProfilePartnerAssignment.findAll;
    const res = createResponse();

    await listProfilePartnerAssignments(
      { query: { includeInactive: "true" } } as unknown as Request<unknown, unknown, unknown, { includeInactive?: string }>,
      res as unknown as Response
    );

    const findOptions = assignmentFindAllMock.mock.calls[0]?.[0];
    expect(findOptions).toBeDefined();
    if (!findOptions) {
      throw new Error("ProfilePartnerAssignment.findAll was not called with options");
    }
    expect(findOptions.where).not.toHaveProperty("isActive");
    expect(findOptions.where[Op.or]).toBeUndefined();
  });
});
