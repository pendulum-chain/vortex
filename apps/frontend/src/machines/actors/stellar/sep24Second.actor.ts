import { getTokenDetailsSpacewalk, PaymentData } from "@packages/shared";
import Big from "big.js";
import { fromPromise } from "xstate";
import { sep24Second } from "../../../services/anchor/sep24/second";
import { IAnchorSessionParams, ISep24Intermediate } from "../../../types/sep";
import { RampContext } from "../../types";

export const sep24SecondActor = fromPromise(
  async ({
    input
  }: {
    input: RampContext & {
      token: string;
      tomlValues: any;
    } & ISep24Intermediate;
  }) => {
    const { executionInput, token, tomlValues, id } = input;
    console.log("SEP-24 Second step input:", {
      executionInput,
      id,
      token,
      tomlValues
    });
    if (!executionInput || !token || !tomlValues || !id) {
      throw new Error("Missing required data for SEP-24 second step");
    }
    const outputToken = getTokenDetailsSpacewalk(executionInput.fiatToken);

    const offrampAmountBeforeFees = Big(executionInput.quote.outputAmount).plus(executionInput.quote.fee.anchor);

    const anchorSessionParams: IAnchorSessionParams = {
      offrampAmount: offrampAmountBeforeFees.toFixed(2, 0),
      token: token,
      tokenConfig: outputToken,
      tomlValues: tomlValues
    };

    const secondSep24Response = await sep24Second({ id, url: "" }, anchorSessionParams);

    const amountBeforeFees = Big(executionInput.quote.outputAmount).plus(executionInput.quote.fee.anchor).toFixed(2);

    if (!Big(secondSep24Response.amount).eq(amountBeforeFees)) {
      throw new Error("Amount mismatch");
    }

    const paymentData: PaymentData = {
      amount: secondSep24Response.amount,
      anchorTargetAccount: secondSep24Response.offrampingAccount,
      memo: secondSep24Response.memo,
      memoType: secondSep24Response.memoType as "text" | "hash"
    };

    return paymentData;
  }
);
