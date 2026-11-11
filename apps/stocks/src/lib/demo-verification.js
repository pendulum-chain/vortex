// Demo mode only: stand-ins for the Vortex e-mail code and the Avenia KYC, so a reviewer can walk
// through every step of the flows without any network call. Nothing here talks to Vortex, Avenia
// or a wallet, and the state lives in this tab's sessionStorage under a Stocks demo key (never the
// shared Vortex session key). The first buy or sell in a tab asks for the code (123456) and the
// KYC form; after that both are skipped, as for a verified user. "Reiniciar demonstração" resets.
import { session } from "@vortexfi/consumer-kit";
import { STOCKS_KEYS } from "./stores.js";

export const DEMO_OTP_CODE = "123456";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{ storage?:ReturnType<typeof import("@vortexfi/consumer-kit").createJsonStorage>, delay?:(ms:number)=>Promise<void> }} deps
 * @returns {{ required:true, demoCode:string, hasSession:()=>boolean, requestOtp:()=>Promise<void>,
 *   verifyOtp:(email:string, code:string)=>Promise<void>, kyc:object, markVerified:()=>void, reset:()=>void }}
 */
export function createDemoVerification({ storage = session, delay = wait } = {}) {
  const state = () => {
    const value = storage.get(STOCKS_KEYS.demoVerification, null);
    return value && typeof value === "object" ? value : {};
  };
  const patch = (next) => storage.set(STOCKS_KEYS.demoVerification, { ...state(), ...next });
  const approved = () => state().kyc === true;

  // Same method names and shapes as the kit's createBrazilKyc(), so KycStep has one path.
  const kyc = {
    demo: true,
    async getReadiness() {
      return { kycStatus: approved() ? "approved" : "not_started", canBuy: approved(), canSell: approved() };
    },
    async createSubaccount() { await delay(250); return { subAccountId: "demo-subaccount" }; },
    async getUploadUrls() {
      return { idUpload: { id: "demo-document", uploadURLFront: null, uploadURLBack: null }, selfieUpload: { id: "demo-selfie", livenessUrl: null } };
    },
    async uploadDocument() {},
    async submit() { await delay(250); return { ok: true }; },
    async poll() {
      await delay(1_200);
      patch({ kyc: true });
      return { status: "COMPLETED", result: "APPROVED" };
    },
  };

  return {
    required: true,
    demoCode: DEMO_OTP_CODE,
    hasSession: () => state().otp === true,
    async requestOtp() { await delay(350); },
    async verifyOtp(_email, code) {
      await delay(400);
      if (String(code || "").replace(/\D/g, "") !== DEMO_OTP_CODE) throw new Error(`Código incorreto. No ambiente de teste, use ${DEMO_OTP_CODE}.`);
      patch({ otp: true });
    },
    kyc,
    /** Demo deep link "buy-quote": code and KYC count as done in this tab. */
    markVerified: () => patch({ otp: true, kyc: true }),
    reset: () => storage.remove(STOCKS_KEYS.demoVerification),
  };
}
