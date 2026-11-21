import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { GeneratorFormValues } from "@/features/generator/schema"
import {
  extractCleanUnicodeFromPdfImages,
  extractTextFromDocument,
  rewriteChapterAsRecap,
  type GeneratedContent,
  type VideoContentResult,
  type VideoPlatformOption,
} from "@/api/aiService"
import { renderPdfPagesToImages } from "@/lib/pdfVision"
import {
  normalizeBusinessCategory,
  normalizeSalesAngle,
  type BusinessCategory,
} from "@/types"
import { supabase } from "@/lib/supabase"
import { useUIStore } from "./useUIStore"
import {
  cleanVoiceoverText,
  generateBurmeseDialogueVoiceover,
  generateBurmeseVoiceover,
  mixVoiceoverWithAutoDuckingMusic,
  type BurmeseVoiceType,
  type VoiceoverSpeed,
} from "@/api/ttsService"
import { playBlobUrlWithPrimedAudio } from "@/lib/iosAudio"
import type { BackgroundMusicPreset } from "@/lib/videoAudioMerger"
import { toast } from "@/components/ui/sonner"

export type StudioVoiceChoice = "self" | "nilar" | "thiha"
export type TtsStatus = "idle" | "preparing" | "generating" | "done" | "error"
export type PdfReadingMode = "direct" | "recap"
export type PdfExtractionStatus = "idle" | "extracting" | "rewriting" | "error"
export interface TtsProgress {
  current: number
  total: number
}

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
  voiceScriptText: string
  selectedVoice: StudioVoiceChoice
  voiceSpeed: VoiceoverSpeed
  voiceDialogueMode: boolean
  voiceMusicPreset: BackgroundMusicPreset
  voiceCustomMusicFile: File | null
  ttsStatus: TtsStatus
  ttsProgress: TtsProgress | null
  ttsError: string | null
  pdfReadingMode: PdfReadingMode
  pdfExtractionStatus: PdfExtractionStatus
  pdfExtractionError: string | null
  generatedAudioUrl: string | null
  generatedAudioBlob: Blob | null
  generatedAudioMimeType: string
  generatedAudioExtension: string
  generatedAudioDuration: number
  generatedAudioTitle: string
  generatedAudioSource: "my_voice" | "narrator" | null
  selfRecordedBlob: Blob | null
  selfRecordedMimeType: string
  selfRecordedNeedsTranscribe: boolean
  customPronunciations: CustomPronunciation[]
  voiceDnaSamples: string[]
  shopProfile: ShopProfile
  editorialTone: EditorialTone
  editorialLength: EditorialLength
  editorialFormat: EditorialFormat
  editorialResult: EditorialResult | null
  micFilterMode: MicFilterMode
  liveModeEnabled: boolean
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
  setVoiceScriptText: (script: string) => void
  setVoiceoverDraftScript: (script: string) => void
  setSelectedVoice: (voice: StudioVoiceChoice) => void
  setVoiceSpeed: (speed: VoiceoverSpeed) => void
  setVoiceDialogueMode: (enabled: boolean) => void
  setVoiceMusicPreset: (preset: BackgroundMusicPreset) => void
  setVoiceCustomMusicFile: (file: File | null) => void
  setSelfRecordedNeedsTranscribe: (needs: boolean) => void
  setStudioSelfAudio: (params: {
    audioUrl: string
    blob: Blob
    rawBlob: Blob
    mimeType: string
    fileExtension: string
    durationSeconds: number
    title: string
  }) => void
  generateStudioVoiceover: (
    scriptOverride?: string,
    options?: { useAiSpeechPrep?: boolean; customTitle?: string }
  ) => Promise<void>
  setPdfReadingMode: (mode: PdfReadingMode) => void
  extractAndReadPdfStory: (params: {
    file: File
    startPage: number
    endPage: number
    mode: PdfReadingMode
  }) => Promise<boolean>
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
  setLiveModeEnabled: (enabled: boolean) => void
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
    (set, get) => ({
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
      voiceScriptText: "",
      selectedVoice: "self",
      voiceSpeed: 1.0,
      voiceDialogueMode: false,
      voiceMusicPreset: "none",
      voiceCustomMusicFile: null,
      ttsStatus: "idle",
      ttsProgress: null,
      ttsError: null,
      pdfReadingMode: "direct",
      pdfExtractionStatus: "idle",
      pdfExtractionError: null,
      generatedAudioUrl: null,
      generatedAudioBlob: null,
      generatedAudioMimeType: "audio/wav",
      generatedAudioExtension: "wav",
      generatedAudioDuration: 0,
      generatedAudioTitle: "",
      generatedAudioSource: null,
      selfRecordedBlob: null,
      selfRecordedMimeType: "audio/wav",
      selfRecordedNeedsTranscribe: false,
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
      liveModeEnabled: false,
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
      setVoiceScriptText: (voiceScriptText) => set({ voiceScriptText }),
      setVoiceoverDraftScript: (voiceScriptText) => set({ voiceScriptText }),
      setSelectedVoice: (selectedVoice) => set({ selectedVoice }),
      setVoiceSpeed: (voiceSpeed) => set({ voiceSpeed }),
      setVoiceDialogueMode: (voiceDialogueMode) => set({ voiceDialogueMode }),
      setVoiceMusicPreset: (voiceMusicPreset) => set({ voiceMusicPreset }),
      setVoiceCustomMusicFile: (voiceCustomMusicFile) => set({ voiceCustomMusicFile }),
      setSelfRecordedNeedsTranscribe: (selfRecordedNeedsTranscribe) =>
        set({ selfRecordedNeedsTranscribe }),
      setStudioSelfAudio: (params) =>
        set((state) => {
          if (state.generatedAudioUrl && state.generatedAudioUrl !== params.audioUrl) {
            URL.revokeObjectURL(state.generatedAudioUrl)
          }
          return {
            generatedAudioUrl: params.audioUrl,
            generatedAudioBlob: params.blob,
            generatedAudioMimeType: params.mimeType,
            generatedAudioExtension: params.fileExtension,
            generatedAudioDuration: params.durationSeconds,
            generatedAudioTitle: params.title,
            generatedAudioSource: "my_voice",
            selfRecordedBlob: params.rawBlob,
            selfRecordedMimeType: params.mimeType,
            selfRecordedNeedsTranscribe: true,
            ttsStatus: "done",
            ttsProgress: null,
            ttsError: null,
          }
        }),
      setPdfReadingMode: (pdfReadingMode) => set({ pdfReadingMode }),
      extractAndReadPdfStory: async ({ file, startPage, endPage, mode }) => {
        const state = get()
        if (
          state.pdfExtractionStatus === "extracting" ||
          state.pdfExtractionStatus === "rewriting" ||
          state.ttsStatus === "preparing" ||
          state.ttsStatus === "generating"
        ) {
          return false
        }

        const isPdf =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")

        set({
          pdfReadingMode: mode,
          pdfExtractionStatus: "extracting",
          pdfExtractionError: null,
        })

        try {
          let extractedText = ""
          if (isPdf) {
            const pageImages = await renderPdfPagesToImages(file, startPage, endPage)
            extractedText = await extractCleanUnicodeFromPdfImages(pageImages)
          } else {
            extractedText = await extractTextFromDocument(file)
          }

          let finalScript = extractedText.trim()
          if (!finalScript) {
            throw new Error("စာမျက်နှာများမှ စာသားထုတ်ယူ၍ မရပါ။")
          }

          if (mode === "recap") {
            set({ pdfExtractionStatus: "rewriting" })
            finalScript = await rewriteChapterAsRecap(finalScript.slice(0, 12000), "my")
          }

          set((prev) => ({
            voiceScriptText: finalScript,
            selectedVoice: prev.selectedVoice === "self" ? "nilar" : prev.selectedVoice,
            pdfExtractionStatus: "idle",
            pdfExtractionError: null,
          }))

          const baseTitle = file.name.replace(/\.[^.]+$/, "").trim()
          const pageSuffix = isPdf
            ? startPage === endPage
              ? ` (စာ-${startPage})`
              : ` (စာ-${startPage}-${endPage})`
            : ""

          await get().generateStudioVoiceover(finalScript, {
            useAiSpeechPrep: false,
            customTitle: `${baseTitle}${pageSuffix}`,
          })
          return get().ttsStatus === "done"
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "စာအုပ်ဖိုင်မှ စာသားထုတ်ယူ၍ မရပါ။"
          set({
            pdfExtractionStatus: "error",
            pdfExtractionError: msg,
          })
          toast.error(msg)
          return false
        }
      },
      generateStudioVoiceover: async (scriptOverride, options) => {
        const state = get()
        if (state.ttsStatus === "preparing" || state.ttsStatus === "generating") {
          return
        }

        const rawScript = scriptOverride ?? state.voiceScriptText
        const cleaned = cleanVoiceoverText(rawScript)
        if (!cleaned) {
          const msg = "အသံဖတ်ခိုင်းရန် စာသားအရင်ထည့်ပါ။"
          set({ ttsStatus: "error", ttsError: msg, ttsProgress: null })
          toast.error(msg)
          return
        }

        const voiceType: BurmeseVoiceType = state.selectedVoice === "thiha" ? "male" : "female"
        const speed = state.voiceSpeed
        const dialogueMode = state.voiceDialogueMode
        const musicPreset = state.voiceMusicPreset
        const customMusicFile = state.voiceCustomMusicFile
        const customPronunciations = state.customPronunciations
        const useAiSpeechPrep = options?.useAiSpeechPrep ?? true

        set({
          ttsStatus: "preparing",
          ttsProgress: null,
          ttsError: null,
        })

        try {
          let result = dialogueMode
            ? await generateBurmeseDialogueVoiceover(rawScript, speed, {
                deliveryTone: "storytelling",
                customPronunciations,
                useAiSpeechPrep,
                onStageChange: (stage) => {
                  set({ ttsStatus: stage })
                },
                onProgress: (p) => {
                  set({
                    ttsStatus: "generating",
                    ttsProgress: { current: p.currentChunk, total: p.totalChunks },
                  })
                },
              })
            : await generateBurmeseVoiceover(cleaned, voiceType, speed, {
                deliveryTone: "storytelling",
                customPronunciations,
                useAiSpeechPrep,
                onStageChange: (stage) => {
                  set({ ttsStatus: stage })
                },
                onProgress: (p) => {
                  set({
                    ttsStatus: "generating",
                    ttsProgress: { current: p.currentChunk, total: p.totalChunks },
                  })
                },
              })

          if (musicPreset !== "none") {
            const mixed = await mixVoiceoverWithAutoDuckingMusic({
              voiceoverBlob: result.blob,
              musicPreset,
              customMusicFile,
              musicVolume: 0.34,
            })
            URL.revokeObjectURL(result.audioUrl)
            result = {
              ...result,
              audioUrl: mixed.audioUrl,
              blob: mixed.blob,
              audioBuffer: mixed.audioBuffer,
              durationSeconds: mixed.durationSeconds,
              mimeType: "audio/wav",
              fileExtension: "wav",
            }
          }

          const prevUrl = get().generatedAudioUrl
          if (prevUrl && prevUrl !== result.audioUrl) {
            URL.revokeObjectURL(prevUrl)
          }

          const title =
            options?.customTitle ||
            (dialogueMode
              ? "နီလာ + သီဟ"
              : state.selectedVoice === "thiha"
                ? "သီဟ"
                : "နီလာ")

          set({
            ttsStatus: "done",
            ttsProgress: null,
            ttsError: null,
            generatedAudioUrl: result.audioUrl,
            generatedAudioBlob: result.blob,
            generatedAudioMimeType: result.mimeType,
            generatedAudioExtension: result.fileExtension,
            generatedAudioDuration: result.durationSeconds,
            generatedAudioTitle: title,
            generatedAudioSource: "narrator",
          })

          get().addAudioSession({
            script: rawScript.trim(),
            voiceLabel: title,
            mode: dialogueMode ? "dialogue" : "single",
            durationSeconds: result.durationSeconds,
          })

          if (typeof window !== "undefined") {
            void playBlobUrlWithPrimedAudio(result.audioUrl)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "အသံဖိုင် ပြင်ဆင်၍ မရပါ။"
          set({
            ttsStatus: "error",
            ttsProgress: null,
            ttsError: msg,
          })
          toast.error(msg)
        }
      },
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
      setLiveModeEnabled: (liveModeEnabled) => set({ liveModeEnabled }),
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
        liveModeEnabled: state.liveModeEnabled ?? false,
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
