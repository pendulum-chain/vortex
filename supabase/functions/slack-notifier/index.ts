// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCompletionAttributionFields,
  buildQuoteAttributionFields,
  chunkFields,
  feeMetadata,
  partnerMetadata,
  type SlackField,
  type SubsidyQuote,
  type SubsidyRow,
  subsidyMetadata,
  swapMetadata,
  vortexFeeUsd
} from "./subsidy-reporting.ts";

function trimToSixDecimals(floatStr: string | number) {
  const num = parseFloat(String(floatStr));
  if (isNaN(num)) {
    return floatStr;
  }
  return num.toFixed(6);
}

const techiesGroupId = "S03GPNXTM7A";

const fieldIcons = {
  fee: "💰",
  output: "🎯",
  rate: "📈",
  session: "🧾",
  subsidy: "💸",
  tax: "🏛️",
  wallet: "👛"
};

type RampRecord = {
  current_phase?: string;
  from: string;
  id: string;
  quote_id: string;
  state?: {
    destinationAddress?: string;
    sessionId?: string;
    taxId?: string;
    userId?: string;
    walletAddress?: string;
  };
  to: string;
  type: string;
};

type Quote = SubsidyQuote & {
  input_currency: string;
};

function formatSlackMessage(
  record: RampRecord,
  quote: Quote,
  title?: string,
  includeFields = false,
  extraFields: SlackField[] = []
) {
  const { type: rampType, from: fromParam, to: toParam, state = {} } = record;
  const { taxId, sessionId, userId, walletAddress, destinationAddress } = state;

  const inputAmount = quote.input_amount;
  const inputCurrency = quote.input_currency;
  const outputAmount = quote.output_amount;
  const outputCurrency = quote.output_currency;

  const subsidy = subsidyMetadata(quote);
  const partner = partnerMetadata(quote);
  const swap = swapMetadata(quote);
  const fees = feeMetadata(quote);
  const { expectedOutputAmountDecimal, subsidyAmountInOutputTokenDecimal, adjustedDifference } = subsidy || {};
  const { targetDiscount } = partner || {};
  const { oraclePrice } = swap || {};
  const quoteSubsidyCurrency = subsidy.outputCurrency || swap?.outputCurrency || outputCurrency;

  const finalWalletAddress = walletAddress || destinationAddress;

  const fields: SlackField[] = [
    {
      label: `${fieldIcons.wallet} Wallet Address`,
      value: finalWalletAddress
    },
    {
      label: `${fieldIcons.session} User ID`,
      value: userId || sessionId
    }
  ];

  if (taxId) {
    fields.push({
      label: `${fieldIcons.tax} Tax ID`,
      value: taxId
    });
  }

  if (Number(targetDiscount) > 0) {
    const oraclePriceForDirection = rampType === "BUY" ? Number(oraclePrice) : 1 / Number(oraclePrice);

    const discountedRate = oraclePriceForDirection * (1 + Number(targetDiscount));
    const effectiveRate = Number(outputAmount) / Number(inputAmount);
    const effectiveRateComparison = trimToSixDecimals(effectiveRate / oraclePriceForDirection);

    fields.push({
      label: `${fieldIcons.rate} Discounted Rate (oracle × ${1 + Number(targetDiscount)}; dynamic ${Number(adjustedDifference)})`,
      value: discountedRate
    });
    fields.push({
      label: `${fieldIcons.output} Ideal Output for Discount`,
      value: `${trimToSixDecimals(expectedOutputAmountDecimal)} ${quoteSubsidyCurrency}`
    });
    fields.push({
      label: `${fieldIcons.rate} Effective Rate (Binance x ${effectiveRateComparison})`,
      value: effectiveRate
    });
    fields.push({
      label: `${fieldIcons.subsidy} Subsidy Amount`,
      value: `${trimToSixDecimals(subsidyAmountInOutputTokenDecimal)} ${quoteSubsidyCurrency}`
    });
    fields.push({
      label: `${fieldIcons.fee} Fee Revenue (Vortex)`,
      value: `${trimToSixDecimals(vortexFeeUsd(quote) ?? "")} USD | ${fees?.displayFiat?.vortex ?? ""} ${fees?.displayFiat?.currency ?? ""}`
    });
    fields.push(...buildQuoteAttributionFields(rampType, quote));
  }

  fields.push(...extraFields);

  const blocks: Array<Record<string, unknown>> = [
    {
      text: {
        text: `${title || "*🚀 Ramp Transaction Details*"}\n_Production_`,
        type: "mrkdwn"
      },
      type: "section"
    },
    {
      text: {
        text: `*${rampType}* ${trimToSixDecimals(inputAmount)} ${inputCurrency} \`${fromParam}\` ➜ *${trimToSixDecimals(outputAmount)} ${outputCurrency}* \`${toParam}\``,
        type: "mrkdwn"
      },
      type: "section"
    }
  ];

  if (includeFields) {
    blocks.push({ type: "divider" });
    for (const fieldChunk of chunkFields(fields)) {
      blocks.push({
        fields: fieldChunk.map(field => ({
          text: `*${field.label}:*\n${field.value ?? "_N/A_"}`,
          type: "mrkdwn"
        })),
        type: "section"
      });
    }
  }

  return { blocks };
}

Deno.serve(async req => {
  try {
    const payload = await req.json();
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") ?? ""
        }
      }
    });
    const type = payload.type;
    const record = payload.record as RampRecord;
    const oldRecord = payload.old_record as RampRecord;
    let slackPayload;
    const quoteId = record.quote_id;
    const { data: quote, error } = await supabaseClient.from("quote_tickets").select("*").eq("id", quoteId).single();
    if (error) {
      console.error("Couldn't find quote in table:", error);
    }
    if (type === "UPDATE") {
      if (oldRecord.current_phase === "initial" && record.current_phase !== "initial" && record.current_phase !== "timedOut") {
        slackPayload = formatSlackMessage(record, quote as Quote, `▶️ *Ramp \`${record.id}\` started*`, true);
      } else if (oldRecord.current_phase !== "failed" && record.current_phase === "failed") {
        slackPayload = formatSlackMessage(
          record,
          quote as Quote,
          `🚨 <!subteam^${techiesGroupId}>: *Ramp \`${record.id}\` got stuck in state \`${oldRecord.current_phase}\`*`,
          true
        );
      } else if (oldRecord.current_phase !== "complete" && record.current_phase === "complete") {
        const { data: subsidyRows, error: subsidyError } = await supabaseClient
          .from("subsidies")
          .select("amount,phase,token")
          .eq("ramp_id", record.id);
        if (subsidyError) {
          console.error("Couldn't load completed-ramp subsidies:", subsidyError);
        }
        const completionFields = subsidyError
          ? []
          : buildCompletionAttributionFields(quote as Quote, (subsidyRows ?? []) as SubsidyRow[]);
        slackPayload = formatSlackMessage(
          record,
          quote as Quote,
          `✅ *Ramp \`${record.id}\` completed successfully*`,
          true,
          completionFields
        );
      }
    }

    const slackWebhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    if (!slackPayload) {
      return new Response(null, { status: 204 });
    }
    console.log("Sending Message to Slack");
    await fetch(slackWebhookUrl, {
      body: JSON.stringify(slackPayload),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    return new Response(
      JSON.stringify({
        message: "Success"
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 200
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        message: err instanceof Error ? err.message : err
      }),
      {
        headers: {
          "Content-Type": "application/json"
        },
        status: 500
      }
    );
  }
});
