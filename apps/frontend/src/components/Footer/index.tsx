import { ComponentType } from "react";
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
  return <p>{t("components.footer.copyright", { year: new Date().getFullYear() })}</p>;
};

const PoweredBySatoshipay = () => {
  const { t } = useTranslation();
  return (
    <div className="flex">
      <p className="mr-1 text-gray-500 text-xs">{t("components.footer.poweredBy")}</p>
      <a className="transition hover:opacity-80" href="https://satoshipay.io" rel="noopener noreferrer" target="_blank">
        <img alt="Satoshipay" src={SATOSHIPAY_LOGO} />
      </a>
    </div>
  );
};

export function Footer() {
  return (
    <footer className="mx-6 py-16 sm:container sm:mx-auto">
      <div className="mb-4 flex justify-between">
        <div>
          <img alt="Vortex" src={VORTEX_LOGO} />
          <div className="mt-6">
            <PoweredBySatoshipay />
          </div>
        </div>
        <div className="flex items-end">
          <div className="flex gap-4">
            {SOCIALS.map(social => (
              <SocialIcon key={social.name} social={social} />
            ))}
          </div>
        </div>
      </div>
      <hr />

      <div className="mt-2">
        <Copyright />
      </div>
    </footer>
  );
}
