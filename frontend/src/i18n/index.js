import english from "./en";
import { languageOptions, languagesForState, recommendedLanguage, stateLanguages } from "./stateLanguages";
import { createContext, createElement, useContext, useMemo, useState } from "react";

import hindi from "./hi";
import odia from "./od";
import telugu from "./te";
import kannada from "./kn";
import tamil from "./ta";
import malayalam from "./ml";
import marathi from "./mr";
import bengali from "./bn";
import gujarati from "./gu";
import punjabi from "./pa";
import assamese from "./as";
import nepali from "./ne";
import common from "./common";

const translations = { en: english, hi: hindi, or: odia, te: telugu, kn: kannada, ta: tamil, ml: malayalam, mr: marathi, bn: bengali, gu: gujarati, pa: punjabi, as: assamese, ne: nepali };
const LANGUAGE_STORAGE_KEY = "kisandirect_language";
const I18nContext = createContext(null);

export function availableLanguages() {
  return Object.keys(languageOptions);
}

export function getStoredLanguage() {
  return localStorage.getItem(LANGUAGE_STORAGE_KEY);
}

export function saveLanguage(language) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export function resolveLanguage({ savedLanguage, state }) {
  if (savedLanguage && languageOptions[savedLanguage]) return savedLanguage;
  return recommendedLanguage(state);
}

export function getTranslation(language, path) {
  const keys = path.split(".");
  const source = translations[language] || translations.en;
  const fallback = translations.en;
  let value = source;
  let fallbackValue = fallback;
  for (const key of keys) {
    value = value?.[key];
    fallbackValue = fallbackValue?.[key];
  }
  if (value !== undefined && value !== null) return value;
  const commonValue = path.split(".").reduce((current, key) => current?.[key], common[language]);
  const englishCommonValue = path.split(".").reduce((current, key) => current?.[key], common.en);
  return commonValue ?? englishCommonValue ?? fallbackValue ?? path;
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => getStoredLanguage() || "en");
  const setLanguage = (nextLanguage) => {
    const resolved = languageOptions[nextLanguage] ? nextLanguage : "en";
    saveLanguage(resolved);
    setLanguageState(resolved);
  };
  const value = useMemo(() => ({ language, setLanguage, t: (key) => getTranslation(language, key) }), [language]);
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  return useContext(I18nContext) || { language: "en", setLanguage: saveLanguage, t: (key) => getTranslation("en", key) };
}

export { languageOptions, languagesForState, recommendedLanguage, stateLanguages };
