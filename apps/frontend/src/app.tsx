import { ToastPopover } from './components/ToastPopover';
import 'react-toastify/dist/ReactToastify.css';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslations from './translations/en.json';
import ptTranslations from './translations/pt.json';

import '../App.css';
import { getLanguageFromPath, Language } from './translations/helpers';
import { Main } from './pages/main';

export function App() {
  const lng = getLanguageFromPath();

  i18n.use(initReactI18next).init({
    lng,
    fallbackLng: 'en',
    resources: {
      [Language.English]: {
        translation: enTranslations,
      },
      [Language.Portuguese_Brazil]: {
        translation: ptTranslations,
      },
    },
  });

  return (
    <>
      <Main />
      <ToastPopover />
      <div id="modals">
        {/* This is where the dialogs/modals are rendered. It is placed here because it is the highest point in the app where the tailwind data-theme is available */}
      </div>
    </>
  );
}
