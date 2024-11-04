import React, { createContext, useContext, useState } from 'react';

export type Language =
  | 'en'
  | 'fr'
  | 'de'
  | 'it'
  | 'es'
  | 'cs'
  | 'da'
  | 'nl'
  | 'fi'
  | 'id'
  | 'pl'
  | 'pt'
  | 'sv'
  | 'tr'
  | 'vi'
  | 'hu'
  | 'fil'
  | 'el'
  | 'ru'
  | 'ja'
  | 'ko'
  | 'hi'
  | 'zh'
  | 'ar'
  | 'fa';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
