import Telegram from '../../../assets/telegram.svg';
import { config } from '../../../config';

export const TelegramButton = () => (
  <a
    href={config.telegramUrl}
    target="_blank"
    rel="noreferrer"
    className="transition hover:scale-105 overflow-hidden relative fadein-button-animation flex my-6  border-telegram rounded-xl py-1.5 px-3 border"
  >
    <img src={Telegram} alt="Telegram" className="w-6 h-6" />
    <p className="ml-1 text-black">Telegram</p>
  </a>
);
