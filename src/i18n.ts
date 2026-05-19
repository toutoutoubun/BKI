import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import af from '../locales/af.json';
import en from '../locales/en.json';
import fr from '../locales/fr.json';
import ja from '../locales/ja.json';

const storedLanguage = localStorage.getItem('bki.language');
const browserLanguage = navigator.language.slice(0, 2);

void i18n.use(initReactI18next).init({
  resources: {
    af: { translation: af },
    en: { translation: en },
    fr: { translation: fr },
    ja: { translation: ja },
  },
  lng: storedLanguage || browserLanguage,
  fallbackLng: 'ja',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
