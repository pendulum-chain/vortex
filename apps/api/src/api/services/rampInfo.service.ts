import { GetRampInfoResponse } from "@vortexfi/shared";
import CustomerEntity from "../../models/customerEntity.model";
import ProviderCustomer, { VerificationStatus } from "../../models/providerCustomer.model";

const CORRIDORS = ["AR", "BR", "CO", "MX", "US"] as const;
type RampInfoStatus = GetRampInfoResponse["corridors"][string]["kycStatus"];

function corridorFor(customer: ProviderCustomer): (typeof CORRIDORS)[number] | null {
  if (customer.provider === "avenia") return "BR";
  if (customer.provider !== "alfredpay") return null;

  const country = customer.country?.toUpperCase();
  return CORRIDORS.find(corridor => corridor === country) ?? null;
}

function collapseStatus(statuses: VerificationStatus[]): RampInfoStatus {
  if (statuses.includes(VerificationStatus.Approved)) return "approved";
  if (statuses.some(status => status !== VerificationStatus.Rejected)) return "pending";
  if (statuses.length > 0) return "rejected";
  return "not_started";
}

export async function getRampInfo(profileId: string): Promise<GetRampInfoResponse> {
  const entities = await CustomerEntity.findAll({ attributes: ["id"], where: { profileId } });
  const customers = entities.length
    ? await ProviderCustomer.findAll({
        attributes: ["country", "provider", "status"],
        where: { customerEntityId: entities.map(entity => entity.id) }
      })
    : [];

  return {
    corridors: Object.fromEntries(
      CORRIDORS.map(corridor => {
        const status = collapseStatus(
          customers.filter(customer => corridorFor(customer) === corridor).map(customer => customer.status)
        );
        const approved = status === "approved";
        return [corridor, { canBuy: approved, canSell: approved, kycStatus: status }];
      })
    )
  };
}
