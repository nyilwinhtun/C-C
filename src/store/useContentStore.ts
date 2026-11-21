import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { GeneratorFormValues } from "@/features/generator/schema"
import type {
  GeneratedContent,
  VideoContentResult,
  VideoPlatformOption,
} from "@/api/aiService"
import {
  normalizeBusinessCategory,
  normalizeSalesAngle,
  type BusinessCategory,
} from "@/types"
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

export interface AudioSessionItem {
  id: string
  script: string
  voiceLabel: string
  mode: "single" | "dialogue" | "recorded"
  durationSeconds: number
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
  businessCategory?: BusinessCategory
  customNiche?: string
  autoAppendShopCta?: boolean
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

export interface CustomPronunciation {
  id: string
  word: string
  phonetic: string
}

export type EditorialFormat =
  | "fb_sales"
  | "tiktok_script"
  | "product_review"
  | "personal_story"

export type EditorialTone =
  | "warm_friend"
  | "calm_clear"
  | "light_humorous"

export type EditorialLength = "short" | "medium" | "detailed"

export type MicFilterMode = "raw" | "light"

export interface ShopProfile {
  name: string
  phone: string
  address: string
  autoAppend: boolean
}

export interface EditorialResult {
  id: string
  topic: string
  format: EditorialFormat
  optionA: string
  optionB: string
  activeOption: "A" | "B"
  hooks?: string[]
  createdAt: string
}

export interface UploadedPhotoItem {
  id: string
  file: File
  previewUrl: string
}

interface ContentState {
  draftInput: GeneratorFormValues
  textPostResult: GeneratedContent | null
  generatedHistory: GeneratedItem[]
  audioHistory: AudioSessionItem[]
  savedVault: SavedVaultItem[]
  brandSignature: string
  businessCategory: BusinessCategory
  customNiche: string
  autoAppendShopCta: boolean
  shopLogoDataUrl: string | null
  posterDraft: PosterDraft | null
  uploadedVideoFile: File | null
  videoPreviewUrl: string | null
  uploadedPhotos: UploadedPhotoItem[]
  videoProductNote: string
  videoPlatform: VideoPlatformOption
  videoOutputLanguage: "en" | "my"
  videoDurationSeconds: number | null
  generatedVideoResult: VideoContentResult | null
  voiceoverDraftScript: string
  customPronunciations: CustomPronunciation[]
  voiceDnaSamples: string[]
  shopProfile: ShopProfile
  editorialTone: EditorialTone
  editorialLength: EditorialLength
  editorialFormat: EditorialFormat
  editorialResult: EditorialResult | null
  micFilterMode: MicFilterMode
  isSyncing: boolean
  setDraftInput: (input: Partial<GeneratorFormValues>) => void
  setTextPostResult: (result: GeneratedContent | null) => void
  clearTextPostDraft: () => void
  addGeneratedItem: (item: Omit<GeneratedItem, "id" | "createdAt">) => void
  addAudioSession: (item: Omit<AudioSessionItem, "id" | "createdAt">) => void
  deleteAudioSession: (id: string) => void
  setBrandSignature: (signature: string) => void
  setBusinessCategory: (category: BusinessCategory) => void
  setCustomNiche: (niche: string) => void
  setAutoAppendShopCta: (enabled: boolean) => void
  setShopLogoDataUrl: (dataUrl: string | null) => void
  setPosterDraft: (draft: PosterDraft | null) => void
  setUploadedVideo: (file: File | null, previewUrl: string | null) => void
  setUploadedPhotos: (photos: UploadedPhotoItem[]) => void
  clearUploadedPhotos: () => void
  setVideoProductNote: (note: string) => void
  setVideoPlatform: (platform: VideoPlatformOption) => void
  setVideoOutputLanguage: (lang: "en" | "my") => void
  setVideoDurationSeconds: (duration: number | null) => void
  setGeneratedVideoResult: (result: VideoContentResult | null) => void
  setVoiceoverDraftScript: (script: string) => void
  addCustomPronunciation: (word: string, phonetic: string) => void
  removeCustomPronunciation: (id: string) => void
  setVoiceDnaSamples: (samples: string[]) => void
  setShopProfile: (updates: Partial<ShopProfile>) => void
  setEditorialTone: (tone: EditorialTone) => void
  setEditorialLength: (length: EditorialLength) => void
  setEditorialFormat: (format: EditorialFormat) => void
  setEditorialResult: (result: EditorialResult | null) => void
  clearEditorialResult: () => void
  setMicFilterMode: (mode: MicFilterMode) => void
  clearUploadedVideo: () => void
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
  salesAngle: "viral_story",
  language: "english",
  includeHashtags: true,
  targetDurationSeconds: 15,
}

export const useContentStore = create<ContentState>()(
  persist(
    (set) => ({
      draftInput: defaultDraft,
      textPostResult: null,
      generatedHistory: [],
      audioHistory: [],
      savedVault: [],
      brandSignature: "",
      businessCategory: "general",
      customNiche: "",
      autoAppendShopCta: false,
      shopLogoDataUrl: null,
      posterDraft: null,
      uploadedVideoFile: null,
      videoPreviewUrl: null,
      uploadedPhotos: [],
      videoProductNote: "",
      videoPlatform: "TikTok / Reels",
      videoOutputLanguage: "my",
      videoDurationSeconds: null,
      generatedVideoResult: null,
      voiceoverDraftScript: "",
      customPronunciations: [],
      voiceDnaSamples: ["", "", ""],
      shopProfile: {
        name: "",
        phone: "",
        address: "",
        autoAppend: false,
      },
      editorialTone: "warm_friend",
      editorialLength: "medium",
      editorialFormat: "fb_sales",
      editorialResult: null,
      micFilterMode: "raw",
      isSyncing: false,

      setDraftInput: (input) =>
        set((state) => ({
          draftInput: { ...state.draftInput, ...input },
        })),
      setTextPostResult: (textPostResult) => set({ textPostResult }),
      clearTextPostDraft: () =>
        set({
          draftInput: defaultDraft,
          textPostResult: null,
        }),

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

      addAudioSession: (item) =>
        set((state) => {
          const entry: AudioSessionItem = {
            ...item,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          }
          const normalized = item.script.trim()
          const deduped = state.audioHistory.filter(
            (existing) => existing.script.trim() !== normalized
          )
          return { audioHistory: [entry, ...deduped].slice(0, 15) }
        }),

      deleteAudioSession: (id) =>
        set((state) => ({
          audioHistory: state.audioHistory.filter((item) => item.id !== id),
        })),

      setBrandSignature: (brandSignature) => set({ brandSignature }),
      setBusinessCategory: (businessCategory) => set({ businessCategory }),
      setCustomNiche: (customNiche) => set({ customNiche }),
      setAutoAppendShopCta: (autoAppendShopCta) => set({ autoAppendShopCta }),
      setShopLogoDataUrl: (shopLogoDataUrl) => set({ shopLogoDataUrl }),
      setPosterDraft: (posterDraft) => set({ posterDraft }),
      setUploadedVideo: (file, previewUrl) =>
        set((state) => {
          if (state.videoPreviewUrl && state.videoPreviewUrl !== previewUrl) {
            URL.revokeObjectURL(state.videoPreviewUrl)
          }
          return { uploadedVideoFile: file, videoPreviewUrl: previewUrl }
        }),
      setUploadedPhotos: (photos) =>
        set((state) => {
          const nextUrls = new Set(photos.map((p) => p.previewUrl))
          for (const old of state.uploadedPhotos) {
            if (!nextUrls.has(old.previewUrl)) {
              URL.revokeObjectURL(old.previewUrl)
            }
          }
          return { uploadedPhotos: photos }
        }),
      clearUploadedPhotos: () =>
        set((state) => {
          for (const old of state.uploadedPhotos) {
            URL.revokeObjectURL(old.previewUrl)
          }
          return { uploadedPhotos: [] }
        }),
      setVideoProductNote: (videoProductNote) => set({ videoProductNote }),
      setVideoPlatform: (videoPlatform) => set({ videoPlatform }),
      setVideoOutputLanguage: (videoOutputLanguage) => set({ videoOutputLanguage }),
      setVideoDurationSeconds: (videoDurationSeconds) => set({ videoDurationSeconds }),
      setGeneratedVideoResult: (generatedVideoResult) =>
        set({ generatedVideoResult }),
      setVoiceoverDraftScript: (voiceoverDraftScript) => set({ voiceoverDraftScript }),
      setVoiceDnaSamples: (voiceDnaSamples) =>
        set({ voiceDnaSamples: voiceDnaSamples.slice(0, 3) }),
      setShopProfile: (updates) =>
        set((state) => ({
          shopProfile: { ...state.shopProfile, ...updates },
        })),
      setEditorialTone: (editorialTone) => set({ editorialTone }),
      setEditorialLength: (editorialLength) => set({ editorialLength }),
      setEditorialFormat: (editorialFormat) => set({ editorialFormat }),
      setEditorialResult: (editorialResult) => set({ editorialResult }),
      clearEditorialResult: () => set({ editorialResult: null }),
      setMicFilterMode: (micFilterMode) => set({ micFilterMode }),
      addCustomPronunciation: (word, phonetic) =>
        set((state) => {
          const cleanWord = word.trim()
          const cleanPhonetic = phonetic.trim()
          if (!cleanWord || !cleanPhonetic) return state
          const filtered = state.customPronunciations.filter(
            (item) => item.word.toLowerCase() !== cleanWord.toLowerCase()
          )
          return {
            customPronunciations: [
              { id: crypto.randomUUID(), word: cleanWord, phonetic: cleanPhonetic },
              ...filtered,
            ],
          }
        }),
      removeCustomPronunciation: (id) =>
        set((state) => ({
          customPronunciations: state.customPronunciations.filter((item) => item.id !== id),
        })),
      clearUploadedVideo: () =>
        set((state) => {
          if (state.videoPreviewUrl) {
            URL.revokeObjectURL(state.videoPreviewUrl)
          }
          return {
            uploadedVideoFile: null,
            videoPreviewUrl: null,
            videoDurationSeconds: null,
            generatedVideoResult: null,
          }
        }),

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
        set((state) => {
          let updatedItem: SavedVaultItem | undefined
          const savedVault = state.savedVault.map((v) => {
            if (v.id === id) {
              updatedItem = { ...v, ...updates }
              return updatedItem
            }
            return v
          })
          if (updatedItem) {
            void updateVaultItemInSupabase(updatedItem)
          }
          return { savedVault }
        }),
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
          businessCategory:
            data.businessCategory
              ? normalizeBusinessCategory(data.businessCategory)
              : state.businessCategory,
          customNiche:
            typeof data.customNiche === "string"
              ? data.customNiche
              : state.customNiche,
          autoAppendShopCta:
            typeof data.autoAppendShopCta === "boolean"
              ? data.autoAppendShopCta
              : state.autoAppendShopCta,
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
        textPostResult: state.textPostResult ?? null,
        generatedHistory: (state.generatedHistory ?? []).slice(0, 10),
        audioHistory: (state.audioHistory ?? []).slice(0, 15),
        savedVault: state.savedVault ?? [],
        brandSignature: state.brandSignature ?? "",
        businessCategory: state.businessCategory ?? "general",
        customNiche: state.customNiche ?? "",
        autoAppendShopCta: state.autoAppendShopCta ?? false,
        shopLogoDataUrl: state.shopLogoDataUrl ?? null,
        videoProductNote: state.videoProductNote ?? "",
        videoPlatform: state.videoPlatform ?? "TikTok / Reels",
        videoOutputLanguage: state.videoOutputLanguage ?? "my",
        videoDurationSeconds: state.videoDurationSeconds ?? null,
        generatedVideoResult: state.generatedVideoResult ?? null,
        customPronunciations: state.customPronunciations ?? [],
        voiceDnaSamples: state.voiceDnaSamples ?? ["", "", ""],
        shopProfile: state.shopProfile ?? {
          name: "",
          phone: "",
          address: "",
          autoAppend: false,
        },
        editorialTone: state.editorialTone ?? "warm_friend",
        editorialLength: state.editorialLength ?? "medium",
        editorialFormat: state.editorialFormat ?? "fb_sales",
        editorialResult: state.editorialResult ?? null,
        micFilterMode: state.micFilterMode ?? "raw",
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<ContentState> | undefined) ?? {}
        const normalizedCat = normalizeBusinessCategory(persisted.businessCategory)
        const normalizedDraft: GeneratorFormValues = {
          ...defaultDraft,
          ...(persisted.draftInput ?? {}),
          salesAngle: normalizeSalesAngle(persisted.draftInput?.salesAngle),
        }
        return {
          ...currentState,
          ...persisted,
          businessCategory: normalizedCat,
          customNiche: typeof persisted.customNiche === "string" ? persisted.customNiche : "",
          autoAppendShopCta:
            typeof persisted.autoAppendShopCta === "boolean"
              ? normalizedCat === "online_shop"
                ? persisted.autoAppendShopCta
                : false
              : normalizedCat === "online_shop",
          draftInput: normalizedDraft,
        }
      },
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

async function updateVaultItemInSupabase(item: SavedVaultItem): Promise<void> {
  const { user } = useUIStore.getState()
  if (!user) return
  try {
    const { error } = (await (supabase.from("vault_items") as any)
      .update({
        title: item.title,
        content: item.content,
        platform: item.platform,
        tags: item.tags,
        status: item.status,
        scheduled_date: item.scheduledDate ?? null,
      })
      .eq("id", item.id)) as any
    if (error) throw error
  } catch (err) {
    console.error("Failed to update vault item in Supabase", err)
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
