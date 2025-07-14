import type { RampProcess, RegisterRampRequest, UpdateRampRequest } from "@packages/shared";
import { Networks } from "@packages/shared";
import { BrlaKycStatusError } from "../errors";
import type { ApiService } from "../services/ApiService";
import type { BrlaOnrampAdditionalData, RampHandler, VortexSignerContext } from "../types";

export class BrlaHandler implements RampHandler {
  private apiService: ApiService;
  private generateEphemerals: VortexSignerContext["generateEphemerals"];
  private signTransactions: VortexSignerContext["signTransactions"];
  private setEphemerals: VortexSignerContext["setEphemerals"];
  private createRampState: VortexSignerContext["createRampState"];
  private updateRampState: VortexSignerContext["updateRampState"];
  private hasRampState: VortexSignerContext["hasRampState"];
  private registerRamp: (request: RegisterRampRequest) => Promise<RampProcess>;
  private updateRamp: (request: UpdateRampRequest) => Promise<RampProcess>;

  constructor(
    apiService: ApiService,
    context: VortexSignerContext,
    registerRamp: (request: RegisterRampRequest) => Promise<RampProcess>,
    updateRamp: (request: UpdateRampRequest) => Promise<RampProcess>
  ) {
    this.apiService = apiService;
    this.generateEphemerals = context.generateEphemerals.bind(context);
    this.signTransactions = context.signTransactions.bind(context);
    this.setEphemerals = context.setEphemerals.bind(context);
    this.createRampState = context.createRampState.bind(context);
    this.updateRampState = context.updateRampState.bind(context);
    this.hasRampState = context.hasRampState.bind(context);
    this.registerRamp = registerRamp;
    this.updateRamp = updateRamp;
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

    const rampProcess = await this.registerRamp(registerRequest);
    const rampId = rampProcess.id;

    this.createRampState(rampId, rampProcess.quoteId, rampProcess.currentPhase, rampProcess.unsignedTxs);

    this.setEphemerals(rampId, {
      moonbeamEphemeral: ephemerals[Networks.Moonbeam],
      pendulumEphemeral: ephemerals[Networks.Pendulum],
      stellarEphemeral: ephemerals[Networks.Stellar]
    });

    const signedTxs = await this.signTransactions(rampId, rampProcess.unsignedTxs);

    const updateRequest: UpdateRampRequest = {
      additionalData: {},
      presignedTxs: signedTxs,
      rampId
    };

    const updatedRampProcess = await this.updateRamp(updateRequest);

    this.updateRampState(rampId, updatedRampProcess.currentPhase, updatedRampProcess.unsignedTxs);

    return updatedRampProcess;
  }

  async startBrlaOnramp(rampId: string): Promise<RampProcess> {
    if (!this.hasRampState(rampId)) {
      throw new Error(`No ramp state found for rampId: ${rampId}`);
    }

    const startRequest = { rampId };
    return this.apiService.startRamp(startRequest);
  }
}
