export type CorridorCountry = "AR" | "BR" | "CO" | "EU" | "MX" | "US";
export type CorridorProviderName = "alfredpay" | "avenia" | "monerium" | "mykobo";
export type CorridorCustomerType = "individual" | "business";

export interface CorridorCapability {
  rail: string;
  provider: CorridorProviderName;
  customerTypes: CorridorCustomerType[];
}

/**
 * Which provider serves each corridor and which customer types it can onboard.
 * Single source of truth for the supported (corridor × customer type) matrix
 * across apps. Alfredpay does not support AR company KYB.
 */
export const CORRIDOR_CAPABILITIES: Record<CorridorCountry, CorridorCapability> = {
  AR: { customerTypes: ["individual"], provider: "alfredpay", rail: "ars" },
  BR: { customerTypes: ["individual", "business"], provider: "avenia", rail: "brl" },
  CO: { customerTypes: ["individual", "business"], provider: "alfredpay", rail: "cop" },
  EU: { customerTypes: ["individual", "business"], provider: "monerium", rail: "eur" },
  MX: { customerTypes: ["individual", "business"], provider: "alfredpay", rail: "mxn" },
  US: { customerTypes: ["individual", "business"], provider: "alfredpay", rail: "usd" }
};

export function isCorridorSupportedForCustomerType(country: CorridorCountry, customerType: CorridorCustomerType): boolean {
  return CORRIDOR_CAPABILITIES[country].customerTypes.includes(customerType);
}
