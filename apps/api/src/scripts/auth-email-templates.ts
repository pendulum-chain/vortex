import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EmailBody, renderHtml } from "../api/services/email/templates/layout";

// Supabase renders auth emails itself from Go text/template, so these cannot import the
// layout at send time — they are generated here and pasted into the Supabase Dashboard
// (Authentication -> Emails). Re-run this script after any layout.ts change and re-paste.
const OUTPUT_DIR = join(__dirname, "../../.email-previews/supabase");

// supabase.service.ts passes `options.data = { locale }` on signInWithOtp, so the locale is on
// the user's metadata. The spelling list matches the one already live in the Dashboard; users
// created before that call shipped have no locale at all and fall through to English.
const BRAZIL_SPELLINGS = ["pt-BR", "pt_BR", "pt-br", "pt_br", "br", "BR"];

const PREAMBLE = `{{ $locale := index .Data "locale" }}
{{ $isBrazil := or ${BRAZIL_SPELLINGS.map(spelling => `(eq $locale "${spelling}")`).join(" ")} }}
`;

/** Emits a Go conditional so one template serves both locales. */
function i18n(en: string, pt: string): string {
  return `{{ if $isBrazil }}${pt}{{ else }}${en}{{ end }}`;
}

/**
 * The Dashboard's subject field is a separate Go template that never sees the body's
 * preamble, so the subject inlines the whole locale conditional.
 */
function subjectI18n(en: string, pt: string): string {
  const isBrazil = `or ${BRAZIL_SPELLINGS.map(spelling => `(eq (index .Data "locale") "${spelling}")`).join(" ")}`;
  return `{{ if ${isBrazil} }}${pt}{{ else }}${en}{{ end }}`;
}

// The site serves both locales; "pt" is the path prefix the frontend maps to pt-BR.
const LINKS = [
  {
    href: i18n("https://www.vortexfinance.co/en/terms-and-conditions", "https://www.vortexfinance.co/pt/terms-and-conditions"),
    label: i18n("Terms of Service", "Termos de Serviço")
  },
  {
    href: i18n("https://www.vortexfinance.co/en/privacy-policy", "https://www.vortexfinance.co/pt/privacy-policy"),
    label: i18n("Privacy Policy", "Política de Privacidade")
  }
];

// otp_expiry in supabase/config.toml is 3600s.
const EXPIRY = { label: i18n("Expires in", "Expira em"), value: i18n("1 hour", "1 hora") };

const TEMPLATES: { name: string; subject: string; body: EmailBody }[] = [
  {
    body: {
      details: [EXPIRY],
      heading: i18n("Welcome back", "Bem-vindo(a) de volta"),
      highlight: {
        code: true,
        label: i18n("Your verification code", "Seu código de verificação"),
        value: "{{ .Token }}"
      },
      intro: i18n("Enter this code to sign in to your Vortex account.", "Digite este código para entrar na sua conta Vortex."),
      links: LINKS,
      outro: i18n(
        "If you didn't request this code, you can safely ignore this email.",
        "Se você não solicitou este código, pode ignorar este email com segurança."
      )
    },
    name: "magic_link",
    subject: subjectI18n("Your Vortex Verification Code", "Seu código de verificação Vortex")
  },
  {
    body: {
      details: [EXPIRY],
      heading: i18n("Confirm your email address", "Confirme seu endereço de email"),
      highlight: {
        code: true,
        label: i18n("Your confirmation code", "Seu código de confirmação"),
        value: "{{ .Token }}"
      },
      intro: i18n(
        "Thanks for signing up for Vortex. Enter this code to verify your account.",
        "Obrigado por se cadastrar na Vortex. Digite este código para verificar sua conta."
      ),
      links: LINKS,
      outro: i18n(
        "If you didn't create a Vortex account, you can safely ignore this email.",
        "Se você não criou uma conta na Vortex, pode ignorar este email com segurança."
      )
    },
    name: "signup",
    subject: subjectI18n("Confirm your signup", "Confirme seu cadastro na Vortex")
  }
];

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const { name, subject, body } of TEMPLATES) {
  const path = join(OUTPUT_DIR, `${name}.html`);
  writeFileSync(path, PREAMBLE + renderHtml(body));
  console.log(`${name}  subject: ${subject}\n  ${path}`);
}
