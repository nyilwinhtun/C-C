"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  BookOpen,
  Clock,
  FileText,
  Headphones,
  Loader2,
  Pause,
  PenLine,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Upload,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import {
  extractCleanUnicodeFromPdfImages,
  extractTextFromDocument,
  rewriteChapterAsRecap,
} from "@/api/aiService"
import {
  setIosAudioSessionPlayback,
  shareAudioFile,
  unlockIosAudio,
} from "@/lib/iosAudio"
import { getPdfPageCount, renderPdfPagesToImages } from "@/lib/pdfVision"
import {
  BURMESE_VOICE_PRESETS,
  TTS_BYTE_RATE,
  VOICEOVER_SPEEDS,
  concatenateAudioBlobsToWav,
  estimateSpokenDurationSeconds,
  formatAudioClockDuration,
  generateBurmeseVoiceover,
  toBurmeseDigits,
  type BurmeseVoiceType,
  type VoiceoverProgress,
  type VoiceoverSpeed,
} from "@/api/ttsService"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { IosAudioPlayer } from "@/components/shared/IosAudioPlayer"
import { toast } from "@/components/ui/sonner"
import { Textarea } from "@/components/ui/textarea"
import { useUIStore } from "@/store/useUIStore"
import {
  formatDurationLabel,
  splitDocumentIntoChapters,
  splitTextIntoSmartChunks,
  type BookChapter,
} from "./chapterSplitter"

interface SynthesizedChapterAudio {
  chapterId: string
  title: string
  audioUrl: string
  blob: Blob
  durationSeconds: number
  fileExtension: "wav" | "mp3"
}

export function AudiobookPage() {
  const language = useUIStore(useShallow((state) => state.language))
  const isMy = language === "my"

  const [rawText, setRawText] = useState("")
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null)
  const [pdfTotalPages, setPdfTotalPages] = useState(0)
  const [pdfStartPage, setPdfStartPage] = useState(1)
  const [pdfEndPage, setPdfEndPage] = useState(5)
  const [audiobookMode, setAudiobookMode] = useState<"direct" | "recap">("direct")
  const [isRewritingRecap, setIsRewritingRecap] = useState(false)

  const [voiceType, setVoiceType] = useState<BurmeseVoiceType>("female")
  const [speed, setSpeed] = useState<VoiceoverSpeed>(1.0)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)

  const [isGenerating, setIsGenerating] = useState(false)
  const [progressLabel, setProgressLabel] = useState("")
  const [chunkProgress, setChunkProgress] = useState<VoiceoverProgress | null>(null)
  const [chapterAudios, setChapterAudios] = useState<Record<string, SynthesizedChapterAudio>>({})
  const [fullAudio, setFullAudio] = useState<{
    audioUrl: string
    blob: Blob
    durationSeconds: number
    fileExtension: "wav" | "mp3"
    title: string
  } | null>(null)

  // Pre-Fetch Auto-Queue Player state
  const [queueActive, setQueueActive] = useState(false)
  const [queuePlaying, setQueuePlaying] = useState(false)
  const [queueLoadingChunk, setQueueLoadingChunk] = useState(false)
  const [queueIndex, setQueueIndex] = useState(0)
  const queueAudioRef = useRef<HTMLAudioElement | null>(null)
  const queueCacheRef = useRef<Map<number, Promise<string>>>(new Map())
  const queueRunIdRef = useRef(0)
  const chunkRefs = useRef<(HTMLButtonElement | null)[]>([])

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const activeUrlsRef = useRef<string[]>([])

  const revokeAllAudioUrls = () => {
    for (const url of activeUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    activeUrlsRef.current = []
  }

  useEffect(() => {
    return () => {
      revokeAllAudioUrls()
    }
  }, [])

  const smartChunks = useMemo(() => {
    return splitTextIntoSmartChunks(rawText, 500, 800)
  }, [rawText])

  const chapters = useMemo<BookChapter[]>(() => {
    return splitDocumentIntoChapters(rawText, 1200)
  }, [rawText])

  const activeChapter = useMemo(() => {
    if (chapters.length === 0) return null
    return chapters.find((c) => c.id === selectedChapterId) ?? chapters[0]
  }, [chapters, selectedChapterId])

  const totalEstimatedSeconds = useMemo(() => {
    return estimateSpokenDurationSeconds(rawText, speed)
  }, [rawText, speed])

  const stopAutoQueue = () => {
    queueRunIdRef.current += 1
    const audio = queueAudioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute("src")
    }
    queueCacheRef.current.clear()
    setQueueActive(false)
    setQueuePlaying(false)
    setQueueLoadingChunk(false)
  }

  const clearGeneratedAudio = () => {
    stopAutoQueue()
    revokeAllAudioUrls()
    setChapterAudios({})
    setFullAudio(null)
  }

  const fetchChunkAudioUrl = (index: number, runId: number): Promise<string> => {
    const cached = queueCacheRef.current.get(index)
    if (cached) return cached

    const text = smartChunks[index]
    const promise = generateBurmeseVoiceover(text, voiceType, speed, {
      deliveryTone: "storytelling",
    }).then((res) => {
      if (queueRunIdRef.current !== runId) {
        URL.revokeObjectURL(res.audioUrl)
        throw new Error("Playback cancelled")
      }
      activeUrlsRef.current.push(res.audioUrl)
      return res.audioUrl
    })
    queueCacheRef.current.set(index, promise)
    return promise
  }

  const playQueueChunkAt = async (index: number, runId: number) => {
    if (queueRunIdRef.current !== runId || index < 0 || index >= smartChunks.length) {
      if (index >= smartChunks.length) {
        setQueuePlaying(false)
      }
      return
    }
    setQueueIndex(index)
    setQueueLoadingChunk(true)
    try {
      const url = await fetchChunkAudioUrl(index, runId)
      if (queueRunIdRef.current !== runId) return

      // Pre-fetch next chunk while current chunk plays
      if (index + 1 < smartChunks.length) {
        void fetchChunkAudioUrl(index + 1, runId).catch(() => {})
      }

      const audio = queueAudioRef.current
      if (!audio) return
      setIosAudioSessionPlayback()
      audio.src = url
      audio.currentTime = 0
      setQueueLoadingChunk(false)
      setQueuePlaying(true)
      await audio.play()
    } catch (err) {
      if (queueRunIdRef.current !== runId) return
      setQueueLoadingChunk(false)
      setQueuePlaying(false)
      const msg = err instanceof Error ? err.message : "Failed to play chunk."
      toast.error(msg)
    }
  }

  const handleStartAutoQueue = () => {
    if (smartChunks.length === 0) return
    unlockIosAudio()
    const runId = queueRunIdRef.current + 1
    queueRunIdRef.current = runId
    queueCacheRef.current.clear()
    setQueueActive(true)
    void playQueueChunkAt(0, runId)
  }

  const handleToggleQueuePlayPause = async () => {
    setIosAudioSessionPlayback()
    unlockIosAudio()
    const audio = queueAudioRef.current
    if (!audio) return
    if (queuePlaying) {
      audio.pause()
      setQueuePlaying(false)
    } else {
      try {
        setIosAudioSessionPlayback()
        await audio.play()
        setQueuePlaying(true)
      } catch {
        setQueuePlaying(false)
      }
    }
  }

  // Smoothly auto-scroll to active chunk during Auto-Queue playback
  useEffect(() => {
    if (!queueActive) return
    chunkRefs.current[queueIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    })
  }, [queueActive, queueIndex])

  // Register MediaSession lock-screen controls for Auto-Queue playback
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !queueActive) {
      return
    }
    const ms = navigator.mediaSession
    if (typeof MediaMetadata !== "undefined") {
      const baseTitle = sourceFileName
        ? sourceFileName.replace(/\.(txt|pdf|md|epub)$/i, "")
        : isMy
          ? "စာအုပ် အသံဖတ်စက်"
          : "Audiobook"
      ms.metadata = new MediaMetadata({
        title: `${baseTitle} (${queueIndex + 1}/${Math.max(1, smartChunks.length)})`,
        artist: "Content Creator Studio",
        album: "Audiobook Reader",
      })
    }
    ms.playbackState = queuePlaying ? "playing" : "paused"

    const handleSeekBy = (delta: number) => {
      const audio = queueAudioRef.current
      if (!audio) return
      const maxDur = Number.isFinite(audio.duration) ? audio.duration : 0
      audio.currentTime = Math.max(0, Math.min(maxDur || audio.currentTime + delta, audio.currentTime + delta))
    }

    try {
      ms.setActionHandler("play", () => {
        const audio = queueAudioRef.current
        if (!audio) return
        setIosAudioSessionPlayback()
        unlockIosAudio()
        void audio.play().then(() => setQueuePlaying(true)).catch(() => setQueuePlaying(false))
      })
      ms.setActionHandler("pause", () => {
        queueAudioRef.current?.pause()
        setQueuePlaying(false)
      })
      ms.setActionHandler("seekbackward", (d) => handleSeekBy(-(d.seekOffset ?? 15)))
      ms.setActionHandler("seekforward", (d) => handleSeekBy(d.seekOffset ?? 15))
    } catch {
      // Ignore unsupported MediaSession actions
    }

    return () => {
      try {
        ms.setActionHandler("play", null)
        ms.setActionHandler("pause", null)
        ms.setActionHandler("seekbackward", null)
        ms.setActionHandler("seekforward", null)
      } catch {
        // Ignore cleanup errors
      }
    }
  }, [queueActive, queuePlaying, queueIndex, smartChunks.length, sourceFileName, isMy])

  const handleRewriteAsRecap = async () => {
    if (!rawText.trim()) return
    setIsRewritingRecap(true)
    try {
      const targetText = activeChapter ? activeChapter.text : rawText
      const recap = await rewriteChapterAsRecap(targetText, isMy ? "my" : "en")
      clearGeneratedAudio()
      setRawText(recap)
      setSelectedChapterId(null)
      toast.success(
        isMy
          ? "YouTube Recap ပုံစံဖြင့် ပြန်လည်ရေးသားပြီးပါပြီ!"
          : "Rewritten into engaging YouTube Recap narration!"
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to rewrite as recap."
      toast.error(msg)
    } finally {
      setIsRewritingRecap(false)
    }
  }

  const handleExtractPdfRange = async () => {
    if (!pendingPdfFile || pdfTotalPages <= 0) return
    const safeStart = Math.max(1, Math.min(pdfTotalPages, Math.floor(pdfStartPage || 1)))
    const safeEnd = Math.max(safeStart, Math.min(pdfTotalPages, Math.floor(pdfEndPage || safeStart)))
    setPdfStartPage(safeStart)
    setPdfEndPage(safeEnd)

    setIsExtracting(true)
    try {
      const pageImages = await renderPdfPagesToImages(pendingPdfFile, safeStart, safeEnd)
      const extracted = await extractCleanUnicodeFromPdfImages(pageImages)
      const clean = extracted.trim()
      if (!clean) {
        throw new Error(
          isMy
            ? "ရွေးချယ်ထားသော စာမျက်နှာများမှ စာသားထုတ်ယူ၍ မရပါ။"
            : "Could not extract text from the selected pages."
        )
      }
      clearGeneratedAudio()
      setRawText(clean)
      setSourceFileName(
        `${pendingPdfFile.name} (${safeStart === safeEnd ? `p.${safeStart}` : `p.${safeStart}-${safeEnd}`})`
      )
      setSelectedChapterId(null)
      toast.success(
        isMy
          ? `စာမျက်နှာ ${toBurmeseDigits(safeStart)}-${toBurmeseDigits(safeEnd)} မှ Unicode စာသား ထုတ်ယူပြီးပါပြီ`
          : `Extracted clean Unicode from pages ${safeStart}-${safeEnd}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to extract PDF pages."
      toast.error(msg)
    } finally {
      setIsExtracting(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")

    if (isPdf) {
      setIsExtracting(true)
      try {
        const total = await getPdfPageCount(file)
        setPendingPdfFile(file)
        setPdfTotalPages(total)
        setPdfStartPage(1)
        setPdfEndPage(Math.min(5, total))
        toast.info(
          isMy
            ? `PDF စာမျက်နှာ ${toBurmeseDigits(total)} မျက်နှာ တွေ့ရှိပါသည် — ဖတ်လိုသည့် စာမျက်နှာကို ရွေးချယ်ပါ။`
            : `Loaded PDF (${total} pages) — select page range to extract.`
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to read PDF page count."
        toast.error(msg)
      } finally {
        setIsExtracting(false)
      }
      return
    }

    setPendingPdfFile(null)
    setPdfTotalPages(0)
    setIsExtracting(true)
    try {
      const extracted = await extractTextFromDocument(file)
      clearGeneratedAudio()
      setRawText(extracted)
      setSourceFileName(file.name)
      setSelectedChapterId(null)
      toast.success(
        isMy
          ? `"${file.name}" မှ စာသားများကို ထုတ်ယူပြီးပါပြီ`
          : `Extracted text from "${file.name}"`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to extract document text."
      toast.error(msg)
    } finally {
      setIsExtracting(false)
    }
  }

  const handleGenerateChapter = async (chapter: BookChapter) => {
    setIsGenerating(true)
    setChunkProgress(null)
    setProgressLabel(
      isMy ? "အသံဖန်တီးနေပါသည်..." : `Synthesizing ${chapter.title}...`
    )
    try {
      const result = await generateBurmeseVoiceover(chapter.text, voiceType, speed, {
        deliveryTone: "storytelling",
        onProgress: (p) => {
          setChunkProgress(p)
          if (p.totalChunks > 1) {
            setProgressLabel(
              isMy
                ? `အသံဖန်တီးနေပါသည်... (အပိုင်း ${toBurmeseDigits(p.currentChunk)}/${toBurmeseDigits(p.totalChunks)})`
                : `Synthesizing ${chapter.title}... (Part ${p.currentChunk}/${p.totalChunks})`
            )
          }
        },
      })
      activeUrlsRef.current.push(result.audioUrl)
      const item: SynthesizedChapterAudio = {
        chapterId: chapter.id,
        title: chapter.title,
        audioUrl: result.audioUrl,
        blob: result.blob,
        durationSeconds: result.durationSeconds,
        fileExtension: result.fileExtension,
      }
      setChapterAudios((prev) => ({ ...prev, [chapter.id]: item }))
      setFullAudio({
        audioUrl: result.audioUrl,
        blob: result.blob,
        durationSeconds: result.durationSeconds,
        fileExtension: result.fileExtension,
        title: chapter.title,
      })
      toast.success(
        isMy ? `${chapter.title} အသံဖိုင် အဆင်သင့်ဖြစ်ပါပြီ` : `${chapter.title} audio ready!`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to synthesize chapter audio."
      toast.error(msg)
    } finally {
      setIsGenerating(false)
      setProgressLabel("")
      setChunkProgress(null)
    }
  }

  const handleGenerateAll = async () => {
    if (chapters.length === 0) return
    setIsGenerating(true)
    setChunkProgress(null)
    clearGeneratedAudio()

    try {
      const blobs: Blob[] = []
      let totalDuration = 0
      const newChapterMap: Record<string, SynthesizedChapterAudio> = {}

      for (let i = 0; i < chapters.length; i += 1) {
        const ch = chapters[i]
        setProgressLabel(
          isMy
            ? chapters.length > 1
              ? `အသံဖန်တီးနေပါသည်... (အပိုင်း ${toBurmeseDigits(i + 1)}/${toBurmeseDigits(chapters.length)})`
              : "အသံဖန်တီးနေပါသည်..."
            : `Synthesizing part ${i + 1} of ${chapters.length}...`
        )
        const result = await generateBurmeseVoiceover(ch.text, voiceType, speed, {
          deliveryTone: "storytelling",
          onProgress: (p) => {
            setChunkProgress(p)
            if (chapters.length === 1 && p.totalChunks > 1) {
              setProgressLabel(
                isMy
                  ? `အသံဖန်တီးနေပါသည်... (အပိုင်း ${toBurmeseDigits(p.currentChunk)}/${toBurmeseDigits(p.totalChunks)})`
                  : `Synthesizing... (Part ${p.currentChunk}/${p.totalChunks})`
              )
            } else if (chapters.length > 1) {
              setProgressLabel(
                isMy
                  ? `အသံဖန်တီးနေပါသည်... (အခန်း ${toBurmeseDigits(i + 1)}/${toBurmeseDigits(chapters.length)} · အပိုင်း ${toBurmeseDigits(p.currentChunk)}/${toBurmeseDigits(p.totalChunks)})`
                  : `Synthesizing chapter ${i + 1}/${chapters.length} (Part ${p.currentChunk}/${p.totalChunks})...`
              )
            }
          },
        })
        activeUrlsRef.current.push(result.audioUrl)
        blobs.push(result.blob)
        totalDuration += result.durationSeconds
        newChapterMap[ch.id] = {
          chapterId: ch.id,
          title: ch.title,
          audioUrl: result.audioUrl,
          blob: result.blob,
          durationSeconds: result.durationSeconds,
          fileExtension: result.fileExtension,
        }
      }

      setChapterAudios(newChapterMap)

      const mergedBlob = await concatenateAudioBlobsToWav(blobs)
      const mergedUrl = URL.createObjectURL(mergedBlob)
      activeUrlsRef.current.push(mergedUrl)

      const exactMergedDuration =
        blobs.length === 1
          ? totalDuration
          : mergedBlob.size > 44
            ? (mergedBlob.size - 44) / TTS_BYTE_RATE
            : totalDuration

      setFullAudio({
        audioUrl: mergedUrl,
        blob: mergedBlob,
        durationSeconds: exactMergedDuration,
        fileExtension: blobs.length === 1 ? newChapterMap[chapters[0].id].fileExtension : "wav",
        title: sourceFileName
          ? sourceFileName.replace(/\.(txt|pdf|md)$/i, "")
          : isMy
            ? "စာအုပ် အသံဖိုင်အပြည့်အစုံ"
            : "Full Audiobook",
      })
      toast.success(
        isMy
          ? `အပိုင်း ${chapters.length} ခုလုံးကို အသံဖိုင်အဖြစ် ပြောင်းပြီးပါပြီ!`
          : `All ${chapters.length} parts synthesized!`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to synthesize audiobook."
      toast.error(msg)
    } finally {
      setIsGenerating(false)
      setProgressLabel("")
      setChunkProgress(null)
    }
  }

  const handleDownload = (url: string, name: string, ext: string) => {
    const a = document.createElement("a")
    a.href = url
    a.download = `${name.replace(/[^a-zA-Z0-9\u1000-\u109F_-]+/g, "_")}.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="space-y-4">
      <Card className="border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-[#1C1917] dark:text-[#F5F5F4]">
                <BookOpen className="h-5 w-5 text-[#1C1917] dark:text-[#F5F5F4] shrink-0" />
                <span>{isMy ? "စာအုပ်နှင့် စာရွက်စာတမ်း အသံပြောင်းစက်" : "Book & Document to Audio"}</span>
              </CardTitle>
              <CardDescription className="mt-1 text-xs sm:text-sm">
                {isMy
                  ? "စာအုပ်အခန်းများကို Paste လုပ်ပါ သို့မဟုတ် .txt / .pdf ဖိုင်တင်ပြီး မြန်မာအသံဖြင့် နားဆင်ပါ။"
                  : "Paste long chapters/articles or upload .txt / .pdf files to convert into natural Burmese audio."}
              </CardDescription>
            </div>
            {rawText.trim().length > 0 && (
              <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
                <Clock className="h-3 w-3" />
                <span>~{formatDurationLabel(totalEstimatedSeconds)}</span>
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Upload + Clear bar */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.epub,text/plain,application/pdf,application/epub+zip"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isExtracting || isGenerating}
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
            >
              {isExtracting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>
                {isExtracting
                  ? isMy
                    ? "စာသားထုတ်ယူနေသည်..."
                    : "Extracting..."
                  : isMy
                    ? ".txt / .pdf / .epub ဖိုင်တင်မည်"
                    : "Upload .txt / .pdf / .epub"}
              </span>
            </Button>

            {sourceFileName && (
              <Badge variant="outline" className="gap-1 text-xs">
                <FileText className="h-3 w-3" />
                <span className="max-w-[180px] truncate">{sourceFileName}</span>
              </Badge>
            )}

            {rawText.trim() && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isGenerating}
                onClick={() => {
                  clearGeneratedAudio()
                  setRawText("")
                  setSourceFileName(null)
                  setSelectedChapterId(null)
                  setPendingPdfFile(null)
                  setPdfTotalPages(0)
                }}
                className="ml-auto text-xs text-muted-foreground hover:text-destructive gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isMy ? "ရှင်းလင်းမည်" : "Clear"}</span>
              </Button>
            )}
          </div>

          {/* PDF Vision OCR Page Range Selector */}
          {pendingPdfFile && pdfTotalPages > 0 && (
            <div className="rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-[#57534E] dark:text-[#A1A1AA]" />
                  <span className="text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] truncate">
                    {pendingPdfFile.name}
                  </span>
                </div>
                <Badge variant="secondary" className="text-[11px] tabular-nums">
                  {isMy
                    ? `စုစုပေါင်း ${toBurmeseDigits(pdfTotalPages)} မျက်နှာ`
                    : `${pdfTotalPages} pages`}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs font-medium text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
                  {isMy ? "စာမျက်နှာ (မှ - အထိ)" : "Pages (From - To)"}
                </Label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={pdfTotalPages}
                    value={pdfStartPage}
                    onChange={(e) => setPdfStartPage(Math.max(1, Number(e.target.value) || 1))}
                    aria-label="Start page"
                    className="h-8 w-16 rounded-lg border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] px-2 text-center text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] tabular-nums"
                  />
                  <span className="text-xs text-[#57534E] dark:text-[#A1A1AA]">-</span>
                  <input
                    type="number"
                    min={1}
                    max={pdfTotalPages}
                    value={pdfEndPage}
                    onChange={(e) =>
                      setPdfEndPage(Math.min(pdfTotalPages, Math.max(1, Number(e.target.value) || 1)))
                    }
                    aria-label="End page"
                    className="h-8 w-16 rounded-lg border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] px-2 text-center text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] tabular-nums"
                  />
                </div>

                <Button
                  type="button"
                  size="sm"
                  disabled={isExtracting || isGenerating}
                  onClick={handleExtractPdfRange}
                  className="ml-auto h-8 rounded-lg bg-[#1C1917] hover:bg-[#292524] dark:bg-[#F5F5F4] dark:hover:bg-[#E7E5E4] text-[#FAF8F5] dark:text-[#18181B] text-xs font-medium gap-1.5"
                >
                  {isExtracting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <BookOpen className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {isExtracting
                      ? isMy
                        ? "Unicode ပြောင်းနေသည်..."
                        : "Extracting..."
                      : isMy
                        ? "PDF မှ စာသားထုတ်မည်"
                        : "Extract Pages"}
                  </span>
                </Button>
              </div>
            </div>
          )}

          {/* Textarea */}
          <div className="space-y-1.5">
            <Label htmlFor="audiobook-input" className="text-xs font-medium text-muted-foreground">
              {isMy ? "စာသား (သို့) အခန်းများ" : "Book Chapter / Article Text"}
            </Label>
            <Textarea
              id="audiobook-input"
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value)
              }}
              placeholder={
                isMy
                  ? "စာအုပ်အခန်း သို့မဟုတ် ဆောင်းပါးရှည်များကို ဤနေရာတွင် Paste လုပ်ပါ..."
                  : "Paste your book chapter, article, or study notes here..."
              }
              className="min-h-[150px] resize-y text-sm leading-relaxed"
            />
          </div>

          {/* Audiobook Mode Switcher (Direct vs YouTube Recap Storytelling) */}
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-medium text-muted-foreground">
                {isMy ? "စာဖတ်မုဒ် (Narration Mode)" : "Narration Mode"}
              </Label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={audiobookMode === "direct" ? "default" : "outline"}
                  onClick={() => setAudiobookMode("direct")}
                  className="h-7 px-2.5 text-xs"
                >
                  {isMy ? "Direct Audiobook" : "Direct Audiobook"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={audiobookMode === "recap" ? "default" : "outline"}
                  onClick={() => setAudiobookMode("recap")}
                  className="h-7 px-2.5 text-xs"
                >
                  {isMy ? "စာအုပ်ဇာတ်ကြောင်းပြော" : "Storyteller Mode"}
                </Button>
              </div>
            </div>
            {audiobookMode === "recap" && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-muted-foreground font-myanmar">
                  {isMy
                    ? "စာအုပ်အခန်းကို စကားပြောဇာတ်ကြောင်းအဖြစ် ပြန်ရေးသားပေးပါမည်။"
                    : "Rewrites the chapter into engaging conversational storyteller narration."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!rawText.trim() || isRewritingRecap || isGenerating}
                  onClick={handleRewriteAsRecap}
                  className="h-7 px-3 text-xs gap-1.5"
                >
                  {isRewritingRecap ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PenLine className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>{isMy ? "ဇာတ်ကြောင်းပြော ပြောင်းမည်" : "Rewrite as Story"}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Voice & Speed Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {isMy ? "အသံရွေးချယ်ရန်" : "Narrator Voice"}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(BURMESE_VOICE_PRESETS) as BurmeseVoiceType[]).map((key) => {
                  const preset = BURMESE_VOICE_PRESETS[key]
                  const selected = voiceType === key
                  return (
                    <Button
                      key={key}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVoiceType(key)}
                      className="text-xs justify-center"
                    >
                      {isMy ? preset.labelMy : preset.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {isMy ? "ဖတ်နှုန်း" : "Reading Speed"}
              </Label>
              <div className="grid grid-cols-4 gap-1.5">
                {VOICEOVER_SPEEDS.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={speed === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSpeed(s)}
                    className="text-xs"
                  >
                    {s}x
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Chapters Overview */}
          {chapters.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">
                  {isMy
                    ? `အပိုင်း ${chapters.length} ပိုင်း ခွဲထားသည်`
                    : `Auto-split into ${chapters.length} ${chapters.length === 1 ? "part" : "parts"}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isMy ? "ခန့်မှန်းကြာချိန်" : "Est. listening"}: ~{formatDurationLabel(totalEstimatedSeconds)}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {chapters.map((ch) => {
                  const isSelected = activeChapter?.id === ch.id
                  const isDone = Boolean(chapterAudios[ch.id])
                  const est = estimateSpokenDurationSeconds(ch.text, speed)
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setSelectedChapterId(ch.id)}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isSelected
                          ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#1C1917] dark:bg-[#F5F5F4] text-[#FAF8F5] dark:text-[#18181B]"
                          : "border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#F0EDE8] dark:hover:bg-[#3F3F46]"
                      }`}
                    >
                      <span className="max-w-[140px] truncate">{ch.title}</span>
                      <span className="text-[10px] opacity-75">({formatDurationLabel(est)})</span>
                      {isDone && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isSelected ? "bg-[#FAF8F5] dark:bg-[#18181B]" : "bg-amber-600 dark:bg-amber-400"
                          }`}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Generate Buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={smartChunks.length === 0 || isGenerating || isExtracting}
              onTouchStart={() => unlockIosAudio()}
              onClick={handleStartAutoQueue}
              className="flex-1 gap-2 border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#F0EDE8] dark:hover:bg-[#3F3F46]"
            >
              <Headphones className="h-4 w-4" />
              <span>
                {isMy
                  ? `တိုက်ရိုက်နားဆင်မည် (${smartChunks.length} ပိုင်း Pre-Fetch)`
                  : `Stream Auto-Queue (${smartChunks.length} chunks)`}
              </span>
            </Button>

            {activeChapter && chapters.length > 1 && (
              <Button
                type="button"
                variant="outline"
                disabled={isGenerating || isExtracting}
                onClick={() => handleGenerateChapter(activeChapter)}
                className="flex-1 gap-2"
              >
                <Play className="h-4 w-4" />
                <span>
                  {isMy
                    ? `"${activeChapter.title}" ကိုသာ အသံပြောင်းမည်`
                    : `Synthesize "${activeChapter.title}"`}
                </span>
              </Button>
            )}

            <Button
              type="button"
              disabled={chapters.length === 0 || isGenerating || isExtracting}
              onClick={handleGenerateAll}
              className="flex-1 gap-2"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4" />
              )}
              <span>
                {isGenerating
                  ? progressLabel || (isMy ? "အသံဖိုင် ပြင်ဆင်နေပါသည်..." : "Preparing audio...")
                  : chapters.length > 1
                    ? isMy
                      ? `အပိုင်း ${chapters.length} ခုလုံး အသံပြောင်းမည်`
                      : `Generate Full Audiobook (${chapters.length} parts)`
                    : isMy
                      ? "အသံဖိုင် ပြောင်းလဲမည်"
                      : "Generate Audio"}
              </span>
            </Button>
          </div>

          {isGenerating && (progressLabel || chunkProgress) && (
            <div className="space-y-1.5 rounded-lg border border-[#E7E5E4] dark:border-[#3F3F46] bg-muted/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate font-medium text-foreground">
                  {progressLabel || (isMy ? "အသံဖိုင် ပြင်ဆင်နေပါသည်..." : "Preparing audio...")}
                </span>
                {chunkProgress && chunkProgress.totalChunks > 1 && (
                  <span className="shrink-0 font-semibold text-foreground">
                    {Math.round((chunkProgress.currentChunk / chunkProgress.totalChunks) * 100)}%
                  </span>
                )}
              </div>
              {chunkProgress && chunkProgress.totalChunks > 1 && (
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-[#1C1917] dark:bg-[#F5F5F4] transition-all duration-200"
                    style={{
                      width: `${Math.round((chunkProgress.currentChunk / chunkProgress.totalChunks) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pre-Fetch Auto-Queue Continuous Player */}
      <audio
        ref={queueAudioRef}
        playsInline
        preload="auto"
        className="sr-only"
        onEnded={() => {
          const nextIdx = queueIndex + 1
          if (nextIdx < smartChunks.length) {
            void playQueueChunkAt(nextIdx, queueRunIdRef.current)
          } else {
            setQueuePlaying(false)
            toast.success(isMy ? "စာအုပ်တစ်ခုလုံး ဖတ်ပြီးပါပြီ!" : "Finished reading all chunks!")
          }
        }}
      />

      {queueActive && smartChunks.length > 0 && (
        <Card className="border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-[#1C1917] dark:text-[#F5F5F4]">
                <Headphones className="h-4 w-4 text-[#1C1917] dark:text-[#F5F5F4]" />
                <span>
                  {isMy ? "Pre-Fetch Auto-Queue Player" : "Pre-Fetch Auto-Queue Player"}
                </span>
              </CardTitle>
              <Badge variant="secondary" className="text-xs tabular-nums">
                {isMy
                  ? `အပိုင်း ${toBurmeseDigits(queueIndex + 1)} / ${toBurmeseDigits(smartChunks.length)}`
                  : `Chunk ${queueIndex + 1} / ${smartChunks.length}`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Synced Active Chunk Reader */}
            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {smartChunks.map((chunkText, idx) => {
                const isActiveChunk = idx === queueIndex
                return (
                  <button
                    key={idx}
                    ref={(el) => {
                      chunkRefs.current[idx] = el
                    }}
                    type="button"
                    onClick={() => {
                      unlockIosAudio()
                      void playQueueChunkAt(idx, queueRunIdRef.current)
                    }}
                    className={`w-full text-left rounded-xl border p-2.5 transition-all cursor-pointer ${
                      isActiveChunk
                        ? "border-[#1C1917] dark:border-[#F5F5F4] bg-[#F0EDE8] dark:bg-[#27272A] text-[#1C1917] dark:text-[#F5F5F4] shadow-2xs"
                        : "border-[#E7E5E4]/80 dark:border-[#3F3F46]/70 bg-white/70 dark:bg-[#27272A]/40 text-[#57534E] dark:text-[#A1A1AA] hover:bg-white dark:hover:bg-[#27272A]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider tabular-nums opacity-75">
                        {isMy ? `အပိုင်း ${toBurmeseDigits(idx + 1)}` : `Chunk ${idx + 1}`}
                      </span>
                      {isActiveChunk && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#1C1917] dark:bg-[#F5F5F4] px-2 py-0.5 text-[10px] font-semibold text-[#FAF8F5] dark:text-[#18181B]">
                          {isMy ? "ဖတ်နေသည်" : "Playing"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed font-myanmar line-clamp-3">
                      {chunkText}
                    </p>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={queueIndex <= 0 || queueLoadingChunk}
                  onClick={() => {
                    unlockIosAudio()
                    void playQueueChunkAt(queueIndex - 1, queueRunIdRef.current)
                  }}
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={queueLoadingChunk}
                  onClick={handleToggleQueuePlayPause}
                  className="gap-1.5 bg-[#1C1917] hover:bg-[#292524] dark:bg-[#F5F5F4] dark:hover:bg-[#E7E5E4] text-[#FAF8F5] dark:text-[#18181B]"
                >
                  {queueLoadingChunk ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : queuePlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span>
                    {queueLoadingChunk
                      ? isMy
                        ? "ပြင်ဆင်နေသည်..."
                        : "Loading..."
                      : queuePlaying
                        ? isMy
                          ? "ခဏရပ်"
                          : "Pause"
                        : isMy
                          ? "ဆက်ဖွင့်မည်"
                          : "Resume"}
                  </span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={queueIndex >= smartChunks.length - 1 || queueLoadingChunk}
                  onClick={() => {
                    unlockIosAudio()
                    void playQueueChunkAt(queueIndex + 1, queueRunIdRef.current)
                  }}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={stopAutoQueue}
                className="text-xs text-muted-foreground hover:text-destructive gap-1"
              >
                <Square className="h-3.5 w-3.5" />
                <span>{isMy ? "ရပ်မည်" : "Stop"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audio Player & Download */}
      {fullAudio && (
        <Card className="border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-[#1C1917] dark:text-[#F5F5F4]">
                <Headphones className="h-4 w-4 text-[#1C1917] dark:text-[#F5F5F4]" />
                <span className="truncate">{fullAudio.title}</span>
              </CardTitle>
              <Badge variant="secondary" className="text-xs shrink-0">
                {isMy
                  ? `စုစုပေါင်း အသံကြာချိန်: ${formatAudioClockDuration(fullAudio.durationSeconds)}`
                  : `Total Duration: ${formatAudioClockDuration(fullAudio.durationSeconds)}`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <IosAudioPlayer
              src={fullAudio.audioUrl}
              title={fullAudio.title}
              subtitle={
                isMy
                  ? `စုစုပေါင်း အသံကြာချိန်: ${formatAudioClockDuration(fullAudio.durationSeconds)}`
                  : `Total Duration: ${formatAudioClockDuration(fullAudio.durationSeconds)}`
              }
              initialDuration={fullAudio.durationSeconds}
              fileExtension={fullAudio.fileExtension}
              onDownload={() =>
                handleDownload(fullAudio.audioUrl, fullAudio.title, fullAudio.fileExtension)
              }
              onShare={() =>
                void shareAudioFile({
                  blob: fullAudio.blob,
                  url: fullAudio.audioUrl,
                  title: fullAudio.title,
                  fileExtension: fullAudio.fileExtension,
                })
              }
              downloadLabel={isMy ? "အသံဖိုင် ဒေါင်းလုဒ်" : "Download Audio"}
              shareLabel="Share"
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

