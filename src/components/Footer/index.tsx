import { ComponentType } from 'react';
import { Telegram } from '../../assets/SocialsTelegram';
import { Github } from '../../assets/SocialsGithub';
import { X } from '../../assets/SocialsX';
import VORTEX_LOGO from '../../assets/logo/blue.svg';
import SATOSHIPAY_LOGO from '../../assets/logo/satoshipay.svg';

interface SocialLink {
  name: string;
  icon: ComponentType<{ className?: string }>;
  url: string;
}

const SOCIALS: SocialLink[] = [
  {
    name: 'X',
    icon: X,
    url: 'https://x.com/Vortex_Fi',
  },
  {
    name: 'Telegram',
    icon: Telegram,
    url: 'https://t.me/vortex_fi',
  },
  {
    name: 'Github',
    icon: Github,
    url: 'https://github.com/pendulum-chain/vortex',
  },
];

const SocialIcon = ({ social }: { social: SocialLink }) => (
  <a key={social.name} href={social.url} target="_blank" rel="noopener noreferrer">
    <social.icon className="w-5 h-5 transition-colors fill-primary hover:fill-pink-600" />
  </a>
);

const Copyright = () => <p>Copyright © {new Date().getFullYear()}, Vortex. All rights reserved.</p>;

const PoweredBySatoshipay = () => (
  <div className="flex">
    <p className="mr-1 text-xs text-gray-500">Powered by</p>
    <a href="https://satoshipay.io" target="_blank" rel="noopener noreferrer" className="transition hover:opacity-80">
      <img src={SATOSHIPAY_LOGO} alt="Satoshipay" />
    </a>
  </div>
);

export function Footer() {
  return (
    <footer className="py-16 mx-6 sm:container sm:mx-auto">
      <div className="flex justify-between mb-4">
        <div>
          <img src={VORTEX_LOGO} alt="Vortex" />
          <div className="mt-6">
            <PoweredBySatoshipay />
          </div>
        </div>
        <div className="flex items-end">
          <div className="flex gap-4">
            {SOCIALS.map((social) => (
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
