"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Pause, Play, RotateCcw, RotateCw, Share2 } from "lucide-react"
import { cn, triggerHaptic } from "@/lib/utils"
import { setIosAudioSessionPlayback, unlockIosAudio } from "@/lib/iosAudio"

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

const BAR_COUNT = 42
const PLAYBACK_SPEEDS = [0.8, 1.0, 1.2, 1.5] as const

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
    const envelope = 0.55 + 0.45 * Math.sin((i / BAR_COUNT) * Math.PI)
    const height = Math.max(20, Math.min(100, Math.round((0.22 + raw * 0.78) * envelope * 100)))
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
  fileExtension = "wav",
  onDownload,
  onShare,
  downloadLabel,
  shareLabel,
  compact = false,
  className,
}: IosAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackSpeedRef = useRef<number>(1.0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(initialDuration)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0)

  const bars = useMemo(() => generateWaveformHeights(src || title || "voice-memo"), [src, title])

  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(initialDuration)
  }, [src, initialDuration])

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed
    const audio = audioRef.current
    if (!audio) return
    audio.playbackRate = playbackSpeed
  }, [playbackSpeed, src])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // Reset player state before loading new audio so sample-rate changes
    // (e.g. 44.1kHz mic -> 24kHz TTS) never cause silent playback.
    // Parent/store actions manage blob URL revocation when replacing audio.
    audio.pause()
    audio.currentTime = 0
    audio.removeAttribute("src")
    audio.load()

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
    const onPlay = () => {
      audio.playbackRate = playbackSpeedRef.current
      setIsPlaying(true)
    }

    audio.addEventListener("loadedmetadata", syncDuration)
    audio.addEventListener("loadeddata", syncDuration)
    audio.addEventListener("canplay", syncDuration)
    audio.addEventListener("durationchange", syncDuration)
    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("play", onPlay)

    if (src) {
      audio.src = src
      audio.load()
    }

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

  // Register Lock Screen / Control Center MediaSession controls
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !src) return

    const ms = navigator.mediaSession
    if (typeof MediaMetadata !== "undefined") {
      ms.metadata = new MediaMetadata({
        title: title || "Audio",
        artist: "Content Creator Studio",
        album: subtitle || "Audio Studio",
      })
    }
    ms.playbackState = isPlaying ? "playing" : "paused"

    const handlePlay = () => {
      const audio = audioRef.current
      if (!audio) return
      setIosAudioSessionPlayback()
      unlockIosAudio()
      audio.playbackRate = playbackSpeedRef.current
      void audio.play().catch(() => setIsPlaying(false))
    }
    const handlePause = () => {
      audioRef.current?.pause()
    }
    const handleSeekBy = (delta: number) => {
      const audio = audioRef.current
      if (!audio) return
      const maxDur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration
      const next = Math.max(0, Math.min(maxDur || 0, audio.currentTime + delta))
      audio.currentTime = next
      setCurrentTime(next)
    }

    try {
      ms.setActionHandler("play", handlePlay)
      ms.setActionHandler("pause", handlePause)
      ms.setActionHandler("seekbackward", (details) =>
        handleSeekBy(-(details.seekOffset ?? 15))
      )
      ms.setActionHandler("seekforward", (details) =>
        handleSeekBy(details.seekOffset ?? 15)
      )
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
  }, [src, title, subtitle, isPlaying, duration])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    setIosAudioSessionPlayback()
    unlockIosAudio()
    triggerHaptic(10)
    if (isPlaying) {
      audio.pause()
    } else {
      try {
        setIosAudioSessionPlayback()
        audio.playbackRate = playbackSpeed
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

  const toggleSpeed = () => {
    triggerHaptic(6)
    setPlaybackSpeed((prev) => {
      const idx = PLAYBACK_SPEEDS.indexOf(prev as (typeof PLAYBACK_SPEEDS)[number])
      return PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length]
    })
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
    link.download = `${(title || "recording").replace(/[^a-zA-Z0-9_-]+/g, "_")}.${fileExtension || "wav"}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0
  const activeBarIndex = Math.floor(progress * bars.length)

  return (
    <div
      className={cn(
        "rounded-[16px] border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5] dark:bg-[#18181B] p-3.5 sm:p-4 space-y-3",
        className
      )}
    >
      <audio ref={audioRef} playsInline preload="auto" className="sr-only" />

      {/* Top Metadata Row */}
      {(title || subtitle) && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <p className="text-xs sm:text-sm font-semibold tracking-tight text-[#1C1917] dark:text-[#F5F5F4] truncate font-myanmar">
                {title}
              </p>
            )}
            {subtitle && (
              <p className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] truncate font-myanmar">
                {subtitle}
              </p>
            )}
          </div>
          {fileExtension && (
            <span className="shrink-0 rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#57534E] dark:text-[#A1A1AA]">
              {fileExtension}
            </span>
          )}
        </div>
      )}

      {/* Voice Memos-Style Minimalist Waveform Progress Bar */}
      <div className="space-y-1.5">
        <div
          className={cn(
            "flex items-center justify-between gap-[2px] px-1 select-none",
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
                    "w-full max-w-[3px] rounded-full transition-colors duration-150",
                    isPlayed
                      ? "bg-amber-700 dark:bg-amber-500"
                      : "bg-[#D6D3D1] dark:bg-[#3F3F46] group-hover:bg-[#A8A29E] dark:group-hover:bg-[#52525B]"
                  )}
                  style={{ height: `${height}%` }}
                />
              </button>
            )
          })}
        </div>

        {/* Tabular-nums Time Counters */}
        <div className="flex items-center justify-between px-1 text-[11px] font-medium text-[#57534E] dark:text-[#A1A1AA] tabular-nums">
          <span>{formatClock(currentTime)}</span>
          <span>-{formatClock(Math.max(0, duration - currentTime))}</span>
        </div>
      </div>

      {/* Transport Controls & Tactile Utility Pills */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => skipBy(-15)}
            aria-label="Skip back 15 seconds"
            className="inline-flex h-8 items-center gap-1 px-2.5 rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[11px] font-medium text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#F0EDE8] dark:hover:bg-[#3F3F46] transition-all active:scale-95 cursor-pointer tabular-nums"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={1.75} />
            <span>15s</span>
          </button>

          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#1C1917] dark:bg-[#F5F5F4] text-[#FAF8F5] dark:text-[#18181B] hover:bg-[#292524] dark:hover:bg-[#E7E5E4] transition-all active:scale-95 cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" strokeWidth={1.75} />
            ) : (
              <Play className="h-4 w-4 fill-current ml-0.5" strokeWidth={1.75} />
            )}
          </button>

          <button
            type="button"
            onClick={() => skipBy(15)}
            aria-label="Skip forward 15 seconds"
            className="inline-flex h-8 items-center gap-1 px-2.5 rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[11px] font-medium text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#F0EDE8] dark:hover:bg-[#3F3F46] transition-all active:scale-95 cursor-pointer tabular-nums"
          >
            <span>15s</span>
            <RotateCw className="h-3 w-3" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={toggleSpeed}
            aria-label={`Playback speed ${playbackSpeed.toFixed(1)}x`}
            className="inline-flex h-8 items-center justify-center rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] px-2.5 text-[11px] font-semibold text-[#57534E] dark:text-[#A1A1AA] hover:text-[#1C1917] dark:hover:text-[#F5F5F4] transition-all active:scale-95 cursor-pointer tabular-nums"
          >
            {playbackSpeed.toFixed(1)}x
          </button>
        </div>

        {/* Clean WAV Download & Share Pills */}
        <div className="flex items-center gap-1.5">
          {(onDownload || fileExtension) && (
            <button
              type="button"
              onClick={handleBuiltInDownload}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white dark:bg-[#27272A] px-3 text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] border border-[#E7E5E4] dark:border-[#3F3F46] hover:bg-[#F0EDE8] dark:hover:bg-[#3F3F46] transition-all active:scale-95 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-[#57534E] dark:text-[#A1A1AA]" strokeWidth={1.75} />
              <span className="font-myanmar">{downloadLabel || "WAV"}</span>
            </button>
          )}
          {onShare && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic(10)
                onShare()
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#F0EDE8] dark:bg-[#27272A] px-3 text-xs font-medium text-[#1C1917] dark:text-[#F5F5F4] hover:bg-[#E7E5E4] dark:hover:bg-[#3F3F46] transition-all active:scale-95 cursor-pointer"
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
