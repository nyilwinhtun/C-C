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
import { t as translate } from "@/locales/translations"

const tt = (key: string, subs?: Record<string, string>) =>
  translate(useUIStore.getState().language, key, subs)
import {
  cleanVoiceoverText,
  generateBurmeseDialogueVoiceover,
  generateBurmeseVoiceover,
  mixVoiceoverWithAutoDuckingMusic,
  type BurmeseVoiceType,
  type VoiceDeliveryTone,
  type VoiceoverSegmentItem,
  type VoiceoverSpeed,
} from "@/api/ttsService"
import { playBlobUrlWithPrimedAudio, stopPrimedAudio } from "@/lib/iosAudio"
import type { BackgroundMusicPreset } from "@/lib/videoAudioMerger"
import { toast } from "@/components/ui/sonner"

let activeTtsAbortController: AbortController | null = null

export type StudioVoiceChoice = "self" | "nilar" | "thiha" | "ko_khant"
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
  voiceDnaSamples?: string[]
  shopProfile?: ShopProfile
  customPronunciations?: CustomPronunciation[]
  editorialTone?: EditorialTone
  editorialLength?: EditorialLength
  editorialFormat?: EditorialFormat
  shopLogoDataUrl?: string | null
  geminiKeyPool?: string[]
  activeGeminiKeyIndex?: number
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
export type PresenterOutfitColor = "navy" | "charcoal" | "emerald" | "cream"

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

export interface MascotPreset {
  id: string
  name: string
  /** Downscaled JPEG data URL of the character photo */
  photoDataUrl: string
  mouthX: number
  mouthY: number
  mouthWidth: number
  jawBottom: number
  jawHalfWidth: number
  jawOpenness: number
  savedAt: number
}

interface ContentState {
  mascotPresets: MascotPreset[]
  saveMascotPreset: (preset: Omit<MascotPreset, "id" | "savedAt">) => void
  deleteMascotPreset: (id: string) => void
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
  presenterLogoDataUrl: string | null
  presenterOutfitColor: PresenterOutfitColor
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
  voiceDeliveryTone: VoiceDeliveryTone
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
  generatedAudioSegments: VoiceoverSegmentItem[]
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
  geminiKeyPool: string[]
  activeGeminiKeyIndex: number
  geminiKeyCooldowns: Record<string, number>
  getGeminiKeyPool: () => string[]
  addGeminiPoolKey: (key: string) => boolean
  removeGeminiPoolKey: (index: number) => void
  rotateGeminiKey: (failedKey?: string, cooldownMs?: number) => number
  setActiveGeminiKeyIndex: (index: number) => void
  isGeminiKeyCoolingDown: (key: string) => boolean
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
  setPresenterLogoDataUrl: (dataUrl: string | null) => void
  setPresenterOutfitColor: (color: PresenterOutfitColor) => void
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
  setVoiceDeliveryTone: (tone: VoiceDeliveryTone) => void
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
  cancelStudioVoiceover: () => void
  setMergedStudioAudio: (params: {
    audioUrl: string
    blob: Blob
    mimeType: string
    fileExtension: string
    durationSeconds: number
    segments: VoiceoverSegmentItem[]
  }) => void
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
      presenterLogoDataUrl: null,
      presenterOutfitColor: "navy",
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
      voiceSpeed: 1.05,
      voiceDialogueMode: false,
      voiceMusicPreset: "none",
      voiceDeliveryTone: "normal",
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
      generatedAudioSegments: [],
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
      geminiKeyPool: [],
      activeGeminiKeyIndex: 0,
      geminiKeyCooldowns: {},
      mascotPresets: [],
      saveMascotPreset: (preset) =>
        set((state) => {
          const existing = state.mascotPresets.find(
            (m) => m.name.trim().toLowerCase() === preset.name.trim().toLowerCase()
          )
          const entry: MascotPreset = {
            ...preset,
            id: existing?.id ?? `mascot-${Date.now()}`,
            savedAt: Date.now(),
          }
          const rest = state.mascotPresets.filter((m) => m.id !== entry.id)
          return { mascotPresets: [entry, ...rest].slice(0, 8) }
        }),
      deleteMascotPreset: (id) =>
        set((state) => ({ mascotPresets: state.mascotPresets.filter((m) => m.id !== id) })),

      getGeminiKeyPool: () => {
        const state = get()
        const primaryKey = useUIStore.getState().apiKeys.gemini?.trim() ?? ""
        const envKey =
          (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? ""
        const poolKeys = (state.geminiKeyPool ?? [])
          .map((k) => (typeof k === "string" ? k.trim() : ""))
          .filter(Boolean)

        const seen = new Set<string>()
        const combined: string[] = []
        for (const candidate of [primaryKey, ...poolKeys, envKey]) {
          if (candidate && !seen.has(candidate)) {
            seen.add(candidate)
            combined.push(candidate)
          }
        }
        return combined
      },

      addGeminiPoolKey: (key) => {
        const trimmed = key.trim()
        if (!trimmed) return false
        const state = get()
        const currentPool = (state.geminiKeyPool ?? [])
          .map((k) => k.trim())
          .filter(Boolean)
        const primaryKey = useUIStore.getState().apiKeys.gemini?.trim() ?? ""
        if (currentPool.includes(trimmed) || primaryKey === trimmed) {
          return false
        }
        if (currentPool.length >= 5) {
          return false
        }
        set({
          geminiKeyPool: [...currentPool, trimmed].slice(0, 5),
        })
        return true
      },

      removeGeminiPoolKey: (index) =>
        set((state) => {
          const currentPool = (state.geminiKeyPool ?? [])
            .map((k) => k.trim())
            .filter(Boolean)
          if (index < 0 || index >= currentPool.length) return state
          const nextPool = currentPool.filter((_, idx) => idx !== index)
          const primaryKey = useUIStore.getState().apiKeys.gemini?.trim() ?? ""
          const envKey =
            (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? ""
          const totalAfter = new Set(
            [primaryKey, ...nextPool, envKey].filter(Boolean)
          ).size
          const nextActiveIdx =
            totalAfter > 0
              ? Math.min(state.activeGeminiKeyIndex, totalAfter - 1)
              : 0
          return {
            geminiKeyPool: nextPool,
            activeGeminiKeyIndex: Math.max(0, nextActiveIdx),
          }
        }),

      rotateGeminiKey: (failedKey, cooldownMs = 60_000) => {
        const state = get()
        const pool = state.getGeminiKeyPool()
        const now = Date.now()
        const nextCooldowns: Record<string, number> = {}
        for (const [k, expiresAt] of Object.entries(state.geminiKeyCooldowns ?? {})) {
          if (expiresAt > now) {
            nextCooldowns[k] = expiresAt
          }
        }

        if (pool.length === 0) {
          if (failedKey?.trim()) {
            nextCooldowns[failedKey.trim()] = now + cooldownMs
          }
          set({ activeGeminiKeyIndex: 0, geminiKeyCooldowns: nextCooldowns })
          return 0
        }

        const currentIdx =
          ((state.activeGeminiKeyIndex % pool.length) + pool.length) % pool.length
        const keyToMark = failedKey?.trim() || pool[currentIdx]
        if (keyToMark) {
          nextCooldowns[keyToMark] = now + cooldownMs
        }

        const failedPoolIdx = keyToMark ? pool.indexOf(keyToMark) : -1
        const baseIdx = failedPoolIdx >= 0 ? failedPoolIdx : currentIdx

        let nextIdx = (baseIdx + 1) % pool.length
        for (let offset = 1; offset < pool.length; offset += 1) {
          const candidateIdx = (baseIdx + offset) % pool.length
          const candidateKey = pool[candidateIdx]
          if (!nextCooldowns[candidateKey] || nextCooldowns[candidateKey] <= now) {
            nextIdx = candidateIdx
            break
          }
        }

        set({
          activeGeminiKeyIndex: nextIdx,
          geminiKeyCooldowns: nextCooldowns,
        })
        return nextIdx
      },

      setActiveGeminiKeyIndex: (index) =>
        set((state) => {
          const pool = state.getGeminiKeyPool()
          if (pool.length === 0) return { activeGeminiKeyIndex: 0 }
          const safeIdx = ((index % pool.length) + pool.length) % pool.length
          return { activeGeminiKeyIndex: safeIdx }
        }),

      isGeminiKeyCoolingDown: (key) => {
        const trimmed = key.trim()
        if (!trimmed) return false
        const expiresAt = get().geminiKeyCooldowns?.[trimmed]
        return typeof expiresAt === "number" && expiresAt > Date.now()
      },

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
      setPresenterLogoDataUrl: (presenterLogoDataUrl) => set({ presenterLogoDataUrl }),
      setPresenterOutfitColor: (presenterOutfitColor) => set({ presenterOutfitColor }),
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
      setSelectedVoice: (selectedVoice) => {
        if (activeTtsAbortController) {
          activeTtsAbortController.abort()
          activeTtsAbortController = null
        }
        stopPrimedAudio()
        set((state) => ({
          selectedVoice,
          ...(state.ttsStatus === "preparing" || state.ttsStatus === "generating"
            ? { ttsStatus: "idle" as const, ttsProgress: null, ttsError: null }
            : {}),
        }))
      },
      setVoiceSpeed: (voiceSpeed) => set({ voiceSpeed }),
      setVoiceDialogueMode: (voiceDialogueMode) => set({ voiceDialogueMode }),
      setVoiceMusicPreset: (voiceMusicPreset) => set({ voiceMusicPreset }),
      setVoiceDeliveryTone: (voiceDeliveryTone) => set({ voiceDeliveryTone }),
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
      setMergedStudioAudio: (params) =>
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
            generatedAudioSegments: params.segments,
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
            throw new Error(tt("store.pdfNoText"))
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
              ? ` (${tt("store.pageShort")}-${startPage})`
              : ` (${tt("store.pageShort")}-${startPage}-${endPage})`
            : ""

          await get().generateStudioVoiceover(finalScript, {
            useAiSpeechPrep: false,
            customTitle: `${baseTitle}${pageSuffix}`,
          })
          return get().ttsStatus === "done"
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : tt("store.bookFailed")
          set({
            pdfExtractionStatus: "error",
            pdfExtractionError: msg,
          })
          toast.error(msg)
          return false
        }
      },
      cancelStudioVoiceover: () => {
        if (activeTtsAbortController) {
          activeTtsAbortController.abort()
          activeTtsAbortController = null
        }
        stopPrimedAudio()
        set((state) =>
          state.ttsStatus === "preparing" || state.ttsStatus === "generating"
            ? { ttsStatus: "idle" as const, ttsProgress: null, ttsError: null }
            : state
        )
      },
      generateStudioVoiceover: async (scriptOverride, options) => {
        if (activeTtsAbortController) {
          activeTtsAbortController.abort()
          activeTtsAbortController = null
        }
        stopPrimedAudio()

        const state = get()
        const rawScript = scriptOverride ?? state.voiceScriptText
        const cleaned = cleanVoiceoverText(rawScript)
        if (!cleaned) {
          const msg = tt("store.needScript")
          set({ ttsStatus: "error", ttsError: msg, ttsProgress: null })
          toast.error(msg)
          return
        }

        const controller = new AbortController()
        activeTtsAbortController = controller

        const voiceType: BurmeseVoiceType =
          state.selectedVoice === "ko_khant"
            ? "deep_male"
            : state.selectedVoice === "thiha"
              ? "male"
              : "female"
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
                deliveryTone: state.voiceDeliveryTone ?? "normal",
                customPronunciations,
                useAiSpeechPrep,
                signal: controller.signal,
                onStageChange: (stage) => {
                  if (controller.signal.aborted || activeTtsAbortController !== controller) return
                  set({ ttsStatus: stage })
                },
                onProgress: (p) => {
                  if (controller.signal.aborted || activeTtsAbortController !== controller) return
                  set({
                    ttsStatus: "generating",
                    ttsProgress: { current: p.currentChunk, total: p.totalChunks },
                  })
                },
              })
            : await generateBurmeseVoiceover(cleaned, voiceType, speed, {
                deliveryTone: state.voiceDeliveryTone ?? "normal",
                customPronunciations,
                useAiSpeechPrep,
                signal: controller.signal,
                onStageChange: (stage) => {
                  if (controller.signal.aborted || activeTtsAbortController !== controller) return
                  set({ ttsStatus: stage })
                },
                onProgress: (p) => {
                  if (controller.signal.aborted || activeTtsAbortController !== controller) return
                  set({
                    ttsStatus: "generating",
                    ttsProgress: { current: p.currentChunk, total: p.totalChunks },
                  })
                },
              })

          if (controller.signal.aborted || activeTtsAbortController !== controller) {
            URL.revokeObjectURL(result.audioUrl)
            return
          }

          if (musicPreset !== "none") {
            const mixed = await mixVoiceoverWithAutoDuckingMusic({
              voiceoverBlob: result.blob,
              musicPreset,
              customMusicFile,
              musicVolume: 0.34,
            })
            URL.revokeObjectURL(result.audioUrl)
            if (controller.signal.aborted || activeTtsAbortController !== controller) {
              URL.revokeObjectURL(mixed.audioUrl)
              return
            }
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
          const prevSegments = get().generatedAudioSegments
          for (const seg of prevSegments) {
            URL.revokeObjectURL(seg.audioUrl)
          }

          const title =
            options?.customTitle ||
            (dialogueMode
              ? tt("store.voiceBoth")
              : state.selectedVoice === "ko_khant"
                ? tt("store.voiceKoKhant")
                : state.selectedVoice === "thiha"
                  ? tt("store.voiceThiha")
                  : tt("store.voiceNilar"))

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
            generatedAudioSegments: result.segments ?? [],
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
          if (
            controller.signal.aborted ||
            (err instanceof DOMException && err.name === "AbortError")
          ) {
            if (activeTtsAbortController === controller) {
              set({ ttsStatus: "idle", ttsProgress: null, ttsError: null })
            }
            return
          }
          if (activeTtsAbortController !== controller) {
            return
          }
          const msg = err instanceof Error ? err.message : tt("store.audioFailed")
          set({
            ttsStatus: "error",
            ttsProgress: null,
            ttsError: msg,
          })
          toast.error(msg)
        } finally {
          if (activeTtsAbortController === controller) {
            activeTtsAbortController = null
          }
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
          shopLogoDataUrl:
            data.shopLogoDataUrl === null || typeof data.shopLogoDataUrl === "string"
              ? data.shopLogoDataUrl
              : state.shopLogoDataUrl,
          voiceDnaSamples: Array.isArray(data.voiceDnaSamples)
            ? data.voiceDnaSamples.map(String).slice(0, 3)
            : state.voiceDnaSamples,
          shopProfile:
            data.shopProfile && typeof data.shopProfile === "object"
              ? {
                  name:
                    typeof data.shopProfile.name === "string"
                      ? data.shopProfile.name
                      : state.shopProfile.name,
                  phone:
                    typeof data.shopProfile.phone === "string"
                      ? data.shopProfile.phone
                      : state.shopProfile.phone,
                  address:
                    typeof data.shopProfile.address === "string"
                      ? data.shopProfile.address
                      : state.shopProfile.address,
                  autoAppend:
                    typeof data.shopProfile.autoAppend === "boolean"
                      ? data.shopProfile.autoAppend
                      : state.shopProfile.autoAppend,
                }
              : state.shopProfile,
          customPronunciations: Array.isArray(data.customPronunciations)
            ? data.customPronunciations
                .filter(
                  (item) =>
                    item &&
                    typeof item.word === "string" &&
                    typeof item.phonetic === "string"
                )
                .map((item) => ({
                  id: item.id || crypto.randomUUID(),
                  word: item.word.trim(),
                  phonetic: item.phonetic.trim(),
                }))
            : state.customPronunciations,
          editorialTone:
            data.editorialTone === "warm_friend" ||
            data.editorialTone === "calm_clear" ||
            data.editorialTone === "light_humorous"
              ? data.editorialTone
              : state.editorialTone,
          editorialLength:
            data.editorialLength === "short" ||
            data.editorialLength === "medium" ||
            data.editorialLength === "detailed"
              ? data.editorialLength
              : state.editorialLength,
          editorialFormat:
            data.editorialFormat === "fb_sales" ||
            data.editorialFormat === "tiktok_script" ||
            data.editorialFormat === "product_review" ||
            data.editorialFormat === "personal_story"
              ? data.editorialFormat
              : state.editorialFormat,
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
          geminiKeyPool: Array.isArray(data.geminiKeyPool)
            ? Array.from(
                new Set(
                  data.geminiKeyPool
                    .filter((k): k is string => typeof k === "string")
                    .map((k) => k.trim())
                    .filter(Boolean)
                )
              ).slice(0, 5)
            : state.geminiKeyPool,
          activeGeminiKeyIndex:
            typeof data.activeGeminiKeyIndex === "number" &&
            Number.isInteger(data.activeGeminiKeyIndex) &&
            data.activeGeminiKeyIndex >= 0
              ? data.activeGeminiKeyIndex
              : state.activeGeminiKeyIndex,
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
        presenterLogoDataUrl: state.presenterLogoDataUrl ?? null,
        presenterOutfitColor: state.presenterOutfitColor ?? "navy",
        videoProductNote: state.videoProductNote ?? "",
        videoPlatform: state.videoPlatform ?? "TikTok / Reels",
        videoOutputLanguage: state.videoOutputLanguage ?? "my",
        videoDurationSeconds: state.videoDurationSeconds ?? null,
        generatedVideoResult: state.generatedVideoResult ?? null,
        customPronunciations: state.customPronunciations ?? [],
        voiceDeliveryTone: state.voiceDeliveryTone ?? "storytelling",
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
        geminiKeyPool: (state.geminiKeyPool ?? []).slice(0, 5),
        activeGeminiKeyIndex: state.activeGeminiKeyIndex ?? 0,
        mascotPresets: state.mascotPresets ?? [],
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
          presenterLogoDataUrl:
            typeof persisted.presenterLogoDataUrl === "string"
              ? persisted.presenterLogoDataUrl
              : null,
          presenterOutfitColor:
            persisted.presenterOutfitColor === "navy" ||
            persisted.presenterOutfitColor === "charcoal" ||
            persisted.presenterOutfitColor === "emerald" ||
            persisted.presenterOutfitColor === "cream"
              ? persisted.presenterOutfitColor
              : "navy",
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
