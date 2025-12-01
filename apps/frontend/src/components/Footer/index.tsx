import { ComponentType, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import VORTEX_LOGO from "../../assets/logo/blue.svg";
import SATOSHIPAY_LOGO from "../../assets/logo/satoshipay.svg";
import { Github } from "../../assets/SocialsGithub";
import { Telegram } from "../../assets/SocialsTelegram";
import { X } from "../../assets/SocialsX";

interface SocialLink {
  name: string;
  icon: ComponentType<{ className?: string }>;
  url: string;
}

const SOCIALS: SocialLink[] = [
  {
    icon: X,
    name: "X",
    url: "https://x.com/Vortex_Fi"
  },
  {
    icon: Telegram,
    name: "Telegram",
    url: "https://t.me/vortex_fi"
  },
  {
    icon: Github,
    name: "Github",
    url: "https://github.com/pendulum-chain/vortex"
  }
];

const SocialIcon = ({ social }: { social: SocialLink }) => (
  <a href={social.url} key={social.name} rel="noopener noreferrer" target="_blank">
    <social.icon className="h-5 w-5 fill-primary transition-colors hover:fill-pink-600" />
  </a>
);

const Copyright = () => {
  const { t } = useTranslation();
  return <p className="text-sm text-gray-500">{t("components.footer.copyright", { year: new Date().getFullYear() })}</p>;
};

const PoweredBySatoshipay = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center mt-4">
      <p className="mr-1 text-gray-500 text-xs">{t("components.footer.poweredBy")}</p>
      <a className="transition hover:opacity-80" href="https://satoshipay.io" rel="noopener noreferrer" target="_blank">
        <img alt="Satoshipay" className="h-4" src={SATOSHIPAY_LOGO} />
      </a>
    </div>
  );
};

const FooterSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col min-w-[160px] mb-8 mr-8">
    <h3 className="font-bold mb-4 text-gray-900">{title}</h3>
    <div className="flex flex-col gap-3 text-sm text-gray-600">{children}</div>
  </div>
);

const FooterLink = ({
  href,
  children,
  external = false,
  className = ""
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
  className?: string;
}) => (
  <a
    className={`hover:text-primary transition-colors ${className}`}
    href={href}
    {...(external ? { rel: "noopener noreferrer", target: "_blank" } : {})}
  >
    {children}
  </a>
);

export function Footer() {
  const { t, i18n } = useTranslation();

  return (
    <footer className="px-4 lg:px-10 py-16 container mx-auto border-t border-gray-100">
      <div className="flex flex-wrap justify-between">
        <div className="w-full lg:w-auto mb-10 mr-4 lg:mr-8 flex flex-col items-start">
          <img alt="Vortex" className="h-8 mb-4" src={VORTEX_LOGO} />
          <PoweredBySatoshipay />
        </div>

        <div className="grid grid-cols-[1fr_1fr] sm:grid-cols-[1fr_1fr_1fr] md:grid-cols-5 gap-y-8">
          <FooterSection title={t("components.footer.company.title")}>
            <FooterLink href={`/${i18n.language}/privacy-policy`}>{t("components.footer.company.privacyPolicy")}</FooterLink>
            <FooterLink href="#">{t("components.footer.company.terms")}</FooterLink>
            <FooterLink external href="https://satoshipay.jobs.personio.de/">
              {t("components.footer.company.careers")}
            </FooterLink>

            <div className="flex flex-col gap-2 mt-2">
              <span className="font-medium text-gray-900">{t("components.footer.company.licences")}</span>
              <FooterLink
                className="pl-2 border-l-2 border-gray-200 hover:border-primary"
                external
                href="https://app.avenia.io/Avenia-TC.pdf"
              >
                {t("components.footer.company.avenia")}
              </FooterLink>
              <FooterLink
                className="pl-2 border-l-2 border-gray-200 hover:border-primary hover:border-primary"
                external
                href="https://anclap.com"
              >
                {t("components.footer.company.anclap")}
              </FooterLink>
              <FooterLink
                className="pl-2 border-l-2 border-gray-200 hover:border-primary"
                external
                href="https://monerium.com/policies/personal-terms-of-service-2025-05-20/"
              >
                {t("components.footer.company.monerium")}
              </FooterLink>
              <FooterLink
                className="pl-2 border-l-2 border-gray-200 hover:border-primary"
                external
                href="https://terms.mykobo.co/"
              >
                {t("components.footer.company.mykobo")}
              </FooterLink>
            </div>
          </FooterSection>

          <FooterSection title={t("components.footer.business.title")}>
            <FooterLink href="mailto:support@vortexfinance.co">{t("components.footer.business.contactSales")}</FooterLink>
          </FooterSection>

          <FooterSection title={t("components.footer.docs.title")}>
            <FooterLink external href="https://pendulum.gitbook.io/vortex">
              {t("components.footer.docs.vortexDocs")}
            </FooterLink>
            <FooterLink external href="https://api-docs.vortexfinance.co/">
              {t("components.footer.docs.apiDocs")}
            </FooterLink>
          </FooterSection>

          <FooterSection title={t("components.footer.buyCrypto.title")}>
            <FooterLink href="/widget?type=buy&token=USDT">{t("components.footer.buyCrypto.buyUsdt")}</FooterLink>
            <FooterLink href="/widget?type=buy&token=USDC">{t("components.footer.buyCrypto.buyUsdc")}</FooterLink>
            <FooterLink href="/widget?type=buy&token=ETH">{t("components.footer.buyCrypto.buyEth")}</FooterLink>
            <FooterLink href="/widget?type=buy&token=DOT">{t("components.footer.buyCrypto.buyDot")}</FooterLink>
          </FooterSection>

          <FooterSection title={t("components.footer.sellCrypto.title")}>
            <FooterLink href="/widget?type=sell&token=USDT">{t("components.footer.sellCrypto.sellUsdt")}</FooterLink>
            <FooterLink href="/widget?type=sell&token=USDC">{t("components.footer.sellCrypto.sellUsdc")}</FooterLink>
            <FooterLink href="/widget?type=sell&token=ETH">{t("components.footer.sellCrypto.sellEth")}</FooterLink>
            <FooterLink href="/widget?type=sell&token=DOT">{t("components.footer.sellCrypto.sellDot")}</FooterLink>
          </FooterSection>
        </div>
      </div>

      <hr className="border-gray-200 my-8" />

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <Copyright />
        <div className="flex gap-4">
          {SOCIALS.map(social => (
            <SocialIcon key={social.name} social={social} />
          ))}
        </div>
      </div>
    </footer>
  );
}
