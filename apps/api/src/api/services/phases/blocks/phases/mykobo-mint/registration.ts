import {
  EphemeralAccountType,
  IbanPaymentData,
  MykoboApiService,
  MykoboCurrency,
  MykoboTransactionType
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { requireAccount } from "../../core/accounts";
import type { RegisterCtx, RegistrationResult } from "../../core/types";
import type { MykoboMintMetadata } from "./simulation";

export interface MykoboMintRegistrationInput extends Record<string, unknown> {
  email?: string;
}

export interface MykoboMintRegistrationFacts {
  mykoboEmail: string;
  mykoboTransactionId: string;
  mykoboTransactionReference: string;
}

export interface MykoboMintResponseArtifacts extends Record<string, unknown> {
  ibanPaymentData: IbanPaymentData;
}

export async function registerMykoboMint(
  ctx: RegisterCtx<MykoboMintMetadata, MykoboMintRegistrationInput>
): Promise<RegistrationResult<MykoboMintRegistrationFacts, MykoboMintMetadata>> {
  const [{ APIError }, { resolveMykoboCustomerForUser }] = await Promise.all([
    import("../../../../../errors/api-error"),
    import("../../../../mykobo/mykobo-customer.service")
  ]);
  if (!ctx.ipAddress) {
    throw new APIError({ message: "IP address is required for Mykobo EUR onramp", status: httpStatus.BAD_REQUEST });
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
    transaction_type: MykoboTransactionType.DEPOSIT,
    value: new Big(ctx.quote.inputAmount).toFixed(2, 0),
    wallet_address: evmEphemeral.address
  });
  const instructions = intent.instructions;
  if (!instructions || !("iban" in instructions)) {
    throw new APIError({
      message: "Mykobo deposit intent did not return IBAN instructions",
      status: httpStatus.BAD_GATEWAY
    });
  }
  const responseArtifacts: MykoboMintResponseArtifacts = {
    ibanPaymentData: {
      bic: "",
      iban: instructions.iban,
      receiverName: instructions.bank_account_name,
      reference: intent.transaction.reference
    }
  };
  return {
    facts: {
      mykoboEmail: email,
      mykoboTransactionId: intent.transaction.id,
      mykoboTransactionReference: intent.transaction.reference
    },
    responseArtifacts
  };
}
