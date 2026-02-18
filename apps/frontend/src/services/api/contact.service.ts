import { SubmitContactRequest, SubmitContactResponse } from "@vortexfi/shared";
import { apiRequest } from "./api-client";

export async function submitContactForm(data: SubmitContactRequest): Promise<SubmitContactResponse> {
  return apiRequest<SubmitContactResponse>("post", "/contact/submit", data);
}
