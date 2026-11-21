"use client"

import { useEffect, useRef, useState } from "react"
import {
  BookOpen,
  FileText,
  Loader2,
  Music,
  Play,
  Square,
  Upload,
  Users,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import {
  toBurmeseDigits,
  type VoiceoverSpeed,
} from "@/api/ttsService"
import { getPdfPageCount } from "@/lib/pdfVision"
import { setIosAudioSessionPlayback, unlockIosAudio } from "@/lib/iosAudio"
import {
  previewBackgroundMusic,
  stopBackgroundMusicPreview,
  type BackgroundMusicPreset,
} from "@/lib/videoAudioMerger"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { t } from "@/locales/translations"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"

const STUDIO_SPEEDS: VoiceoverSpeed[] = [0.85, 1.0, 1.15]

const MUSIC_PRESET_OPTIONS: Array<{
  id: BackgroundMusicPreset
  labelKey: string
}> = [
  { id: "none", labelKey: "booth.musicNone" },
  { id: "upbeat_promo", labelKey: "booth.musicUpbeat" },
  { id: "soft_vlog", labelKey: "booth.musicSoft" },
  { id: "calm_lofi", labelKey: "booth.musicLofi" },
  { id: "custom", labelKey: "booth.musicCustom" },
]

interface StudioSettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  speed: VoiceoverSpeed
  onSpeedChange: (speed: VoiceoverSpeed) => void
  dialogueMode: boolean
  onDialogueModeChange: (enabled: boolean) => void
  onLoadDialogueSample: () => void
  musicPreset: BackgroundMusicPreset
  onMusicPresetChange: (preset: BackgroundMusicPreset) => void
  customMusicFile: File | null
  onCustomMusicFileChange: (file: File | null) => void
}

export function StudioSettingsSheet({
  open,
  onOpenChange,
  speed,
  onSpeedChange,
  dialogueMode,
  onDialogueModeChange,
  onLoadDialogueSample,
  musicPreset,
  onMusicPresetChange,
  customMusicFile,
  onCustomMusicFileChange,
}: StudioSettingsSheetProps) {
  const language = useUIStore((state) => state.language)
  const {
    pdfReadingMode,
    setPdfReadingMode,
    pdfExtractionStatus,
    ttsStatus,
    ttsProgress,
    extractAndReadPdfStory,
  } = useContentStore(
    useShallow((state) => ({
      pdfReadingMode: state.pdfReadingMode,
      setPdfReadingMode: state.setPdfReadingMode,
      pdfExtractionStatus: state.pdfExtractionStatus,
      ttsStatus: state.ttsStatus,
      ttsProgress: state.ttsProgress,
      extractAndReadPdfStory: state.extractAndReadPdfStory,
    }))
  )

  const [isPreviewingMusic, setIsPreviewingMusic] = useState(false)
  const customMusicInputRef = useRef<HTMLInputElement | null>(null)

  // E-book / PDF Storyteller state
  const [selectedBookFile, setSelectedBookFile] = useState<File | null>(null)
  const [totalPdfPages, setTotalPdfPages] = useState<number | null>(null)
  const [startPage, setStartPage] = useState(1)
  const [endPage, setEndPage] = useState(3)
  const [isLoadingPdfMeta, setIsLoadingPdfMeta] = useState(false)
  const bookInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    return () => {
      stopBackgroundMusicPreview()
    }
  }, [])

  const isExtracting =
    pdfExtractionStatus === "extracting" || pdfExtractionStatus === "rewriting"
  const isSynthesizing = ttsStatus === "preparing" || ttsStatus === "generating"
  const isStoryBusy = isLoadingPdfMeta || isExtracting || isSynthesizing

  const handleToggleMusicPreview = async () => {
    unlockIosAudio()
    setIosAudioSessionPlayback()
    if (isPreviewingMusic) {
      stopBackgroundMusicPreview()
      setIsPreviewingMusic(false)
      return
    }
    if (musicPreset === "none") return
    if (musicPreset === "custom" && !customMusicFile) {
      toast.info("အရင်ဆုံး .mp3 / .m4a ဖိုင်ရွေးပါ။")
      return
    }
    setIsPreviewingMusic(true)
    try {
      await previewBackgroundMusic(musicPreset, customMusicFile)
      window.setTimeout(() => setIsPreviewingMusic(false), 8000)
    } catch {
      setIsPreviewingMusic(false)
    }
  }

  const handleBookFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")

    setSelectedBookFile(file)
    if (!isPdf) {
      setTotalPdfPages(null)
      setStartPage(1)
      setEndPage(1)
      return
    }

    setIsLoadingPdfMeta(true)
    try {
      const count = await getPdfPageCount(file)
      setTotalPdfPages(count)
      setStartPage(1)
      setEndPage(Math.min(3, count))
    } catch {
      setSelectedBookFile(null)
      setTotalPdfPages(null)
      toast.error("PDF ဖိုင်ကို ဖွင့်၍ မရပါ။")
    } finally {
      setIsLoadingPdfMeta(false)
    }
  }

  const handleExtractAndRead = async () => {
    if (!selectedBookFile || isStoryBusy) return
    unlockIosAudio()
    setIosAudioSessionPlayback()

    const maxPages = totalPdfPages ?? 1
    const safeStart = Math.max(1, Math.min(maxPages, startPage || 1))
    const safeEnd = Math.max(safeStart, Math.min(maxPages, endPage || safeStart))

    const ok = await extractAndReadPdfStory({
      file: selectedBookFile,
      startPage: safeStart,
      endPage: safeEnd,
      mode: pdfReadingMode,
    })
    if (ok) {
      onOpenChange(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="bottom">
      <div className="mx-auto w-full max-w-2xl flex flex-col max-h-[85vh]">
        {/* Grabber handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-[#D6D3D1] dark:bg-[#52525B]" />
        </div>

        <SheetHeader className="px-5 py-3 border-b border-[#E7E5E4] dark:border-[#3F3F46]">
          <div>
            <SheetTitle className="text-base font-semibold text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
              {t(language, "booth.sheetTitle")}
            </SheetTitle>
            <SheetDescription className="text-xs text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
              {t(language, "booth.sheetDesc")}
            </SheetDescription>
          </div>
          <SheetClose onClick={() => onOpenChange(false)} aria-label="Close settings" />
        </SheetHeader>

        <SheetContent className="overflow-y-auto px-5 py-4 space-y-5 border-b-0">
          {/* 1. Voice Speed */}
          <section className="space-y-2">
            <Label className="text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
              {t(language, "booth.speedLabel")}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {STUDIO_SPEEDS.map((option) => {
                const active = speed === option
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onSpeedChange(option)}
                    className={cn(
                      "rounded-xl border py-2.5 text-xs font-semibold tabular-nums transition-all cursor-pointer",
                      active
                        ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] dark:bg-[#F5F5F4] text-[#FAF8F5] dark:text-[#18181B]"
                        : "border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#27272A] text-[#57534E] dark:text-[#A1A1AA] hover:text-[#1C1917] dark:hover:text-[#F5F5F4]"
                    )}
                  >
                    {option}x
                  </button>
                )
              })}
            </div>
          </section>

          {/* 2. Dual-Voice Dialogue */}
          <section className="rounded-2xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#27272A]/60 p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span>{t(language, "booth.dialogueLabel")}</span>
              </div>
              <p className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] font-myanmar mt-0.5">
                {t(language, "booth.dialogueDesc")}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {dialogueMode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onLoadDialogueSample()
                    onOpenChange(false)
                  }}
                  className="h-8 px-2.5 text-[11px] font-myanmar"
                >
                  {t(language, "booth.loadSample")}
                </Button>
              )}
              <button
                type="button"
                onClick={() => onDialogueModeChange(!dialogueMode)}
                className={cn(
                  "h-8 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer font-myanmar",
                  dialogueMode
                    ? "bg-[#1C1917] dark:bg-[#F5F5F4] text-[#FAF8F5] dark:text-[#18181B]"
                    : "border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] text-[#57534E] dark:text-[#A1A1AA]"
                )}
              >
                {dialogueMode ? "ဖွင့်ထား" : "ပိတ်ထား"}
              </button>
            </div>
          </section>

          {/* 3. Background Music + Auto-Ducking */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] flex items-center gap-1.5 font-myanmar">
                <Music className="h-3.5 w-3.5" />
                <span>{t(language, "booth.musicLabel")}</span>
              </Label>
              {musicPreset !== "none" && (
                <button
                  type="button"
                  onClick={handleToggleMusicPreview}
                  className="inline-flex items-center gap-1 rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#27272A] px-2.5 py-1 text-[11px] font-medium text-[#1C1917] dark:text-[#F5F5F4] cursor-pointer"
                >
                  {isPreviewingMusic ? (
                    <>
                      <Square className="h-2.5 w-2.5 fill-current" />
                      <span>{t(language, "booth.musicStopPreview")}</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-2.5 w-2.5 fill-current" />
                      <span>{t(language, "booth.musicPreview")}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {MUSIC_PRESET_OPTIONS.map((opt) => {
                const active = musicPreset === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      stopBackgroundMusicPreview()
                      setIsPreviewingMusic(false)
                      onMusicPresetChange(opt.id)
                      if (opt.id === "custom" && !customMusicFile) {
                        customMusicInputRef.current?.click()
                      }
                    }}
                    className={cn(
                      "rounded-xl border px-2 py-2 text-[11px] font-medium transition-colors cursor-pointer truncate font-myanmar",
                      active
                        ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] dark:bg-[#F5F5F4] text-[#FAF8F5] dark:text-[#18181B] font-semibold"
                        : "border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#27272A] text-[#57534E] dark:text-[#A1A1AA]"
                    )}
                  >
                    {t(language, opt.labelKey)}
                  </button>
                )
              })}
            </div>

            <input
              ref={customMusicInputRef}
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.aac"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  onCustomMusicFileChange(file)
                  onMusicPresetChange("custom")
                }
                e.target.value = ""
              }}
            />

            {musicPreset === "custom" && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#27272A] px-3 py-2 text-xs">
                <span className="truncate text-[#57534E] dark:text-[#A1A1AA]">
                  {customMusicFile ? customMusicFile.name : ".mp3 / .m4a ဖိုင်မရွေးရသေးပါ"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => customMusicInputRef.current?.click()}
                  className="h-7 px-2.5 text-[11px] shrink-0 font-myanmar"
                >
                  {customMusicFile ? "ပြောင်းမည်" : "ဖိုင်ရွေးမည်"}
                </Button>
              </div>
            )}
          </section>

          {/* 4. E-book / PDF Storyteller */}
          <section className="rounded-2xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#27272A]/60 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] font-myanmar">
                  <BookOpen className="h-3.5 w-3.5 shrink-0" />
                  <span>စာအုပ်ဇာတ်ကြောင်းပြော (PDF / E-book)</span>
                </div>
                <p className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] font-myanmar mt-0.5">
                  မြန်မာစာအုပ် PDF များကို စာမျက်နှာအလိုက် သန့်စင်ပြီး အသံဖိုင်တစ်ဆက်တည်း နားထောင်ပါ
                </p>
              </div>
              <input
                ref={bookInputRef}
                type="file"
                accept=".pdf,.epub,.txt,.md,application/pdf,application/epub+zip,text/plain"
                className="hidden"
                onChange={handleBookFileSelect}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => bookInputRef.current?.click()}
                disabled={isStoryBusy}
                className="h-8 px-3 text-xs shrink-0 font-myanmar"
              >
                {isLoadingPdfMeta ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                )}
                PDF စာအုပ်ရွေးရန်
              </Button>
            </div>

            {selectedBookFile && (
              <div className="space-y-3 pt-2 border-t border-[#E7E5E4] dark:border-[#3F3F46]">
                <div className="flex items-center justify-between gap-2 text-[11px] text-[#57534E] dark:text-[#A1A1AA]">
                  <span className="inline-flex items-center gap-1.5 truncate text-[#1C1917] dark:text-[#F5F5F4] font-medium">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{selectedBookFile.name}</span>
                  </span>
                  {totalPdfPages !== null && (
                    <span className="tabular-nums shrink-0 font-myanmar">
                      စုစုပေါင်း {toBurmeseDigits(totalPdfPages)} စာမျက်နှာ
                    </span>
                  )}
                </div>

                {totalPdfPages !== null && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] px-3 py-2">
                    <span className="text-[11px] font-medium text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                      စာမျက်နှာ (မှ - အထိ)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={totalPdfPages}
                        value={startPage}
                        disabled={isStoryBusy}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(totalPdfPages, Number(e.target.value) || 1))
                          setStartPage(val)
                          if (endPage < val) setEndPage(val)
                        }}
                        aria-label="Start page"
                        className="w-14 h-7 rounded-lg border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#27272A] px-2 text-center text-xs font-semibold tabular-nums text-[#1C1917] dark:text-[#F5F5F4]"
                      />
                      <span className="text-xs text-[#57534E] dark:text-[#A1A1AA] font-myanmar">မှ</span>
                      <input
                        type="number"
                        min={startPage}
                        max={totalPdfPages}
                        value={endPage}
                        disabled={isStoryBusy}
                        onChange={(e) => {
                          const val = Math.max(startPage, Math.min(totalPdfPages, Number(e.target.value) || startPage))
                          setEndPage(val)
                        }}
                        aria-label="End page"
                        className="w-14 h-7 rounded-lg border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#27272A] px-2 text-center text-xs font-semibold tabular-nums text-[#1C1917] dark:text-[#F5F5F4]"
                      />
                      <span className="text-xs text-[#57534E] dark:text-[#A1A1AA] font-myanmar">အထိ</span>
                    </div>
                  </div>
                )}

                {/* Reading Mode: Direct Full Read vs Storyteller Recap */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={isStoryBusy}
                    onClick={() => setPdfReadingMode("direct")}
                    className={cn(
                      "rounded-xl border px-2 py-2 text-[11px] font-semibold transition-colors cursor-pointer font-myanmar",
                      pdfReadingMode === "direct"
                        ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] dark:bg-[#F5F5F4] text-[#FAF8F5] dark:text-[#18181B]"
                        : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] text-[#57534E] dark:text-[#A1A1AA]"
                    )}
                  >
                    စာသားအတိုင်း အပြည့်ဖတ်မည်
                  </button>
                  <button
                    type="button"
                    disabled={isStoryBusy}
                    onClick={() => setPdfReadingMode("recap")}
                    className={cn(
                      "rounded-xl border px-2 py-2 text-[11px] font-semibold transition-colors cursor-pointer font-myanmar",
                      pdfReadingMode === "recap"
                        ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] dark:bg-[#F5F5F4] text-[#FAF8F5] dark:text-[#18181B]"
                        : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] text-[#57534E] dark:text-[#A1A1AA]"
                    )}
                  >
                    အနှစ်ချုပ် ဇာတ်ကြောင်းပြောမည်
                  </button>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onTouchStart={() => unlockIosAudio()}
                  onClick={handleExtractAndRead}
                  disabled={isStoryBusy}
                  className="w-full h-10 rounded-xl bg-[#1C1917] hover:bg-[#292524] dark:bg-[#F5F5F4] dark:hover:bg-[#E7E5E4] text-[#FAF8F5] dark:text-[#18181B] text-xs font-semibold font-myanmar"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                      <span>စာမျက်နှာများကို ဖတ်ရှုသန့်စင်နေပါသည်...</span>
                    </>
                  ) : isSynthesizing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                      <span>
                        အသံဖိုင် တစ်ဆက်တည်း ပေါင်းစပ်နေပါသည်...
                        {ttsProgress && ttsProgress.total > 1
                          ? ` (${toBurmeseDigits(ttsProgress.current)}/${toBurmeseDigits(ttsProgress.total)})`
                          : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
                      <span>စာသားထုတ်ပြီး အသံဖတ်မည်</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </section>
        </SheetContent>
      </div>
    </Sheet>
  )
}
