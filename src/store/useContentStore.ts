import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { GeneratorFormValues } from "@/features/generator/schema"
import { supabase } from "@/lib/supabase"
import { useUIStore } from "./useUIStore"

export interface GeneratedItem {
  id: string
  topic: string
  platform: string
  contentType: string
  tone: string
  content: string
  createdAt: string
}

export interface SavedVaultItem {
  id: string
  title: string
  content: string
  platform: string
  tags: string[]
  status: "idea" | "draft" | "scheduled" | "posted"
  scheduledDate?: string
}

export interface ContentBackupData {
  version?: number
  exportedAt?: string
  brandSignature?: string
  savedVault?: SavedVaultItem[]
  generatedHistory?: GeneratedItem[]
}

export interface PosterDraft {
  headline: string
  spec1: string
  spec2: string
  spec3: string
  caption: string
}

interface ContentState {
  draftInput: GeneratorFormValues
  generatedHistory: GeneratedItem[]
  savedVault: SavedVaultItem[]
  brandSignature: string
  posterDraft: PosterDraft | null
  isSyncing: boolean
  setDraftInput: (input: Partial<GeneratorFormValues>) => void
  addGeneratedItem: (item: Omit<GeneratedItem, "id" | "createdAt">) => void
  setBrandSignature: (signature: string) => void
  setPosterDraft: (draft: PosterDraft | null) => void
  saveToVault: (
    item: Omit<SavedVaultItem, "id" | "status"> & {
      status?: SavedVaultItem["status"]
      scheduledDate?: string
    }
  ) => void
  updateVaultItem: (id: string, updates: Partial<SavedVaultItem>) => void
  deleteVaultItem: (id: string) => void
  importBackup: (data: ContentBackupData) => void
  loadVaultFromSupabase: () => Promise<void>
  setUserId: (userId: string | null) => void
}

const defaultDraft: GeneratorFormValues = {
  topic: "",
  platform: "instagram",
  contentType: "post_caption",
  tone: "engaging",
  language: "english",
  includeHashtags: true,
}

export const useContentStore = create<ContentState>()(
  persist(
    (set) => ({
      draftInput: defaultDraft,
      generatedHistory: [],
      savedVault: [],
      brandSignature: "",
      posterDraft: null,
      isSyncing: false,

      setDraftInput: (input) =>
        set((state) => ({
          draftInput: { ...state.draftInput, ...input },
        })),

      addGeneratedItem: (item) =>
        set((state) => {
          const entry: GeneratedItem = {
            ...item,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          }
          const normalizedContent = item.content.trim()
          const deduped = state.generatedHistory.filter(
            (existing) => existing.content.trim() !== normalizedContent
          )
          return { generatedHistory: [entry, ...deduped].slice(0, 10) }
        }),

      setBrandSignature: (brandSignature) => set({ brandSignature }),
      setPosterDraft: (posterDraft) => set({ posterDraft }),

      saveToVault: (item) =>
        set((state) => {
          const entry: SavedVaultItem = {
            ...item,
            id: crypto.randomUUID(),
            status: item.status ?? (item.scheduledDate ? "scheduled" : "idea"),
          }
          const next = { savedVault: [entry, ...state.savedVault] }
          void syncVaultItemToSupabase(entry)
          return next
        }),

      updateVaultItem: (id, updates) =>
        set((state) => ({
          savedVault: state.savedVault.map((v) =>
            v.id === id ? { ...v, ...updates } : v
          ),
        })),
      deleteVaultItem: (id) =>
        set((state) => {
          const next = {
            savedVault: state.savedVault.filter((v) => v.id !== id),
          }
          void deleteVaultItemFromSupabase(id)
          return next
        }),

      importBackup: (data) =>
        set((state) => ({
          brandSignature:
            typeof data.brandSignature === "string"
              ? data.brandSignature
              : state.brandSignature,
          savedVault: Array.isArray(data.savedVault)
            ? data.savedVault.map((item) => ({
                id: item.id || crypto.randomUUID(),
                title: String(item.title ?? ""),
                content: String(item.content ?? ""),
                platform: String(item.platform ?? "instagram"),
                tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
                status:
                  item.status === "idea" ||
                  item.status === "draft" ||
                  item.status === "scheduled" ||
                  item.status === "posted"
                    ? item.status
                    : item.scheduledDate
                      ? "scheduled"
                      : "idea",
                scheduledDate: item.scheduledDate || undefined,
              }))
            : state.savedVault,
          generatedHistory: Array.isArray(data.generatedHistory)
            ? data.generatedHistory.slice(0, 10)
            : state.generatedHistory,
        })),

      loadVaultFromSupabase: async () => {
        const { user } = useUIStore.getState()
        if (!user) return
        set({ isSyncing: true })
        try {
          const { data, error } = (await supabase
            .from("vault_items")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })) as any

          if (error) throw error

          const vault: SavedVaultItem[] =
            (data ?? []).map((row: any) => ({
              id: row.id,
              title: row.title,
              content: row.content,
              platform: row.platform,
              tags: row.tags ?? [],
              status: row.status as SavedVaultItem["status"],
              scheduledDate: row.scheduled_date,
            })) ?? []
          set({ savedVault: vault, isSyncing: false })
        } catch (err) {
          console.error("Failed to load vault from Supabase", err)
          set({ isSyncing: false })
        }
      },

      setUserId: (userId: string | null) => {
        // No-op kept for compatibility; auth state lives in useUIStore.
        void userId
      },
    }),
    {
      name: "content-creator-content",
      partialize: (state) => ({
        draftInput: state.draftInput ?? defaultDraft,
        generatedHistory: (state.generatedHistory ?? []).slice(0, 10),
        savedVault: state.savedVault ?? [],
        brandSignature: state.brandSignature ?? "",
      }),
    }
  )
)

async function syncVaultItemToSupabase(item: SavedVaultItem): Promise<void> {
  const { user } = useUIStore.getState()
  if (!user) return
  try {
    const { error } = (await supabase.from("vault_items").insert({
      id: item.id,
      user_id: user.id,
      title: item.title,
      content: item.content,
      platform: item.platform,
      tags: item.tags,
      status: item.status,
      scheduled_date: item.scheduledDate ?? null,
    } as any)) as any
    if (error) throw error
  } catch (err) {
    console.error("Failed to sync vault item to Supabase", err)
  }
}

async function deleteVaultItemFromSupabase(id: string): Promise<void> {
  const { user } = useUIStore.getState()
  if (!user) return
  try {
    const { error } = await supabase.from("vault_items").delete().eq("id", id)
    if (error) throw error
  } catch (err) {
    console.error("Failed to delete vault item from Supabase", err)
  }
}
