import { v4 as uuidv4 } from 'uuid';
import { Transaction } from 'sequelize';
import logger from '../../../config/logger';
import KycLevel2, { KycLevel2Status } from '../../../models/kycLevel2.model';
import sequelize from '../../../config/database';
import { KYCDocType, KycLevel2Response } from '../brla/types';
import { BrlaApiService } from '../brla/brlaApiService';

export class KycService {
  private brlaApiService: BrlaApiService;

  constructor() {
    this.brlaApiService = BrlaApiService.getInstance();
  }

  protected async createKycLevel2(
    data: {
      subaccountId: string;
      documentType: KYCDocType;
      status?: KycLevel2Status;
      uploadData: KycLevel2Response;
    },
    transaction?: Transaction,
  ): Promise<KycLevel2> {
    return KycLevel2.create(
      {
        id: uuidv4(),
        subaccountId: data.subaccountId,
        documentType: data.documentType,
        status: data.status || KycLevel2Status.REQUESTED,
        errorLogs: [],
        uploadData: data.uploadData,
      },
      { transaction },
    );
  }


  protected async getKycLevel2ById(id: string): Promise<KycLevel2 | null> {
    return KycLevel2.findByPk(id);
  }


  protected async getLatestKycLevel2BySubaccount(
    subaccountId: string,
  ): Promise<KycLevel2 | null> {

    return KycLevel2.findOne({
      where: { subaccountId },
      order: [['createdAt', 'DESC']],
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
      logger.error('Transaction failed:', error);
      throw error;
    }
  }

  protected async updateKycLevel2Status(
    id: string,
    status: KycLevel2Status,
    errorLog?: any,
  ): Promise<[number, KycLevel2[]]> {
    const kycLevel2 = await this.getKycLevel2ById(id);
    if (!kycLevel2) {
      throw new Error(`KYC Level 2 entry with id ${id} not found`);
    }

    const updateData: any = { status };

    if (errorLog) {
      const errorLogs = [...kycLevel2.errorLogs, { ...errorLog, timestamp: new Date() }];
      updateData.errorLogs = errorLogs;
    }

    return KycLevel2.update(updateData, {
      where: { id },
      returning: true,
    });
  }


  public async requestKycLevel2(
    subaccountId: string, 
    documentType: KYCDocType, 
  ): Promise<string> {
    try {
      // Ensure no existing KYC Level 2 process is in progress for the subaccount, or the user is already level 2.
      const existingKycLevel2 = await this.getLatestKycLevel2BySubaccount(subaccountId);

      if (existingKycLevel2 && ( existingKycLevel2.status === KycLevel2Status.BRLA_VALIDATING || existingKycLevel2.status === KycLevel2Status.DATA_COLLECTED || existingKycLevel2.status === KycLevel2Status.REQUESTED )) {
        throw new Error(`KYC Level 2 process already in progress for subaccount ${subaccountId}`);
      }

      if (existingKycLevel2 && existingKycLevel2.status === KycLevel2Status.ACCEPTED) {
        throw new Error(`Subaccount ${subaccountId} is already KYC Level 2 verified`);
      }

      // Start KYC Level 2 process with BRLA API, create the entity.
      const kycResponse = await this.brlaApiService.startKYC2(subaccountId, documentType);

      return this.withTransaction(async (transaction) => {
        const kycLevel2 = await this.createKycLevel2(
          {
            subaccountId,
            documentType,
            status: KycLevel2Status.REQUESTED,
            uploadData: kycResponse,
          },
          transaction,
        );

        logger.info(`KYC Level 2 verification requested for subaccount ${subaccountId}`, {
          kycLevel2Id: kycLevel2.id,
        });

        return kycLevel2.id;
      });
    } catch (error) {
      logger.error('Failed to request KYC Level 2 verification:', error);
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

  public async uploadKyc2Data(kycToken: string, selfie: any, rgFrontBuffer: any, rgBackBuffer: any, cnhBuffer: any): Promise<void> {
    try {
      const kycEntry = await this.getKycLevel2ById(kycToken);

      if (!kycEntry) {
        throw new Error(`KYC Level 2 entry with id ${kycToken} not found`);
      }
      console.log("selfie....", selfie);
      const selfieUrl = kycEntry.uploadData.selfieUploadUrl;
      // TODO and so on.... then upload.
      console.log('entry', kycEntry.uploadData);

      // TODO url expires in 60 seconds apparently. We must only fetch the url's from brla when we actually have the images and they 
      // are partially validated.
      const res = await fetch(kycEntry.uploadData.selfieUploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': selfie.mimetype,
          'Content-Length': String(selfie.buffer.length),
        },
        body: selfie.buffer,
      })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Upload failed: ${res.status} ${res.statusText} — ${errText}`)
    }

      return;
    } catch (error) {
      logger.error('Failed to upload KYC Level 2 data:', error);
      throw error;
    }
  }
}

export default new KycService();
