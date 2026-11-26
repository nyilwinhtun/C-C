import { create } from "zustand"
import { persist } from "zustand/middleware"

export type Theme = "light" | "dark"
export type Language = "en" | "my"
export type AIProvider = "gemini" | "groq" | "openrouter"
export type ProviderMap = Record<AIProvider, string>

export function applyThemeToDocument(theme: Theme): void {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", theme === "dark")
  const themeColor = theme === "dark" ? "#18181B" : "#FAF8F5"
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", themeColor)
  })
}

export interface UIState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  activePageKey: string
  setActivePageKey: (key: string) => void
  language: Language
  setLanguage: (language: Language) => void
  // Auth
  user: { id: string; email: string } | null
  session: string | null
  setAuth: (user: { id: string; email: string } | null, session: string | null) => void
  signOut: () => void
  // BYOK (Bring Your Own Key) — isolated per provider
  aiProvider: AIProvider
  apiKeys: ProviderMap
  models: ProviderMap
  setAIProvider: (provider: AIProvider) => void
  setProviderApiKey: (provider: AIProvider, apiKey: string) => void
  setProviderModel: (provider: AIProvider, model: string) => void
}

const ENV_GEMINI_API_KEY =
  (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? ""
const ENV_OPENROUTER_API_KEY =
  (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined)?.trim() ?? ""

export const API_KEY_STORAGE_KEYS: Record<AIProvider, string> = {
  gemini: "cc_api_key_gemini",
  openrouter: "cc_api_key_openrouter",
  groq: "cc_api_key_groq",
}

const LEGACY_API_KEY_STORAGE_KEYS: Record<AIProvider, string> = {
  gemini: "gemini_api_key",
  openrouter: "openrouter_api_key",
  groq: "groq_api_key",
}

export const MODEL_STORAGE_KEYS: Record<AIProvider, string> = {
  gemini: "cc_model_gemini",
  openrouter: "cc_model_openrouter",
  groq: "cc_model_groq",
}

export const DEFAULT_MODELS: ProviderMap = {
  gemini: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "google/gemma-3-27b-it:free",
}

export function isValidGeminiApiKey(apiKey: string): boolean {
  const trimmed = apiKey.trim()
  if (trimmed.length < 20) return false
  return trimmed.startsWith("AIza") || trimmed.startsWith("AQ.")
}

function readLocalKey(storageKey: string): string {
  if (typeof window === "undefined") return ""
  try {
    return (window.localStorage.getItem(storageKey) ?? "").trim()
  } catch {
    return ""
  }
}

function writeLocalKey(storageKey: string, value: string): void {
  if (typeof window === "undefined") return
  try {
    const trimmed = value.trim()
    if (trimmed) {
      window.localStorage.setItem(storageKey, trimmed)
    } else {
      window.localStorage.removeItem(storageKey)
    }
  } catch {
    // Ignore storage quota/access errors
  }
}

const DEPRECATED_GEMINI_MODELS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-pro-vision",
  "gemini-3.5-flash-lite",
])

function migrateGeminiModel(model: string | undefined): string {
  const trimmed = model?.trim()
  if (!trimmed || DEPRECATED_GEMINI_MODELS.has(trimmed)) {
    return DEFAULT_MODELS.gemini
  }
  return trimmed
}

function migrateOpenRouterModel(model: string | undefined): string {
  if (!model || !model.trim() || model.trim() === "openrouter/auto") {
    return DEFAULT_MODELS.openrouter
  }
  return model.trim()
}

function resolveInitialApiKey(provider: AIProvider): string {
  const current = readLocalKey(API_KEY_STORAGE_KEYS[provider])
  if (current) return current

  const legacy = readLocalKey(LEGACY_API_KEY_STORAGE_KEYS[provider])
  if (legacy) {
    writeLocalKey(API_KEY_STORAGE_KEYS[provider], legacy)
    return legacy
  }

  if (provider === "gemini") return ENV_GEMINI_API_KEY
  if (provider === "openrouter") return ENV_OPENROUTER_API_KEY
  return ""
}

function resolveInitialModel(provider: AIProvider): string {
  const stored = readLocalKey(MODEL_STORAGE_KEYS[provider])
  if (provider === "gemini") {
    return migrateGeminiModel(stored)
  }
  if (provider === "openrouter") {
    return migrateOpenRouterModel(stored)
  }
  return stored || DEFAULT_MODELS[provider]
}

interface LegacyPersistedUIState extends Partial<UIState> {
  aiApiKey?: string
  geminiApiKey?: string
  openrouterApiKey?: string
  groqApiKey?: string
  aiModel?: string
}

function normalizePageKey(key: string): string {
  switch (key) {
    case "generator":
      return "text"
    case "photo-studio":
      return "studio"
    case "planner":
      return "vault"
    case "text":
    case "video":
    case "transcriber":
    case "voiceover":
    case "audiobook":
    case "autocut":
    case "studio":
    case "presenter3d":
    case "vault":
      return key
    default:
      return "text"
  }
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => {
        applyThemeToDocument(theme)
        set({ theme })
      },
      toggleTheme: () =>
        set((state) => {
          const nextTheme: Theme = state.theme === "light" ? "dark" : "light"
          applyThemeToDocument(nextTheme)
          return { theme: nextTheme }
        }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      activePageKey: "text",
      setActivePageKey: (activePageKey) => set({ activePageKey: normalizePageKey(activePageKey) }),
      language: "en",
      setLanguage: (language) => set({ language }),
      // Auth
      user: null,
      session: null,
      setAuth: (user, session) => set({ user, session }),
      signOut: () => set({ user: null, session: null }),
      // BYOK
      aiProvider: "gemini",
      apiKeys: {
        gemini: resolveInitialApiKey("gemini"),
        openrouter: resolveInitialApiKey("openrouter"),
        groq: resolveInitialApiKey("groq"),
      },
      models: {
        gemini: resolveInitialModel("gemini"),
        openrouter: resolveInitialModel("openrouter"),
        groq: resolveInitialModel("groq"),
      },
      setAIProvider: (provider) => set({ aiProvider: provider }),
      setProviderApiKey: (provider, apiKey) =>
        set((state) => {
          const trimmed = apiKey.trim()
          writeLocalKey(API_KEY_STORAGE_KEYS[provider], trimmed)
          return {
            apiKeys: {
              ...state.apiKeys,
              [provider]: trimmed,
            },
          }
        }),
      setProviderModel: (provider, model) =>
        set((state) => {
          const trimmed = model.trim() || DEFAULT_MODELS[provider]
          writeLocalKey(MODEL_STORAGE_KEYS[provider], trimmed)
          return {
            models: {
              ...state.models,
              [provider]: trimmed,
            },
          }
        }),
    }),
    {
      name: "content-creator-ui",
      partialize: (state) => ({
        theme: state.theme ?? "dark",
        sidebarCollapsed: state.sidebarCollapsed ?? false,
        language: state.language ?? "en",
        aiProvider: state.aiProvider ?? "gemini",
        models: {
          gemini: migrateGeminiModel(state.models?.gemini),
          openrouter: migrateOpenRouterModel(state.models?.openrouter),
          groq: state.models?.groq?.trim() || DEFAULT_MODELS.groq,
        },
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as LegacyPersistedUIState
        const provider = persisted.aiProvider ?? currentState.aiProvider

        const pickKey = (p: AIProvider, legacyField?: string): string => {
          const fromNewStorage = readLocalKey(API_KEY_STORAGE_KEYS[p])
          if (fromNewStorage) return fromNewStorage

          const fromLegacyStorage = readLocalKey(LEGACY_API_KEY_STORAGE_KEYS[p])
          if (fromLegacyStorage) {
            writeLocalKey(API_KEY_STORAGE_KEYS[p], fromLegacyStorage)
            return fromLegacyStorage
          }

          const fromPersistedMap = persisted.apiKeys?.[p]?.trim() ?? ""
          if (fromPersistedMap) {
            writeLocalKey(API_KEY_STORAGE_KEYS[p], fromPersistedMap)
            return fromPersistedMap
          }

          const fromLegacyField = legacyField?.trim() ?? ""
          if (fromLegacyField) {
            writeLocalKey(API_KEY_STORAGE_KEYS[p], fromLegacyField)
            return fromLegacyField
          }

          return ""
        }

        const apiKeys: ProviderMap = {
          gemini: pickKey("gemini", persisted.geminiApiKey),
          openrouter: pickKey("openrouter", persisted.openrouterApiKey),
          groq: pickKey("groq", persisted.groqApiKey),
        }

        // One-time migration from legacy single aiApiKey field if target slot is empty
        const legacySingleKey = persisted.aiApiKey?.trim() ?? ""
        if (legacySingleKey) {
          if (legacySingleKey.startsWith("sk-or-") && !apiKeys.openrouter) {
            apiKeys.openrouter = legacySingleKey
            writeLocalKey(API_KEY_STORAGE_KEYS.openrouter, legacySingleKey)
          } else if (legacySingleKey.startsWith("gsk_") && !apiKeys.groq) {
            apiKeys.groq = legacySingleKey
            writeLocalKey(API_KEY_STORAGE_KEYS.groq, legacySingleKey)
          } else if (
            (legacySingleKey.startsWith("AIza") || legacySingleKey.startsWith("AQ.")) &&
            !apiKeys.gemini
          ) {
            apiKeys.gemini = legacySingleKey
            writeLocalKey(API_KEY_STORAGE_KEYS.gemini, legacySingleKey)
          } else if (!apiKeys[provider]) {
            apiKeys[provider] = legacySingleKey
            writeLocalKey(API_KEY_STORAGE_KEYS[provider], legacySingleKey)
          }
        }

        if (!apiKeys.gemini && ENV_GEMINI_API_KEY) {
          apiKeys.gemini = ENV_GEMINI_API_KEY
        }
        if (!apiKeys.openrouter && ENV_OPENROUTER_API_KEY) {
          apiKeys.openrouter = ENV_OPENROUTER_API_KEY
        }

        const pickModel = (p: AIProvider): string => {
          const fromStorage = readLocalKey(MODEL_STORAGE_KEYS[p])
          const fromPersistedMap = persisted.models?.[p]?.trim() ?? ""
          const fromLegacySingle = p === provider ? (persisted.aiModel?.trim() ?? "") : ""
          const raw = fromStorage || fromPersistedMap || fromLegacySingle || DEFAULT_MODELS[p]
          const resolved =
            p === "gemini"
              ? migrateGeminiModel(raw)
              : p === "openrouter"
                ? migrateOpenRouterModel(raw)
                : raw
          writeLocalKey(MODEL_STORAGE_KEYS[p], resolved)
          return resolved
        }

        const models: ProviderMap = {
          gemini: pickModel("gemini"),
          openrouter: pickModel("openrouter"),
          groq: pickModel("groq"),
        }

        return {
          ...currentState,
          ...persisted,
          aiProvider: provider,
          apiKeys,
          models,
        }
      },
      onRehydrateStorage: () => (state) => {
        applyThemeToDocument(state?.theme ?? "dark")
        if (state && DEPRECATED_GEMINI_MODELS.has(state.models?.gemini ?? "")) {
          state.setProviderModel("gemini", DEFAULT_MODELS.gemini)
        }
        if (state && state.models?.openrouter === "openrouter/auto") {
          state.setProviderModel("openrouter", DEFAULT_MODELS.openrouter)
        }
      },
    }
  )
)
