import { AveniaWebhookSubscription, BrlaApiService } from "@vortexfi/shared";
import { config } from "../config/vars";

/**
 * Registers (or repoints) this backend's Avenia webhook subscription.
 *
 * Run once per environment. Avenia allows at most 3 webhooks per account, so an
 * existing registration for the same URL is patched rather than duplicated.
 *
 * Subscribes with "*" deliberately: Avenia documents no KYB subscription, and the
 * wildcard is the only setting that can deliver company verification events if they
 * exist at all. Events we do not handle are acknowledged and dropped by the receiver.
 */
async function main(): Promise<void> {
  const webhookUrl = config.integrations.avenia.webhookUrl;

  if (!webhookUrl) {
    throw new Error("AVENIA_WEBHOOK_URL is not set");
  }

  if (!webhookUrl.startsWith("https://")) {
    throw new Error(`AVENIA_WEBHOOK_URL must be https, got ${webhookUrl}`);
  }

  const brlaApiService = BrlaApiService.getInstance();
  const subscriptions = [AveniaWebhookSubscription.All];

  const { webhooks } = await brlaApiService.listWebhooks();
  const existing = webhooks?.find(webhook => webhook.webhookUrl === webhookUrl);

  if (existing) {
    await brlaApiService.updateWebhook(existing.id, webhookUrl, subscriptions);
    console.log(`Updated Avenia webhook ${existing.id} -> ${webhookUrl} ${JSON.stringify(subscriptions)}`);
    return;
  }

  if (webhooks && webhooks.length >= 3) {
    throw new Error(
      `Avenia allows 3 webhooks; ${webhooks.length} are registered: ${webhooks.map(w => w.webhookUrl).join(", ")}`
    );
  }

  const created = await brlaApiService.createWebhook(webhookUrl, subscriptions);
  console.log(`Registered Avenia webhook ${created.id} -> ${webhookUrl} ${JSON.stringify(subscriptions)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
