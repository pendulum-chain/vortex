export type RecipientInviteeType = "individual" | "business";

export interface AcceptedRecipientInvite {
  id: string;
  invitation: {
    country: string;
    id: string;
    inviteeType: RecipientInviteeType;
    payoutCurrency: string;
    rail: string;
  };
  relationshipStatus: "active" | "archived";
}
