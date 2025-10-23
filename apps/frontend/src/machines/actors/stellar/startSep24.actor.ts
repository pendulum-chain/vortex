import { getTokenDetailsSpacewalk } from "@packages/shared";
import Big from "big.js";
import { fromCallback } from "xstate";
import { sep10 } from "../../../services/anchor/sep10";
import { sep24First } from "../../../services/anchor/sep24/first";
import { fetchTomlValues } from "../../../services/stellar";
import { IAnchorSessionParams } from "../../../types/sep";
import { RampContext } from "../../types";

export const startSep24Actor = fromCallback<any, RampContext>(({ sendBack, input }) => {
  let intervalId: NodeJS.Timeout;

  const { executionInput } = input;
  if (!executionInput) {
    throw new Error("Missing execution input");
  }

  const runSep24Logic = async () => {
    try {
      const stellarEphemeralSecret = executionInput.ephemerals.stellarEphemeral.secret;
      const outputToken = getTokenDetailsSpacewalk(executionInput.fiatToken);
      const tomlValues = await fetchTomlValues(outputToken.tomlFileUrl);

      const { token: sep10Token, sep10Account } = await sep10(
        tomlValues,
        stellarEphemeralSecret,
        executionInput.fiatToken,
        executionInput.sourceOrDestinationAddress
      );

      const offrampAmountBeforeFees = Big(executionInput.quote.outputAmount).plus(executionInput.quote.anchorFeeFiat);

      const anchorSessionParams: IAnchorSessionParams = {
        offrampAmount: offrampAmountBeforeFees.toFixed(2, 0),
        token: sep10Token,
        tokenConfig: outputToken,
        tomlValues
      };

      const fetchAndUpdateSep24Url = async () => {
        const firstSep24Response = await sep24First(anchorSessionParams, sep10Account, executionInput.fiatToken);
        const url = new URL(firstSep24Response.url);
        console.log("SEP-24 URL:", url.toString());
        url.searchParams.append("callback", "postMessage");
        sendBack({
          id: firstSep24Response.id,
          type: "URL_UPDATED",
          url: url.toString()
        });
      };

      sendBack({
        output: { sep10Account, token: sep10Token, tomlValues },
        type: "SEP24_STARTED"
      });

      // TODO edge case, if the Stellar actor is closed before this interval is returned, then nothing stops this interval on exit.
      await fetchAndUpdateSep24Url();
      console.log("setting interval");
      intervalId = setInterval(fetchAndUpdateSep24Url, 20000);
      sendBack({ intervalId, type: "INTERVAL_STARTED" });
    } catch (error) {
      sendBack({ error, type: "xstate.error" });
    }
  };

  console.log("Starting SEP-24 logic with input:", input);
  runSep24Logic();

  return () => {
    if (intervalId) {
      console.log("clearing interval", intervalId);
      clearInterval(intervalId);
    }
  };
});
