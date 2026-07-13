import { apiClient } from "./api-client";

export interface AcceptedRecipientInvite {
  id: string;
  invitation: {
    country: string;
    id: string;
    payoutCurrency: string;
    rail: string;
  };
  relationshipStatus: "active" | "archived";
}

export const RecipientsService = {
  acceptInvite: (token: string) =>
    apiClient.post<AcceptedRecipientInvite>(`/recipients/invite/${encodeURIComponent(token)}/accept`)
};
