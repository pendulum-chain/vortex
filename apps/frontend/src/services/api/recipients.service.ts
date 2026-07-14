import type { AcceptedRecipientInvite } from "@vortexfi/shared";
import { apiClient } from "./api-client";

export type { AcceptedRecipientInvite } from "@vortexfi/shared";

export const RecipientsService = {
  acceptInvite: (token: string) =>
    apiClient.post<AcceptedRecipientInvite>(`/recipients/invite/${encodeURIComponent(token)}/accept`)
};
