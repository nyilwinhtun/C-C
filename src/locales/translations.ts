import en from "./en.json"
import my from "./my.json"

export type Locale = "en" | "my"

export const translations: Record<Locale, Record<string, string>> = {
  en,
  my,
}

export function t(locale: Locale, key: string, substitutions?: Record<string, string>): string {
  let result = translations[locale]?.[key] ?? translations.en[key] ?? key
  if (substitutions) {
    Object.entries(substitutions).forEach(([k, v]) => {
      result = result.split(`{${k}}`).join(v)
    })
  }
  return result
}
