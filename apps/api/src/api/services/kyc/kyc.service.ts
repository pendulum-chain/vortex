import { BrlaApiService, BrlaKYCDocType, KycLevel2Response } from "@packages/shared";
import { Transaction } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import sequelize from "../../../config/database";
import logger from "../../../config/logger";
import KycLevel2, { KycLevel2Status } from "../../../models/kycLevel2.model";

export class KycService {
  private brlaApiService: BrlaApiService;

  constructor() {
    this.brlaApiService = BrlaApiService.getInstance();
  }

  protected async createKycLevel2(
    data: {
      subaccountId: string;
      documentType: BrlaKYCDocType;
      status?: KycLevel2Status;
      uploadData?: KycLevel2Response;
    },
    transaction?: Transaction
  ): Promise<KycLevel2> {
    return KycLevel2.create(
      {
        documentType: data.documentType,
        errorLogs: [],
        id: uuidv4(),
        status: data.status || KycLevel2Status.REQUESTED,
        subaccountId: data.subaccountId,
        uploadData: data.uploadData
      },
      { transaction }
    );
  }

  protected async getKycLevel2ById(id: string): Promise<KycLevel2 | null> {
    return KycLevel2.findByPk(id);
  }

  protected async getLatestKycLevel2BySubaccount(subaccountId: string): Promise<KycLevel2 | null> {
    return KycLevel2.findOne({
      order: [["createdAt", "DESC"]],
      where: { subaccountId }
    });
  }

  protected async withTransaction<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T> {
    const transaction = await sequelize.transaction();
    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      logger.error("Transaction failed:", error);
      throw error;
    }
  }

  public async hasCompletedKycLevel2(subaccountId: string): Promise<boolean> {
    const kycLevel2 = (await this.getLatestKycLevel2BySubaccount(subaccountId)) as KycLevel2 | null;

    if (!kycLevel2) {
      return false;
    }

    return kycLevel2.status === KycLevel2Status.ACCEPTED;
  }
}

export default new KycService();
