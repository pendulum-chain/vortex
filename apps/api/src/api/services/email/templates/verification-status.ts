import { EmailLocale, RenderedEmail, VerificationKind, VerificationPayload } from "../types";
import { EmailBody, formatDate, renderHtml, renderText, StatusTone } from "./layout";

interface Copy {
  subject: string;
  heading: string;
  intro: string;
  status: string;
  outro: string;
}

const STATUS_TONES: Record<VerificationKind, StatusTone> = {
  approved: "success",
  expired: "warning",
  rejected: "error"
};

const REASON_LABEL: Record<EmailLocale, string> = {
  "en-US": "Reason",
  "pt-BR": "Motivo"
};

const DATE_LABEL: Record<EmailLocale, string> = {
  "en-US": "Date",
  "pt-BR": "Data"
};

const COPY: Record<VerificationKind, Record<EmailLocale, Copy>> = {
  approved: {
    "en-US": {
      heading: "Your business verification was approved",
      intro: "Your business verification has been approved. You can now continue using Vortex.",
      outro: "If you have any questions, reach out to us at",
      status: "Approved",
      subject: "Your Vortex business verification was approved"
    },
    "pt-BR": {
      heading: "Sua verificação empresarial foi aprovada",
      intro: "Sua verificação empresarial foi aprovada. Você já pode continuar usando a Vortex.",
      outro: "Se tiver alguma dúvida, entre em contato conosco em",
      status: "Aprovada",
      subject: "Sua verificação empresarial na Vortex foi aprovada"
    }
  },
  expired: {
    "en-US": {
      heading: "Your business verification expired",
      intro: "Your business verification expired before it could be completed. You can start a new verification at any time.",
      outro: "If you have any questions, reach out to us at",
      status: "Expired",
      subject: "Your Vortex business verification expired"
    },
    "pt-BR": {
      heading: "Sua verificação empresarial expirou",
      intro:
        "Sua verificação empresarial expirou antes de ser concluída. Você pode iniciar uma nova verificação quando quiser.",
      outro: "Se tiver alguma dúvida, entre em contato conosco em",
      status: "Expirada",
      subject: "Sua verificação empresarial na Vortex expirou"
    }
  },
  rejected: {
    "en-US": {
      heading: "Your business verification was not approved",
      intro: "Your business verification could not be approved.",
      outro: "If you have any questions, reach out to us at",
      status: "Not approved",
      subject: "Your Vortex business verification was not approved"
    },
    "pt-BR": {
      heading: "Sua verificação empresarial não foi aprovada",
      intro: "Não foi possível aprovar sua verificação empresarial.",
      outro: "Se tiver alguma dúvida, entre em contato conosco em",
      status: "Não aprovada",
      subject: "Sua verificação empresarial na Vortex não foi aprovada"
    }
  }
};

export function renderVerificationStatus(
  kind: VerificationKind,
  locale: EmailLocale,
  payload: VerificationPayload
): RenderedEmail {
  const copy = COPY[kind][locale];

  const body: EmailBody = {
    details: [
      ...(payload.reason ? [{ label: REASON_LABEL[locale], value: payload.reason }] : []),
      { label: DATE_LABEL[locale], value: formatDate(payload.updatedAt, locale) }
    ],
    heading: copy.heading,
    intro: copy.intro,
    outro: copy.outro,
    status: { label: copy.status, tone: STATUS_TONES[kind] }
  };

  return {
    html: renderHtml(body),
    subject: copy.subject,
    text: renderText(body)
  };
}
