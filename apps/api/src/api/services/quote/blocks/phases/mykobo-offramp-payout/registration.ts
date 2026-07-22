import {
  EphemeralAccountType,
  isWithdrawInstructions,
  MykoboApiService,
  MykoboCurrency,
  MykoboTransactionType
} from "@vortexfi/shared";
import httpStatus from "http-status";
import { APIError } from "../../../../../errors/api-error";
import { resolveMykoboCustomerForUser } from "../../../../mykobo/mykobo-customer.service";
import { requireAccount } from "../../core/accounts";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import type { MykoboOfframpPayoutMetadata } from "./simulation";

export interface MykoboOfframpPayoutRegistrationInput extends Record<string, unknown> {
  email?: string;
}

export interface MykoboOfframpPayoutRegistrationFacts {
  mykoboEmail: string;
  mykoboReceivablesAddress: string;
  mykoboTransactionId: string;
  mykoboTransactionReference: string;
}

export async function registerMykoboOfframpPayout(
  ctx: RegisterCtx<MykoboOfframpPayoutMetadata, MykoboOfframpPayoutRegistrationInput>
): Promise<RegistrationResult<MykoboOfframpPayoutRegistrationFacts, MykoboOfframpPayoutMetadata>> {
  if (!ctx.ipAddress) {
    throw new APIError({ message: "IP address is required for Mykobo EUR offramp", status: httpStatus.BAD_REQUEST });
  }
  const { email } = await resolveMykoboCustomerForUser(ctx.authenticatedUser.id, ctx.input.email);
  const evmEphemeral = requireAccount(
    Object.fromEntries(ctx.signingAccounts.map(account => [account.type, account])),
    EphemeralAccountType.EVM
  );
  const intent = await MykoboApiService.getInstance().createTransactionIntent({
    currency: MykoboCurrency.EURC,
    email_address: email,
    ip_address: ctx.ipAddress,
    transaction_type: MykoboTransactionType.WITHDRAW,
    value: String(ctx.metadata.transferAmountDecimal),
    wallet_address: evmEphemeral.address
  });
  if (!isWithdrawInstructions(intent.instructions)) {
    throw new APIError({
      message: "Mykobo withdraw intent did not return receivables instructions",
      status: httpStatus.BAD_GATEWAY
    });
  }
  return {
    facts: {
      mykoboEmail: email,
      mykoboReceivablesAddress: intent.instructions.address,
      mykoboTransactionId: intent.transaction.id,
      mykoboTransactionReference: intent.transaction.reference
    }
  };
}
