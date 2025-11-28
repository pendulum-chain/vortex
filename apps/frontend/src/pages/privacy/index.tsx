import { useTranslation } from "react-i18next";

export function PrivacyPolicyPage() {
  const { t } = useTranslation();

  return (
    <main className="container mx-auto px-4 md:px-10 py-20 max-w-4xl">
      <h1 className="text-3xl font-bold mb-4">Vortex Privacy Policy</h1>
      <p className="mb-6 text-gray-600">
        Last updated: 28 September 2025
        <br />
        Version: 1.0
      </p>

      <p className="mb-8">
        This Privacy Policy explains how Vortex (a brand operated by SatoshiPay Ltd) collects and processes personal data when
        you use our websites, apps, widgets, and related services (collectively, the “Services”). It replaces earlier versions
        and will be updated as our Services evolve.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">1. Who we are (Controller)</h2>
        <p className="mb-4">
          <strong>Controller:</strong> SatoshiPay Ltd (trading as “Vortex”)
          <br />
          <strong>Registered office:</strong>
          <br />
          Hill Dickinson Llp
          <br />
          The Broadgate Tower
          <br />
          20 Primrose Street
          <br />
          London, EC2A 2EW United Kingdom
          <br />
          <strong>Contact:</strong>{" "}
          <a className="text-blue-600 hover:underline" href="mailto:privacy@vortexfinance.co">
            privacy@vortexfinance.co
          </a>
        </p>
        <p className="mb-4">
          SatoshiPay operates Vortex’s web/app frontends and determines the purposes and means of processing personal data for
          the Services described here.
        </p>
        <p className="mb-4">
          <strong>Independent controllers (local partners).</strong> For on-/off-ramping, we work with licensed local payment
          partners who act as independent controllers for their own onboarding (e.g., KYC/KYB), fiat accounts, and payouts. See
          Section 7 for the current partner list and links to their policies.
        </p>
        <p className="mb-4">
          <strong>Processors.</strong> We also use vetted vendors (e.g., cloud hosting, analytics) as processors under data
          processing agreements. See Section 8.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">2. Scope</h2>
        <p className="mb-2">This policy applies to:</p>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>vortexfinance.co and any sub-domains</li>
          <li>the Vortex Buy & Sell Crypto App and Vortex Widget</li>
          <li>API and backend services that we operate for partners</li>
        </ul>
        <p>
          It does not cover services operated solely by our local partners; they provide their own privacy notices and consents
          where required.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">3. What data we collect</h2>
        <p className="mb-2">We collect the following categories of personal data, depending on how you use the Services:</p>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>
            <strong>Contact data:</strong> e-mail address (for account/security verification and service communications).
          </li>
          <li>
            <strong>Usage & device data:</strong> IP address, device/browser information, language, timestamps, referral URLs,
            and server logs.
          </li>
          <li>
            <strong>Transaction metadata:</strong> order identifiers, corridor, asset type (e.g., stablecoin, token), amounts,
            and status. We do not custodially hold your private keys. On-chain transactions are public by design.
          </li>
          <li>
            <strong>Support data:</strong> information you provide in requests (e.g., messages, attachments).
          </li>
          <li>
            <strong>Cookies/analytics data:</strong> only with your consent where required (see Section 11).
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">4. Why we process data (purposes & legal bases)</h2>
        <p className="mb-4">We process personal data for the following purposes and legal bases under the GDPR:</p>

        <div className="overflow-x-auto mb-6">
          <table className="w-full border-collapse border border-gray-300 min-w-[600px]">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">Purpose</th>
                <th className="border border-gray-300 p-2 text-left">Examples</th>
                <th className="border border-gray-300 p-2 text-left">Legal basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">Provide and operate the Services</td>
                <td className="border border-gray-300 p-2">
                  initiate and complete conversions; display rates; route transactions
                </td>
                <td className="border border-gray-300 p-2">Art. 6(1)(b) GDPR (contract)</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">Service communications & account verification</td>
                <td className="border border-gray-300 p-2">verification e-mails; status updates; security alerts</td>
                <td className="border border-gray-300 p-2">Art. 6(1)(b) (contract)</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">Security & abuse prevention</td>
                <td className="border border-gray-300 p-2">rate-limiting, incident investigation, preventing misuse</td>
                <td className="border border-gray-300 p-2">Art. 6(1)(f) (legitimate interests)</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">Compliance support</td>
                <td className="border border-gray-300 p-2">
                  ensuring corridors operate within applicable rules; audit logs (we do not run KYC/KYB)
                </td>
                <td className="border border-gray-300 p-2">Art. 6(1)(c) where applicable; otherwise 6(1)(f)</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">Analytics & quality (cookies/analytics)</td>
                <td className="border border-gray-300 p-2">improving UX and performance</td>
                <td className="border border-gray-300 p-2">Art. 6(1)(a) (consent)</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">Marketing (optional)</td>
                <td className="border border-gray-300 p-2">newsletters, product updates</td>
                <td className="border border-gray-300 p-2">
                  Art. 6(1)(a) (consent). We do not send marketing e-mails without explicit opt-in.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mb-4">
          <strong>E-mail addresses for service only.</strong> We store e-mail addresses to provide the Service (e.g.,
          verification, transaction notifications, recognizing returning users across rails). This does not require marketing
          consent. To prevent misuse, we may send a verification e-mail to confirm control of the address.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">5. Data sources</h2>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>Directly from you (e.g., input fields, support).</li>
          <li>Automatically via your device/browser (IP, logs, cookies subject to consent).</li>
          <li>
            From local partners, limited to what is necessary to operate a corridor (e.g., transaction status). Partners conduct
            KYC/KYB on their systems under their policies.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">6. Sharing and disclosures (overview)</h2>
        <p className="mb-2">We share personal data only as needed to run the Services:</p>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>
            <strong>With independent local partners (controllers):</strong> to execute on/off-ramp flows (e.g., payout
            confirmation). Partners use your data under their own policies and legal bases.
          </li>
          <li>
            <strong>With processors:</strong> for hosting, analytics, communications, and support tooling under data processing
            agreements.
          </li>
          <li>
            <strong>For legal reasons:</strong> if required by law, regulation, or to protect rights, safety, and integrity of
            the Services.
          </li>
        </ul>
        <p>We do not sell personal data.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">7. Local partners (independent controllers)</h2>
        <p className="mb-4">
          These partners operate in their own jurisdictions for fiat collection/payout and related compliance. They may collect
          additional data directly from you. Please review their terms and privacy notices.
        </p>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>
            <strong>BRLA Digital Ltda (Brazil)</strong> – Website:{" "}
            <a className="text-blue-600 hover:underline" href="https://avenia.io/" rel="noopener noreferrer" target="_blank">
              https://avenia.io/
            </a>{" "}
            – T/Cs:{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://app.avenia.io/Avenia-TC.pdf"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://app.avenia.io/Avenia-TC.pdf
            </a>{" "}
            - Privacy:{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://app.avenia.io/Avenia-Privacy-Policy.pdf"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://app.avenia.io/Avenia-Privacy-Policy.pdf
            </a>
          </li>
          <li>
            <strong>ANCLAP (Argentina)</strong> – Website:{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://home.anclap.com/"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://home.anclap.com/
            </a>
          </li>
          <li>
            <strong>Monerium EMI ehf. (EEA/Iceland)</strong> – Website:{" "}
            <a className="text-blue-600 hover:underline" href="https://monerium.com/" rel="noopener noreferrer" target="_blank">
              https://monerium.com/
            </a>{" "}
            – Privacy/ToS:{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://monerium.com/policies/personal-terms-of-service-2025-05-20/"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://monerium.com/policies/personal-terms-of-service-2025-05-20/
            </a>
          </li>
          <li>
            <strong>MYKOBO UAB (EU/Lithuania)</strong> – Website:{" "}
            <a className="text-blue-600 hover:underline" href="https://mykobo.io/" rel="noopener noreferrer" target="_blank">
              https://mykobo.io/
            </a>{" "}
            – Privacy:{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://privacy.mykobo.co/"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://privacy.mykobo.co/
            </a>{" "}
            – Terms:{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://terms.mykobo.co/"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://terms.mykobo.co/
            </a>
          </li>
        </ul>
        <p className="mt-4 mb-4">
          <strong>Future partners (blanket clause).</strong> To provide the Services, we may add or replace local partners. We
          will update this list upon material changes and, where legally required, notify users. Even if a partner is not yet
          listed here, personal data may be shared where necessary to provide the requested on-/off-ramp service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">8. Processors (service providers)</h2>
        <p className="mb-2">We use reputable vendors under data processing agreements (DPAs):</p>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>
            <strong>Cloud hosting & infrastructure:</strong> Amazon Web Services (AWS), Render, Netlify, Supabase.
          </li>
          <li>
            <strong>Analytics (consent-based):</strong> Google Analytics.
          </li>
          <li>
            <strong>Support/CRM:</strong> Pipedrive, Google sheets.
          </li>
        </ul>
        <p>
          <strong>International transfers.</strong> Where data is transferred outside the EEA/UK, we use EU Standard Contractual
          Clauses and/or rely on adequacy decisions (e.g., EU-US Data Privacy Framework) as applicable, plus supplementary
          safeguards.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">9. Retention</h2>
        <p className="mb-2">We retain personal data only as long as necessary for the purposes above:</p>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>
            <strong>Service & security data:</strong> for the lifetime of the account/relationship and for a limited period
            thereafter (e.g., up to 24 months after last activity) for troubleshooting and compliance support.
          </li>
          <li>
            <strong>Logs:</strong> typically up to 12 months, unless needed longer for security or legal reasons.
          </li>
          <li>
            <strong>Analytics cookies:</strong> per your consent; retention managed by the provider.
          </li>
        </ul>
        <p className="mt-4">
          We may retain information as required by law (e.g., tax/audit) or to establish, exercise, or defend legal claims.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">10. Your rights</h2>
        <p>
          Under applicable law (e.g., GDPR/UK-GDPR), you may have rights to access, rectify, erase, restrict, or object to
          processing, and to data portability. You may withdraw consent at any time (for activities based on consent). To
          exercise rights, contact{" "}
          <a className="text-blue-600 hover:underline" href="mailto:privacy@vortexfinance.co">
            privacy@vortexfinance.co
          </a>
          . You also have the right to lodge a complaint with your local data protection authority.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">11. Cookies & analytics</h2>
        <p className="mb-4">
          We use cookies for essential functionality and, with your consent, for analytics. You can manage cookie preferences in
          your browser or via our cookie banner.
        </p>
        <p>
          Google Analytics: IP anonymization is enabled. For opt-out tools and details, see{" "}
          <a
            className="text-blue-600 hover:underline"
            href="https://tools.google.com/dlpage/gaoptout"
            rel="noopener noreferrer"
            target="_blank"
          >
            https://tools.google.com/dlpage/gaoptout
          </a>{" "}
          and{" "}
          <a
            className="text-blue-600 hover:underline"
            href="https://policies.google.com/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            https://policies.google.com/privacy
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">12. Security</h2>
        <p>
          We implement appropriate technical and organizational measures, including encryption in transit, access controls, and
          monitoring. No internet service can be 100% secure; we work to detect and mitigate incidents promptly.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">13. Changes to this policy (versioning)</h2>
        <p>
          We update this policy when necessary. The “Last updated” date and version appear at the top. For material changes
          (e.g., new categories of data, new purposes, or new key partners), we will provide a clear notice and, where required,
          seek consent.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">14. Contact</h2>
        <p className="mb-4">
          For questions about this policy, data requests, or complaints, contact:{" "}
          <a className="text-blue-600 hover:underline" href="mailto:privacy@vortexfinance.co">
            privacy@vortexfinance.co
          </a>
        </p>
        <p>If you prefer, you may also contact SatoshiPay Ltd at its registered address listed above.</p>
      </section>
    </main>
  );
}
