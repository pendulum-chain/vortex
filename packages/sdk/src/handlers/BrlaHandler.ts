import type {
  AccountMeta,
  EphemeralAccount,
  RampProcess,
  RegisterRampRequest,
  UnsignedTx,
  UpdateRampRequest
} from "@packages/shared";
import { Networks } from "@packages/shared";
import { BrlaKycStatusError } from "../errors";
import type { ApiService } from "../services/ApiService";
import type { BrlaOnrampAdditionalData, RampAdditionalData, RampHandler, VortexSdkContext } from "../types";

export class BrlaHandler implements RampHandler {
  private apiService: ApiService;
  private generateEphemerals: (networks: Networks[]) => Promise<{
    ephemerals: { [key in Networks]?: EphemeralAccount };
    accountMetas: AccountMeta[];
  }>;
  private signTransactions: (
    unsignedTxs: UnsignedTx[],
    ephemerals: {
      stellarEphemeral?: EphemeralAccount;
      pendulumEphemeral?: EphemeralAccount;
      moonbeamEphemeral?: EphemeralAccount;
    }
  ) => Promise<any[]>;

  constructor(
    apiService: ApiService,
    context: VortexSdkContext,
    generateEphemerals: (networks: Networks[]) => Promise<{
      ephemerals: { [key in Networks]?: EphemeralAccount };
      accountMetas: AccountMeta[];
    }>,
    signTransactions: (
      unsignedTxs: UnsignedTx[],
      ephemerals: {
        stellarEphemeral?: EphemeralAccount;
        pendulumEphemeral?: EphemeralAccount;
        moonbeamEphemeral?: EphemeralAccount;
      }
    ) => Promise<any[]>
  ) {
    this.apiService = apiService;
    this.generateEphemerals = generateEphemerals;
    this.signTransactions = signTransactions;
  }

  private async validateBrlaKyc(taxId: string): Promise<void> {
    if (!taxId) {
      throw new BrlaKycStatusError("Tax ID is required", 400);
    }

    const kycStatus = await this.apiService.getBrlaKycStatus(taxId);
    if (kycStatus.kycLevel < 1) {
      throw new Error(`Insufficient KYC level. Current: ${kycStatus.kycLevel}`);
    }
  }

  async registerBrlaOnramp(quoteId: string, additionalData: BrlaOnrampAdditionalData): Promise<RampProcess> {
    if (!additionalData.taxId) {
      throw new Error("Tax ID is required for BRLA onramp");
    }

    await this.validateBrlaKyc(additionalData.taxId);

    const requiredNetworks = [Networks.Pendulum, Networks.Moonbeam]; // Hardcoded for BRLA onramp.
    const { ephemerals, accountMetas } = await this.generateEphemerals(requiredNetworks);

    const registerRequest: RegisterRampRequest = {
      additionalData: {
        destinationAddress: additionalData.destinationAddress,
        taxId: additionalData.taxId
      },
      quoteId,
      signingAccounts: accountMetas
    };

    const rampProcess = await this.apiService.registerRamp(registerRequest);

    const signedTxs = await this.signTransactions(rampProcess.unsignedTxs, {
      moonbeamEphemeral: ephemerals[Networks.Moonbeam],
      pendulumEphemeral: ephemerals[Networks.Pendulum],
      stellarEphemeral: ephemerals[Networks.Stellar]
    });

    const updateRequest: UpdateRampRequest = {
      additionalData: {},
      presignedTxs: signedTxs,
      rampId: rampProcess.id
    };

    const updatedRampProcess = await this.apiService.updateRamp(updateRequest);

    return updatedRampProcess;
  }

  async startBrlaOnramp(rampId: string): Promise<RampProcess> {
    const startRequest = { rampId };
    return this.apiService.startRamp(startRequest);
  }
}
