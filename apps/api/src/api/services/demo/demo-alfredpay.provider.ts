import {
  AlfredpayApiService,
  AlfredpayCustomerType,
  type AlfredpayKybCustomerAndBusiness,
  AlfredpayKybStatus,
  type CreateAlfredpayCustomerResponse,
  type FindAlfredpayCustomerResponse,
  type GetKybRedirectLinkResponse,
  type GetKybStatusResponse,
  type GetKybSubmissionResponse,
  type SubmitKybInformationRequest,
  type SubmitKybInformationResponse
} from "@vortexfi/shared";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";

/** How long a sent submission sits in review before it approves itself. */
const REVIEW_DURATION_MS = 10_000;

interface DemoSubmission {
  submissionId: string;
  business: SubmitKybInformationRequest | null;
  /** Null until sendKybSubmission is called — an unsent submission reads as PENDING. */
  sentAt: number | null;
}

/**
 * Canned Alfredpay stand-in for the demo corridor. It accepts every submission, hands back stable
 * ids, and approves after a short review window, so the onboarding wizard can be walked end to end
 * as many times as a demo needs without depending on Alfredpay's sandbox.
 *
 * Only the KYB surface the wizard touches is implemented. Anything else falls through to the real
 * client, so an unimplemented path fails visibly instead of returning invented data.
 */
class DemoAlfredpayKyb {
  private readonly submissionsByCustomer = new Map<string, DemoSubmission>();

  private counter = 0;

  private nextId(prefix: string): string {
    this.counter += 1;
    return `demo-${prefix}-${this.counter}`;
  }

  async createCustomer(): Promise<CreateAlfredpayCustomerResponse> {
    return { createdAt: new Date().toISOString(), customerId: this.nextId("customer") };
  }

  async findCustomer(_email: string, country: string): Promise<FindAlfredpayCustomerResponse> {
    return {
      country,
      createdAt: new Date().toISOString(),
      customerId: this.nextId("customer"),
      type: AlfredpayCustomerType.BUSINESS
    };
  }

  async submitKybInformation(customerId: string, data: SubmitKybInformationRequest): Promise<SubmitKybInformationResponse> {
    const submissionId = this.nextId("kyb");
    this.submissionsByCustomer.set(customerId, { business: data, sentAt: null, submissionId });
    return { submissionId };
  }

  async updateKybInformation(customerId: string, submissionId: string, data: SubmitKybInformationRequest): Promise<void> {
    this.submissionsByCustomer.set(customerId, { business: data, sentAt: null, submissionId });
  }

  async getLastKybSubmission(customerId: string): Promise<GetKybSubmissionResponse> {
    const submission = this.submissionsByCustomer.get(customerId);
    if (!submission) {
      // Callers treat a throw here as "no previous submission" and start a fresh one.
      throw new Error("404 Not Found: no KYB submission for this customer");
    }
    return { createdAt: new Date().toISOString(), submissionId: submission.submissionId };
  }

  async getKybStatus(customerId: string): Promise<GetKybStatusResponse> {
    const submission = this.submissionsByCustomer.get(customerId);
    const updatedAt = new Date().toISOString();

    if (!submission) {
      // The process restarted mid-demo. Approving is where the demo was heading anyway, and it
      // beats trapping the presenter in a wizard that can no longer be completed.
      return { status: AlfredpayKybStatus.COMPLETED, updatedAt };
    }
    if (submission.sentAt === null) {
      return { status: AlfredpayKybStatus.PENDING, updatedAt };
    }
    const inReview = Date.now() - submission.sentAt < REVIEW_DURATION_MS;
    return { status: inReview ? AlfredpayKybStatus.IN_REVIEW : AlfredpayKybStatus.COMPLETED, updatedAt };
  }

  async sendKybSubmission(customerId: string, submissionId: string): Promise<void> {
    this.submissionsByCustomer.set(customerId, {
      business: this.submissionsByCustomer.get(customerId)?.business ?? null,
      sentAt: Date.now(),
      submissionId
    });
  }

  async getKybRedirectLink(customerId: string): Promise<GetKybRedirectLinkResponse> {
    const submissionId = this.submissionsByCustomer.get(customerId)?.submissionId ?? this.nextId("kyb");
    return { submissionId, verification_url: "https://demo.vortexfinance.co/kyb-verification" };
  }

  async getKybBusinessDetails(customerId: string): Promise<AlfredpayKybCustomerAndBusiness[]> {
    const submission = this.submissionsByCustomer.get(customerId);
    if (!submission?.business) {
      return [];
    }

    const business = submission.business;
    return [
      {
        address: business.address,
        businessName: business.businessName,
        city: business.city,
        country: business.country,
        customerId,
        relatedPersons: (business.relatedPersons ?? []).map((person, index) => ({
          dateOfBirth: person.dateOfBirth,
          email: person.email,
          firstName: person.firstName,
          idRelatedPerson: `demo-person-${index + 1}`,
          lastName: person.lastName
        })),
        state: business.state,
        submissionId: submission.submissionId,
        taxId: business.taxId,
        website: business.website,
        zipCode: business.zipCode
      }
    ];
  }

  // Document uploads are accepted and discarded — nothing downstream reads them here.
  async submitKybFiles(): Promise<void> {
    return;
  }

  async submitKybRelatedPersonFiles(): Promise<void> {
    return;
  }
}

/**
 * Wraps the demo KYB surface so every other Alfredpay method still reaches the real client. The
 * real instance is resolved lazily: a demo deployment may have no Alfredpay credentials at all,
 * and that should only break the calls that genuinely need them.
 */
export function createDemoAlfredpayService(realGetInstance: () => AlfredpayApiService): AlfredpayApiService {
  const demoKyb = new DemoAlfredpayKyb() as unknown as Record<string | symbol, unknown>;

  return new Proxy({} as AlfredpayApiService, {
    get(_target, property) {
      const demoMethod = demoKyb[property];
      if (typeof demoMethod === "function") {
        return demoMethod.bind(demoKyb);
      }
      const real = realGetInstance() as unknown as Record<string | symbol, unknown>;
      const realMethod = real[property];
      return typeof realMethod === "function" ? realMethod.bind(real) : realMethod;
    }
  });
}

/**
 * Swaps the Alfredpay singleton for the demo stand-in. Called once at startup; guarded so it can
 * never take effect outside a sandbox deployment that explicitly opted in.
 */
export function installDemoProviders(): void {
  if (!config.demoProviderEnabled) {
    return;
  }
  if (config.deploymentEnv !== "sandbox") {
    throw new Error(`Demo providers are sandbox-only; DEPLOYMENT_ENV is '${config.deploymentEnv}'`);
  }

  const realGetInstance = AlfredpayApiService.getInstance.bind(AlfredpayApiService);
  const demoService = createDemoAlfredpayService(realGetInstance);
  AlfredpayApiService.getInstance = () => demoService;
  logger.warn("Demo provider enabled: Alfredpay KYB onboarding is served by canned in-process responses");
}
