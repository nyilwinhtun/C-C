import { create } from "zustand"
import { persist } from "zustand/middleware"

export type Theme = "light" | "dark"
export type Language = "en" | "my"
export type AIProvider = "gemini" | "groq" | "openrouter"

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
  // BYOK (Bring Your Own Key)
  aiProvider: AIProvider
  aiApiKey: string
  geminiApiKey: string
  openrouterApiKey: string
  groqApiKey: string
  aiModel: string
  setAIProvider: (provider: AIProvider) => void
  setAIApiKey: (apiKey: string) => void
  setGeminiApiKey: (apiKey: string) => void
  setOpenrouterApiKey: (apiKey: string) => void
  setGroqApiKey: (apiKey: string) => void
  setAIModel: (model: string) => void
}

const ENV_GEMINI_API_KEY =
  (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? ""
const ENV_OPENROUTER_API_KEY =
  (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined)?.trim() ?? ""

const PROVIDER_STORAGE_KEYS: Record<AIProvider, string> = {
  gemini: "gemini_api_key",
  openrouter: "openrouter_api_key",
  groq: "groq_api_key",
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

function getKeyForProvider(
  provider: AIProvider,
  keys: { geminiApiKey: string; openrouterApiKey: string; groqApiKey: string }
): string {
  if (provider === "gemini") return keys.geminiApiKey
  if (provider === "openrouter") return keys.openrouterApiKey
  return keys.groqApiKey
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: "gemini-3.5-flash-lite",
  groq: "llama-3.3-70b-versatile",
  openrouter: "openrouter/auto",
}

function migrateGeminiModel(model: string | undefined, provider: AIProvider): string {
  if (!model || model === "gemini-2.5-flash-lite") {
    return provider === "gemini" ? "gemini-3.5-flash-lite" : DEFAULT_MODELS[provider]
  }
  return model
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      activePageKey: "generator",
      setActivePageKey: (activePageKey) => set({ activePageKey }),
      language: "en",
      setLanguage: (language) => set({ language }),
      // Auth
      user: null,
      session: null,
      setAuth: (user, session) => set({ user, session }),
      signOut: () => set({ user: null, session: null }),
      // BYOK
      aiProvider: "gemini",
      aiApiKey: readLocalKey(PROVIDER_STORAGE_KEYS.gemini) || ENV_GEMINI_API_KEY,
      geminiApiKey: readLocalKey(PROVIDER_STORAGE_KEYS.gemini) || ENV_GEMINI_API_KEY,
      openrouterApiKey: readLocalKey(PROVIDER_STORAGE_KEYS.openrouter) || ENV_OPENROUTER_API_KEY,
      groqApiKey: readLocalKey(PROVIDER_STORAGE_KEYS.groq),
      aiModel: DEFAULT_MODELS.gemini,
      setAIProvider: (provider) =>
        set((state) => ({
          aiProvider: provider,
          aiModel: DEFAULT_MODELS[provider],
          aiApiKey: getKeyForProvider(provider, state),
        })),
      setAIApiKey: (apiKey) =>
        set((state) => {
          const trimmed = apiKey.trim()
          writeLocalKey(PROVIDER_STORAGE_KEYS[state.aiProvider], trimmed)
          if (state.aiProvider === "gemini") {
            return { geminiApiKey: trimmed, aiApiKey: trimmed }
          }
          if (state.aiProvider === "openrouter") {
            return { openrouterApiKey: trimmed, aiApiKey: trimmed }
          }
          return { groqApiKey: trimmed, aiApiKey: trimmed }
        }),
      setGeminiApiKey: (apiKey) =>
        set((state) => {
          const trimmed = apiKey.trim()
          writeLocalKey(PROVIDER_STORAGE_KEYS.gemini, trimmed)
          return {
            geminiApiKey: trimmed,
            aiApiKey: state.aiProvider === "gemini" ? trimmed : state.aiApiKey,
          }
        }),
      setOpenrouterApiKey: (apiKey) =>
        set((state) => {
          const trimmed = apiKey.trim()
          writeLocalKey(PROVIDER_STORAGE_KEYS.openrouter, trimmed)
          return {
            openrouterApiKey: trimmed,
            aiApiKey: state.aiProvider === "openrouter" ? trimmed : state.aiApiKey,
          }
        }),
      setGroqApiKey: (apiKey) =>
        set((state) => {
          const trimmed = apiKey.trim()
          writeLocalKey(PROVIDER_STORAGE_KEYS.groq, trimmed)
          return {
            groqApiKey: trimmed,
            aiApiKey: state.aiProvider === "groq" ? trimmed : state.aiApiKey,
          }
        }),
      setAIModel: (model) => set({ aiModel: model }),
    }),
    {
      name: "content-creator-ui",
      partialize: (state) => ({
        theme: state.theme ?? "dark",
        sidebarCollapsed: state.sidebarCollapsed ?? false,
        language: state.language ?? "en",
        aiProvider: state.aiProvider ?? "gemini",
        aiModel: migrateGeminiModel(state.aiModel, state.aiProvider ?? "gemini"),
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<UIState>
        const provider = persisted.aiProvider ?? currentState.aiProvider

        let geminiApiKey =
          readLocalKey(PROVIDER_STORAGE_KEYS.gemini) ||
          persisted.geminiApiKey?.trim() ||
          ""
        let openrouterApiKey =
          readLocalKey(PROVIDER_STORAGE_KEYS.openrouter) ||
          persisted.openrouterApiKey?.trim() ||
          ""
        let groqApiKey =
          readLocalKey(PROVIDER_STORAGE_KEYS.groq) ||
          persisted.groqApiKey?.trim() ||
          ""

        // One-time migration from legacy single aiApiKey field if separate keys are empty
        const legacyKey = persisted.aiApiKey?.trim() ?? ""
        if (legacyKey) {
          if (legacyKey.startsWith("sk-or-") && !openrouterApiKey) {
            openrouterApiKey = legacyKey
            writeLocalKey(PROVIDER_STORAGE_KEYS.openrouter, legacyKey)
          } else if (legacyKey.startsWith("gsk_") && !groqApiKey) {
            groqApiKey = legacyKey
            writeLocalKey(PROVIDER_STORAGE_KEYS.groq, legacyKey)
          } else if (provider === "gemini" && !geminiApiKey) {
            geminiApiKey = legacyKey
            writeLocalKey(PROVIDER_STORAGE_KEYS.gemini, legacyKey)
          } else if (provider === "openrouter" && !openrouterApiKey) {
            openrouterApiKey = legacyKey
            writeLocalKey(PROVIDER_STORAGE_KEYS.openrouter, legacyKey)
          } else if (provider === "groq" && !groqApiKey) {
            groqApiKey = legacyKey
            writeLocalKey(PROVIDER_STORAGE_KEYS.groq, legacyKey)
          }
        }

        if (!geminiApiKey && ENV_GEMINI_API_KEY) {
          geminiApiKey = ENV_GEMINI_API_KEY
        }
        if (!openrouterApiKey && ENV_OPENROUTER_API_KEY) {
          openrouterApiKey = ENV_OPENROUTER_API_KEY
        }

        const aiApiKey = getKeyForProvider(provider, {
          geminiApiKey,
          openrouterApiKey,
          groqApiKey,
        })

        return {
          ...currentState,
          ...persisted,
          aiProvider: provider,
          aiApiKey,
          geminiApiKey,
          openrouterApiKey,
          groqApiKey,
          aiModel: migrateGeminiModel(persisted.aiModel, provider),
        }
      },
      onRehydrateStorage: () => (state) => {
        if (state && state.aiModel === "gemini-2.5-flash-lite") {
          state.setAIModel("gemini-3.5-flash-lite")
        }
      },
    }
  )
)
