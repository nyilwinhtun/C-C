import { useCallback, useEffect, useMemo, useState } from "react"
import { Square, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { t } from "@/locales/translations"
import { useUIStore } from "@/store/useUIStore"
import { cn } from "@/lib/utils"

const SPEED_OPTIONS = [0.85, 1.0, 1.2] as const
type SpeechRate = (typeof SPEED_OPTIONS)[number]

export interface ReadAloudButtonProps {
  /** Text to read aloud (timestamps, markdown, and emojis are stripped automatically). */
  text: string
  /** Target speech language: `"my"` (or `"myanmar"`) for Burmese, `"en"` (or `"english"`) for English. */
  language?: string
  /** Disable the player controls. */
  disabled?: boolean
  /** Optional wrapper class name. */
  className?: string
  /** Compact header size (`"xs"`) or standard footer size (`"sm"`). */
  size?: "xs" | "sm"
}

/**
 * Strip non-spoken artifacts (timestamps, markdown symbols, and emojis)
 * so Web Speech API reads natural spoken lines only.
 */
export function sanitizeSpeechText(raw: string): string {
  if (!raw) return ""

  return raw
    // Remove bracketed timestamps like [0:00-0:03], [0-3s], [00:00 - 00:15], [0:00]
    .replace(/\[\s*\d+(?::\d+)?\s*s?(?:\s*[-–—]\s*\d+(?::\d+)?\s*s?)?\s*\]/gi, " ")
    // Remove emojis, pictographs, variation selectors, and ZWJ sequences
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, "")
    // Remove markdown headings, bold/italic markers, and backticks
    .replace(/[*#`_~]/g, "")
    // Remove leading bullet dashes/symbols at start of lines
    .replace(/^\s*[-•–—]+\s+/gm, "")
    // Remove standalone dashes surrounded by whitespace
    .replace(/(^|\s)-+(\s|$)/g, " ")
    // Collapse horizontal whitespace while preserving line breaks for natural pauses
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}

function normalizeSpeechLanguage(language?: string): "my" | "en" {
  if (!language) return "en"
  const lower = language.toLowerCase()
  if (lower === "my" || lower.startsWith("myanmar")) {
    return "my"
  }
  return "en"
}

function formatRateLabel(rate: SpeechRate): string {
  return rate === 1.0 ? "1.0x" : `${rate}x`
}

export function ReadAloudButton({
  text,
  language = "en",
  disabled = false,
  className,
  size = "xs",
}: ReadAloudButtonProps) {
  const uiLanguage = useUIStore((state) => state.language)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [rateIndex, setRateIndex] = useState<number>(1) // Default 1.0x
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  const isSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"

  const rate = SPEED_OPTIONS[rateIndex]
  const speechLang = normalizeSpeechLanguage(language)
  const cleanedText = useMemo(() => sanitizeSpeechText(text), [text])

  // Load available system voices (and listen for async voice loading)
  useEffect(() => {
    if (!isSupported) return

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices()
      if (available.length > 0) {
        setVoices(available)
      }
    }

    loadVoices()
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices)
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoices)
    }
  }, [isSupported])

  const stopSpeaking = useCallback(() => {
    if (!isSupported) return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [isSupported])

  // Stop automatically on unmount or when user switches browser tabs
  useEffect(() => {
    if (!isSupported) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        window.speechSynthesis.cancel()
        setIsSpeaking(false)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.speechSynthesis.cancel()
    }
  }, [isSupported])

  // Stop speaking if the source text changes
  useEffect(() => {
    if (!isSupported) return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [cleanedText, isSupported])

  const speakText = useCallback(
    (playbackRate: SpeechRate) => {
      if (!isSupported || !cleanedText) return

      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(cleanedText)
      const matchedVoice = voices.find((v) =>
        v.lang.toLowerCase().startsWith(speechLang)
      )

      if (matchedVoice) {
        utterance.voice = matchedVoice
        utterance.lang = matchedVoice.lang
      } else {
        utterance.lang = speechLang === "my" ? "my-MM" : "en-US"
      }

      utterance.rate = playbackRate

      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)

      setIsSpeaking(true)
      window.speechSynthesis.speak(utterance)
    },
    [isSupported, cleanedText, voices, speechLang]
  )

  const handleTogglePlay = useCallback(() => {
    if (isSpeaking) {
      stopSpeaking()
    } else {
      speakText(rate)
    }
  }, [isSpeaking, stopSpeaking, speakText, rate])

  const handleCycleSpeed = useCallback(() => {
    const nextIndex = (rateIndex + 1) % SPEED_OPTIONS.length
    const nextRate = SPEED_OPTIONS[nextIndex]
    setRateIndex(nextIndex)

    if (isSpeaking) {
      speakText(nextRate)
    }
  }, [rateIndex, isSpeaking, speakText])

  if (!isSupported) {
    return null
  }

  const isDisabled = disabled || !cleanedText
  const buttonHeight = size === "xs" ? "h-7 px-2 text-xs" : "h-9 px-3 text-xs sm:text-sm"
  const pillHeight = size === "xs" ? "h-7 px-2 text-[11px]" : "h-9 px-2.5 text-xs"

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Button
        type="button"
        variant={isSpeaking ? "secondary" : "ghost"}
        size="sm"
        onClick={handleTogglePlay}
        disabled={isDisabled}
        aria-pressed={isSpeaking}
        className={cn(
          buttonHeight,
          "gap-1.5 font-medium transition-colors",
          isSpeaking &&
            "bg-indigo-500/15 text-indigo-600 hover:bg-indigo-500/20 dark:text-indigo-400"
        )}
      >
        {isSpeaking ? (
          <>
            <Square className="h-3 w-3 fill-current shrink-0" aria-hidden="true" />
            <span className="inline-flex items-end gap-0.5 h-3" aria-hidden="true">
              <span className="w-0.5 h-2 bg-current rounded-full animate-pulse" />
              <span className="w-0.5 h-3 bg-current rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-0.5 h-1.5 bg-current rounded-full animate-pulse [animation-delay:300ms]" />
            </span>
            <span>{t(uiLanguage, "generator.readAloudStop")}</span>
          </>
        ) : (
          <>
            <Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t(uiLanguage, "generator.readAloud")}</span>
          </>
        )}
      </Button>

      <button
        type="button"
        onClick={handleCycleSpeed}
        disabled={isDisabled}
        title={t(uiLanguage, "generator.readAloudSpeed")}
        aria-label={`${t(uiLanguage, "generator.readAloudSpeed")}: ${formatRateLabel(rate)}`}
        className={cn(
          pillHeight,
          "inline-flex items-center justify-center rounded-full border border-border/60 bg-muted/40 font-mono font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        {formatRateLabel(rate)}
      </button>
    </div>
  )
}
