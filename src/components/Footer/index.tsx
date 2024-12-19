import { ComponentType } from 'preact';
import { Telegram } from '../../assets/SocialsTelegram';
import { Github } from '../../assets/SocialsGithub';
import { X } from '../../assets/SocialsX';

import BlueLogo from '../../assets/logo/blue.svg';
import { PoweredBy } from '../PoweredBy';

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

const Copyright = () => (
  <div>
    <p>Copyright © {new Date().getFullYear()}, Vortex. </p>
    <p>All rights reserved.</p>
  </div>
);

export function Footer() {
  return (
    <footer className="items-end justify-between px-12 pt-12 pb-4 footer">
      <div className="flex flex-col gap-6">
        <img src={BlueLogo} alt="Vortex" className="h-8" />
        <Copyright />
        <div className="flex gap-4">
          {SOCIALS.map((social) => (
            <SocialIcon key={social.name} social={social} />
          ))}
        </div>
      </div>
      <PoweredBy />
    </footer>
  );
}
