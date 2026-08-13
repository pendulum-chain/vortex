import { EmailLocale, RenderedEmail, VerificationKind, VerificationPayload, VerificationSubject } from "../types";
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

// The only wording that differs between an individual's KYC and a company's KYB. Both
// nouns are feminine in pt-BR, so the surrounding agreement holds for either.
const NOUN: Record<VerificationSubject, Record<EmailLocale, string>> = {
  business: { "en-US": "business verification", "pt-BR": "verificação empresarial" },
  individual: { "en-US": "identity verification", "pt-BR": "verificação de identidade" }
};

const COPY: Record<VerificationKind, Record<EmailLocale, (noun: string) => Copy>> = {
  approved: {
    "en-US": noun => ({
      heading: `Your ${noun} was approved`,
      intro: `Your ${noun} has been approved. You can now continue using Vortex.`,
      outro: "If you have any questions, reach out to us at",
      status: "Approved",
      subject: `Your Vortex ${noun} was approved`
    }),
    "pt-BR": noun => ({
      heading: `Sua ${noun} foi aprovada`,
      intro: `Sua ${noun} foi aprovada. Você já pode continuar usando a Vortex.`,
      outro: "Se tiver alguma dúvida, entre em contato conosco em",
      status: "Aprovada",
      subject: `Sua ${noun} na Vortex foi aprovada`
    })
  },
  expired: {
    "en-US": noun => ({
      heading: `Your ${noun} expired`,
      intro: `Your ${noun} expired before it could be completed. You can start a new verification at any time.`,
      outro: "If you have any questions, reach out to us at",
      status: "Expired",
      subject: `Your Vortex ${noun} expired`
    }),
    "pt-BR": noun => ({
      heading: `Sua ${noun} expirou`,
      intro: `Sua ${noun} expirou antes de ser concluída. Você pode iniciar uma nova verificação quando quiser.`,
      outro: "Se tiver alguma dúvida, entre em contato conosco em",
      status: "Expirada",
      subject: `Sua ${noun} na Vortex expirou`
    })
  },
  rejected: {
    "en-US": noun => ({
      heading: `Your ${noun} was not approved`,
      intro: `Your ${noun} could not be approved.`,
      outro: "If you have any questions, reach out to us at",
      status: "Not approved",
      subject: `Your Vortex ${noun} was not approved`
    }),
    "pt-BR": noun => ({
      heading: `Sua ${noun} não foi aprovada`,
      intro: `Não foi possível aprovar sua ${noun}.`,
      outro: "Se tiver alguma dúvida, entre em contato conosco em",
      status: "Não aprovada",
      subject: `Sua ${noun} na Vortex não foi aprovada`
    })
  }
};

export function renderVerificationStatus(
  kind: VerificationKind,
  locale: EmailLocale,
  payload: VerificationPayload
): RenderedEmail {
  const subject: VerificationSubject = payload.subject === "business" ? "business" : "individual";
  const copy = COPY[kind][locale](NOUN[subject][locale]);

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
