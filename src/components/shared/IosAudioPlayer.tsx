"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Pause, Play, RotateCcw, RotateCw, Share2 } from "lucide-react"
import { cn, triggerHaptic } from "@/lib/utils"

interface IosAudioPlayerProps {
  src: string
  title?: string
  subtitle?: string
  initialDuration?: number
  fileExtension?: string
  onDownload?: () => void
  onShare?: () => void
  downloadLabel?: string
  shareLabel?: string
  compact?: boolean
  accentColor?: "blue" | "emerald"
  className?: string
}

const BAR_COUNT = 38

function generateWaveformHeights(seedSource: string): number[] {
  let hash = 2166136261
  for (let i = 0; i < seedSource.length; i++) {
    hash ^= seedSource.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const bars: number[] = []
  for (let i = 0; i < BAR_COUNT; i++) {
    hash = Math.imul(hash ^ (i + 1), 16777619)
    const raw = ((hash >>> 0) % 100) / 100
    // Natural voice envelope: taller in the middle, varied peaks
    const envelope = 0.55 + 0.45 * Math.sin((i / BAR_COUNT) * Math.PI)
    const height = Math.max(22, Math.min(100, Math.round((0.25 + raw * 0.75) * envelope * 100)))
    bars.push(height)
  }
  return bars
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function IosAudioPlayer({
  src,
  title,
  subtitle,
  initialDuration = 0,
  fileExtension,
  onDownload,
  onShare,
  downloadLabel,
  shareLabel,
  compact = false,
  accentColor = "blue",
  className,
}: IosAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(initialDuration)

  const bars = useMemo(() => generateWaveformHeights(src || title || "voice-memo"), [src, title])

  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(initialDuration)
  }, [src, initialDuration])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const syncDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }
    const onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }
    const onPause = () => setIsPlaying(false)
    const onPlay = () => setIsPlaying(true)

    audio.addEventListener("loadedmetadata", syncDuration)
    audio.addEventListener("loadeddata", syncDuration)
    audio.addEventListener("canplay", syncDuration)
    audio.addEventListener("durationchange", syncDuration)
    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("play", onPlay)

    audio.load()

    return () => {
      audio.removeEventListener("loadedmetadata", syncDuration)
      audio.removeEventListener("loadeddata", syncDuration)
      audio.removeEventListener("canplay", syncDuration)
      audio.removeEventListener("durationchange", syncDuration)
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("play", onPlay)
    }
  }, [src])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    triggerHaptic(10)
    if (isPlaying) {
      audio.pause()
    } else {
      try {
        await audio.play()
      } catch {
        setIsPlaying(false)
      }
    }
  }

  const skipBy = (delta: number) => {
    const audio = audioRef.current
    if (!audio) return
    triggerHaptic(8)
    const maxDur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration
    const next = Math.max(0, Math.min(maxDur || 0, audio.currentTime + delta))
    audio.currentTime = next
    setCurrentTime(next)
  }

  const handleSeekBarClick = (index: number) => {
    const audio = audioRef.current
    const maxDur =
      audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration
    if (!audio || !maxDur) return
    triggerHaptic(8)
    const ratio = (index + 0.5) / bars.length
    const nextTime = ratio * maxDur
    audio.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  const handleBuiltInDownload = () => {
    if (onDownload) {
      onDownload()
      return
    }
    const link = document.createElement("a")
    link.href = src
    link.download = `${(title || "audio").replace(/[^a-zA-Z0-9_-]+/g, "_")}.${fileExtension || "mp3"}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0
  const activeBarIndex = Math.floor(progress * bars.length)

  const accentBg =
    accentColor === "emerald"
      ? "bg-emerald-500 dark:bg-emerald-400"
      : "bg-[#007AFF] dark:bg-[#0A84FF]"

  return (
    <div
      className={cn(
        "rounded-[20px] border-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)] bg-[#F2F2F7]/85 dark:bg-[#1C1C1E] p-3.5 sm:p-4 space-y-3",
        className
      )}
    >
      <audio ref={audioRef} src={src} playsInline preload="auto" className="sr-only" />

      {/* Top Metadata Row */}
      {(title || subtitle) && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <p className="text-xs sm:text-sm font-semibold tracking-tight text-foreground truncate font-myanmar">
                {title}
              </p>
            )}
            {subtitle && (
              <p className="text-[11px] text-muted-foreground truncate font-myanmar">
                {subtitle}
              </p>
            )}
          </div>
          {fileExtension && (
            <span className="shrink-0 rounded-full bg-black/[0.06] dark:bg-white/[0.1] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {fileExtension}
            </span>
          )}
        </div>
      )}

      {/* Interactive Voice Memos Waveform */}
      <div className="space-y-1.5">
        <div
          className={cn(
            "flex items-center justify-between gap-[2px] sm:gap-[3px] px-1 select-none",
            compact ? "h-9" : "h-11"
          )}
          role="slider"
          aria-label="Audio playback progress"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
        >
          {bars.map((height, idx) => {
            const isPlayed = idx <= activeBarIndex && currentTime > 0
            const isCurrent = isPlaying && idx === activeBarIndex
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSeekBarClick(idx)}
                aria-label={`Seek to ${Math.round(((idx + 1) / bars.length) * 100)}%`}
                className="flex-1 h-full flex items-center justify-center cursor-pointer group focus:outline-none"
              >
                <span
                  className={cn(
                    "w-full max-w-[4px] rounded-full transition-all duration-150",
                    isPlayed
                      ? accentBg
                      : "bg-neutral-300 dark:bg-neutral-700 group-hover:bg-neutral-400 dark:group-hover:bg-neutral-500",
                    isCurrent && "scale-y-110"
                  )}
                  style={{ height: `${height}%` }}
                />
              </button>
            )
          })}
        </div>

        {/* Tabular-nums Time Counters */}
        <div className="flex items-center justify-between px-1 text-[11px] font-medium text-muted-foreground tabular-nums">
          <span>{formatClock(currentTime)}</span>
          <span>-{formatClock(Math.max(0, duration - currentTime))}</span>
        </div>
      </div>

      {/* Transport Controls & 1-Tap Pills */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => skipBy(-5)}
            aria-label="Skip back 5 seconds"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-foreground hover:bg-black/[0.1] dark:hover:bg-white/[0.14] transition-all active:scale-95 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm transition-all active:scale-95 cursor-pointer",
              accentBg
            )}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" strokeWidth={1.75} />
            ) : (
              <Play className="h-4 w-4 fill-current ml-0.5" strokeWidth={1.75} />
            )}
          </button>

          <button
            type="button"
            onClick={() => skipBy(5)}
            aria-label="Skip forward 5 seconds"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-foreground hover:bg-black/[0.1] dark:hover:bg-white/[0.14] transition-all active:scale-95 cursor-pointer"
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>

        {/* 1-Tap Download & Share Pills */}
        <div className="flex items-center gap-1.5">
          {(onDownload || fileExtension) && (
            <button
              type="button"
              onClick={handleBuiltInDownload}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white dark:bg-[#2C2C2E] px-3 text-xs font-medium text-foreground border-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)] shadow-xs hover:bg-neutral-50 dark:hover:bg-[#3A3A3C] transition-all active:scale-95 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-[#007AFF] dark:text-[#0A84FF]" strokeWidth={1.75} />
              <span className="font-myanmar">{downloadLabel || "Save"}</span>
            </button>
          )}
          {onShare && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic(10)
                onShare()
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#007AFF]/12 dark:bg-[#0A84FF]/18 px-3 text-xs font-medium text-[#007AFF] dark:text-[#0A84FF] hover:bg-[#007AFF]/20 dark:hover:bg-[#0A84FF]/25 transition-all active:scale-95 cursor-pointer"
            >
              <Share2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="font-myanmar">{shareLabel || "Share"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

