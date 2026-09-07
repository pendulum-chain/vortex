import type { RenderedEmail } from "../types";
import { type EmailBody, renderHtml, renderText } from "./layout";

export function renderManagedProfileInvitation(invitationUrl: string): RenderedEmail {
  const body: EmailBody = {
    details: [{ label: "Expires", value: "Seven days after the invitation was created" }],
    heading: "You have been invited to a managed profile",
    intro:
      "Sign in to Vortex with the email address that received this invitation to review it. Access is granted only after you explicitly accept.",
    links: [{ href: invitationUrl, label: "Review invitation" }],
    outro: "If you were not expecting this invitation, you can ignore this email."
  };
  return {
    html: renderHtml(body),
    subject: "Your Vortex managed-profile invitation",
    text: `${renderText(body)}\nReview invitation: ${invitationUrl}\n`
  };
}
