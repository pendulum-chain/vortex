import { AuthAPI } from "../../services/api/auth.api";
import { RampContext } from "../types";

export const checkEmailActor = async ({ input }: { input: { context: RampContext } }) => {
  if (!input.context.userEmail) {
    throw new Error("Email is required");
  }

  const result = await AuthAPI.checkEmail(input.context.userEmail);
  return result;
};

export const requestOTPActor = async ({ input }: { input: { context: RampContext } }) => {
  if (!input.context.userEmail) {
    throw new Error("Email is required");
  }

  await AuthAPI.requestOTP(input.context.userEmail);
  return { success: true };
};

export const verifyOTPActor = async ({ input }: { input: { email: string; code: string } }) => {
  const result = await AuthAPI.verifyOTP(input.email, input.code);
  return result;
};
