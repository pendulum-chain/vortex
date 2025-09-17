import type { Preview } from "@storybook/react-vite";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enTranslations from "../src/translations/en.json";
import { Language } from "../src/translations/helpers";
import ptTranslations from "../src/translations/pt.json";
import "../App.css";

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  lng: "en",
  resources: {
    [Language.English]: {
      translation: enTranslations
    },
    [Language.Portuguese_Brazil]: {
      translation: ptTranslations
    }
  }
});

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    }
  }
};

export default preview;
