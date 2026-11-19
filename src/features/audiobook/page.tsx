"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  BookOpen,
  Clock,
  Download,
  FileText,
  Headphones,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { extractTextFromDocument } from "@/api/aiService"
import {
  BURMESE_VOICE_PRESETS,
  VOICEOVER_SPEEDS,
  concatenateAudioBlobsToWav,
  estimateSpokenDurationSeconds,
  generateBurmeseVoiceover,
  type BurmeseVoiceType,
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
import { toast } from "@/components/ui/sonner"
import { Textarea } from "@/components/ui/textarea"
import { useUIStore } from "@/store/useUIStore"
import {
  formatDurationLabel,
  splitDocumentIntoChapters,
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

  const [voiceType, setVoiceType] = useState<BurmeseVoiceType>("female")
  const [speed, setSpeed] = useState<VoiceoverSpeed>(1.0)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)

  const [isGenerating, setIsGenerating] = useState(false)
  const [progressLabel, setProgressLabel] = useState("")
  const [chapterAudios, setChapterAudios] = useState<Record<string, SynthesizedChapterAudio>>({})
  const [fullAudio, setFullAudio] = useState<{
    audioUrl: string
    blob: Blob
    durationSeconds: number
    fileExtension: "wav" | "mp3"
    title: string
  } | null>(null)

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

  const clearGeneratedAudio = () => {
    revokeAllAudioUrls()
    setChapterAudios({})
    setFullAudio(null)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

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
    setProgressLabel(
      isMy ? `${chapter.title} ကို အသံပြောင်းနေသည်...` : `Synthesizing ${chapter.title}...`
    )
    try {
      const result = await generateBurmeseVoiceover(chapter.text, voiceType, speed, {
        deliveryTone: "storytelling",
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
    }
  }

  const handleGenerateAll = async () => {
    if (chapters.length === 0) return
    setIsGenerating(true)
    clearGeneratedAudio()

    try {
      const blobs: Blob[] = []
      let totalDuration = 0
      const newChapterMap: Record<string, SynthesizedChapterAudio> = {}

      for (let i = 0; i < chapters.length; i += 1) {
        const ch = chapters[i]
        setProgressLabel(
          isMy
            ? `အပိုင်း ${i + 1} / ${chapters.length} ကို အသံပြောင်းနေသည်...`
            : `Synthesizing part ${i + 1} of ${chapters.length}...`
        )
        const result = await generateBurmeseVoiceover(ch.text, voiceType, speed, {
          deliveryTone: "storytelling",
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

      setFullAudio({
        audioUrl: mergedUrl,
        blob: mergedBlob,
        durationSeconds: totalDuration,
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
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <BookOpen className="h-5 w-5 text-blue-500 shrink-0" />
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
              accept=".txt,.md,.pdf,text/plain,application/pdf"
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
                    ? ".txt / .pdf ဖိုင်တင်မည်"
                    : "Upload .txt / .pdf"}
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
                }}
                className="ml-auto text-xs text-muted-foreground hover:text-destructive gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isMy ? "ရှင်းလင်းမည်" : "Clear"}</span>
              </Button>
            )}
          </div>

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
                          ? "border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400"
                          : "border-border/60 bg-background hover:bg-accent"
                      }`}
                    >
                      <span className="max-w-[140px] truncate">{ch.title}</span>
                      <span className="text-[10px] text-muted-foreground">({formatDurationLabel(est)})</span>
                      {isDone && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Generate Buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
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
              className="flex-1 gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>
                {isGenerating
                  ? progressLabel || (isMy ? "အသံပြောင်းနေသည်..." : "Synthesizing...")
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
        </CardContent>
      </Card>

      {/* Audio Player & Download */}
      {fullAudio && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Headphones className="h-4 w-4 text-emerald-500" />
                <span className="truncate">{fullAudio.title}</span>
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {formatDurationLabel(fullAudio.durationSeconds)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <audio controls src={fullAudio.audioUrl} className="w-full h-10" />
            <Button
              type="button"
              onClick={() =>
                handleDownload(fullAudio.audioUrl, fullAudio.title, fullAudio.fileExtension)
              }
              className="w-full sm:w-auto gap-2"
              size="sm"
            >
              <Download className="h-4 w-4" />
              <span>{isMy ? "အသံဖိုင် ဒေါင်းလုဒ်လုပ်မည်" : "Download Audio File"}</span>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
