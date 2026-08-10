import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderRampCompleted } from "../api/services/email/templates/ramp-completed";
import { renderVerificationStatus } from "../api/services/email/templates/verification-status";
import { EmailLocale, RenderedEmail, SUPPORTED_LOCALES, VerificationKind } from "../api/services/email/types";

const OUTPUT_DIR = join(__dirname, "../../.email-previews");

const RAMP_COMPLETED_SAMPLE = {
  completedAt: "2026-07-29T14:32:00.000Z",
  fiatAmount: "1,250.00",
  fiatCurrency: "BRL",
  network: "polygon",
  rampId: "6b1f0c2e-9a4d-4f83-9d1a-2c7f5e8b1234",
  rampType: "sell" as const,
  tokenAmount: "230.45",
  tokenSymbol: "USDC"
};

const VERIFICATION_SAMPLES: Record<VerificationKind, { reason: string | null; updatedAt: string }> = {
  approved: { reason: null, updatedAt: "2026-07-29T14:32:00.000Z" },
  expired: { reason: null, updatedAt: "2026-07-29T14:32:00.000Z" },
  rejected: { reason: "The submitted company registration document was not legible.", updatedAt: "2026-07-29T14:32:00.000Z" }
};

function previews(locale: EmailLocale): { name: string; email: RenderedEmail }[] {
  return [
    { email: renderRampCompleted(locale, RAMP_COMPLETED_SAMPLE), name: "ramp-completed" },
    ...(Object.keys(VERIFICATION_SAMPLES) as VerificationKind[]).map(kind => ({
      email: renderVerificationStatus(kind, locale, VERIFICATION_SAMPLES[kind]),
      name: `verification-${kind}`
    }))
  ];
}

mkdirSync(OUTPUT_DIR, { recursive: true });

const links: string[] = [];

for (const locale of SUPPORTED_LOCALES) {
  for (const { name, email } of previews(locale)) {
    const fileName = `${name}.${locale}.html`;
    writeFileSync(join(OUTPUT_DIR, fileName), email.html);
    writeFileSync(join(OUTPUT_DIR, `${name}.${locale}.txt`), email.text);
    links.push(`<li><a href="${fileName}">${fileName}</a> — <em>${email.subject}</em></li>`);
  }
}

writeFileSync(
  join(OUTPUT_DIR, "index.html"),
  `<!doctype html>
<html>
  <body style="font-family:Helvetica,Arial,sans-serif;padding:24px;">
    <h1>Vortex email previews</h1>
    <ul>${links.join("\n      ")}</ul>
  </body>
</html>`
);

console.log(`Wrote ${links.length} previews to ${OUTPUT_DIR}`);
console.log(`Open ${join(OUTPUT_DIR, "index.html")}`);
