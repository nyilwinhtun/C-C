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
  aiModel: string
  setAIProvider: (provider: AIProvider) => void
  setAIApiKey: (apiKey: string) => void
  setAIModel: (model: string) => void
}

const ENV_GEMINI_API_KEY =
  (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? ""

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
      aiApiKey: ENV_GEMINI_API_KEY,
      aiModel: DEFAULT_MODELS.gemini,
      setAIProvider: (provider) =>
        set(() => ({
          aiProvider: provider,
          aiModel: DEFAULT_MODELS[provider],
        })),
      setAIApiKey: (apiKey) => set({ aiApiKey: apiKey }),
      setAIModel: (model) => set({ aiModel: model }),
    }),
    {
      name: "content-creator-ui",
      partialize: (state) => ({
        theme: state.theme ?? "dark",
        sidebarCollapsed: state.sidebarCollapsed ?? false,
        language: state.language ?? "en",
        aiProvider: state.aiProvider ?? "gemini",
        aiApiKey: state.aiApiKey ?? "",
        aiModel: migrateGeminiModel(state.aiModel, state.aiProvider ?? "gemini"),
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<UIState>
        const provider = persisted.aiProvider ?? currentState.aiProvider
        const apiKey =
          persisted.aiApiKey ||
          (provider === "gemini" ? ENV_GEMINI_API_KEY : "") ||
          currentState.aiApiKey
        return {
          ...currentState,
          ...persisted,
          aiProvider: provider,
          aiApiKey: apiKey,
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
