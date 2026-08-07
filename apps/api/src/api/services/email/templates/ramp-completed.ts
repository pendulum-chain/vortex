import { EmailLocale, RampCompletedPayload, RenderedEmail } from "../types";
import { EmailBody, formatDate, renderHtml, renderText } from "./layout";

interface Copy {
  subject: string;
  heading: string;
  intro: (rampType: "buy" | "sell") => string;
  status: string;
  labels: { amount: string; token: string; network: string; rampId: string; date: string };
  outro: string;
}

const COPY: Record<EmailLocale, Copy> = {
  "en-US": {
    heading: "Your transaction is complete",
    intro: rampType => (rampType === "buy" ? "Your purchase has been completed." : "Your sale has been completed."),
    labels: {
      amount: "Amount",
      date: "Date",
      network: "Network",
      rampId: "Ramp ID",
      token: "Token"
    },
    outro: "If you have any questions, reach out to us at",
    status: "Completed",
    subject: "Your Vortex transaction is complete"
  },
  "pt-BR": {
    heading: "Sua transação foi concluída",
    intro: rampType => (rampType === "buy" ? "Sua compra foi concluída." : "Sua venda foi concluída."),
    labels: {
      amount: "Valor",
      date: "Data",
      network: "Rede",
      rampId: "ID da transação",
      token: "Token"
    },
    outro: "Se tiver alguma dúvida, entre em contato conosco em",
    status: "Concluída",
    subject: "Sua transação na Vortex foi concluída"
  }
};

export function renderRampCompleted(locale: EmailLocale, payload: RampCompletedPayload): RenderedEmail {
  const copy = COPY[locale];

  const body: EmailBody = {
    details: [
      { label: copy.labels.token, value: `${payload.tokenAmount} ${payload.tokenSymbol}` },
      { label: copy.labels.network, value: payload.network },
      { label: copy.labels.rampId, value: payload.rampId },
      { label: copy.labels.date, value: formatDate(payload.completedAt, locale) }
    ],
    heading: copy.heading,
    highlight: { label: copy.labels.amount, value: `${payload.fiatAmount} ${payload.fiatCurrency}` },
    intro: copy.intro(payload.rampType),
    outro: copy.outro,
    status: { label: copy.status, tone: "success" }
  };

  return {
    html: renderHtml(body),
    subject: copy.subject,
    text: renderText(body)
  };
}
