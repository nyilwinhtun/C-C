"use client"

import { useEffect, useState } from "react"
import { Mic, QrCode, Sparkles } from "lucide-react"
import { t, type Locale } from "@/locales/translations"

export type FocusedAuthField = "email" | "password" | null

interface LiveStudioBackdropProps {
  focusedField: FocusedAuthField
  language: Locale
}

const WAVE_BARS = [
  { height: 14, delay: "0s", duration: "1.2s" },
  { height: 26, delay: "0.14s", duration: "1.05s" },
  { height: 18, delay: "0.28s", duration: "1.3s" },
  { height: 32, delay: "0.08s", duration: "0.95s" },
  { height: 22, delay: "0.35s", duration: "1.25s" },
  { height: 36, delay: "0.18s", duration: "1.1s" },
  { height: 20, delay: "0.42s", duration: "1.35s" },
  { height: 28, delay: "0.12s", duration: "1.0s" },
  { height: 16, delay: "0.3s", duration: "1.2s" },
  { height: 24, delay: "0.22s", duration: "1.15s" },
  { height: 30, delay: "0.05s", duration: "1.05s" },
  { height: 15, delay: "0.38s", duration: "1.3s" },
]

const MINI_VOICE_BARS = [
  { height: 8, delay: "0s" },
  { height: 14, delay: "0.15s" },
  { height: 10, delay: "0.3s" },
  { height: 16, delay: "0.1s" },
  { height: 9, delay: "0.25s" },
]

export function LiveStudioBackdrop({
  focusedField,
  language,
}: LiveStudioBackdropProps) {
  const [videoReady, setVideoReady] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setPrefersReducedMotion(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  const isFocused = focusedField !== null
  const videoSrc = `${import.meta.env.BASE_URL}login-bg.mp4`

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden select-none z-0"
    >
      {/* Optional lightweight looping video background (public/login-bg.mp4) */}
      {!videoFailed && !prefersReducedMotion && (
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onLoadedData={() => setVideoReady(true)}
          onCanPlay={() => setVideoReady(true)}
          onError={() => {
            setVideoFailed(true)
            setVideoReady(false)
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            videoReady ? "opacity-35 dark:opacity-30" : "opacity-0"
          }`}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      )}

      {/* Adaptive contrast veil over optional video / base studio canvas */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FAF8F5]/85 via-[#F5F0EA]/70 to-[#EDE7DF]/85 dark:from-[#121216]/90 dark:via-[#18181D]/82 dark:to-[#111115]/92" />

      {/* Subtle studio dot grid with soft radial vignette */}
      <div className="absolute inset-0 studio-grid-pattern [mask-image:radial-gradient(ellipse_70%_65%_at_50%_50%,black_30%,transparent_100%)] opacity-80" />

      {/* GPU-accelerated drifting ambient gradient orbs */}
      <div
        className={`studio-orb-a absolute -top-28 -left-24 h-[26rem] w-[26rem] sm:h-[34rem] sm:w-[34rem] rounded-full blur-3xl transition-all duration-700 ${
          focusedField === "email"
            ? "bg-amber-400/30 dark:bg-amber-500/22 opacity-95"
            : focusedField === "password"
            ? "bg-indigo-400/28 dark:bg-indigo-500/24 opacity-95"
            : "bg-amber-300/26 dark:bg-amber-500/14 opacity-80"
        }`}
      />
      <div
        className={`studio-orb-b absolute -bottom-32 -right-24 h-[28rem] w-[28rem] sm:h-[36rem] sm:w-[36rem] rounded-full blur-3xl transition-all duration-700 ${
          focusedField === "password"
            ? "bg-emerald-400/28 dark:bg-emerald-500/22 opacity-95"
            : focusedField === "email"
            ? "bg-rose-400/26 dark:bg-rose-500/20 opacity-95"
            : "bg-rose-300/24 dark:bg-violet-500/16 opacity-80"
        }`}
      />
      <div
        className={`studio-orb-c absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[22rem] w-[22rem] sm:h-[30rem] sm:w-[30rem] rounded-full blur-3xl transition-all duration-700 ${
          isFocused
            ? "bg-violet-400/20 dark:bg-sky-500/18 opacity-90"
            : "bg-stone-300/25 dark:bg-indigo-500/10 opacity-65"
        }`}
      />

      {/* Interactive center studio glow pulse when focusing inputs */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[26rem] w-[26rem] sm:h-[32rem] sm:w-[32rem] rounded-full blur-3xl transition-opacity duration-500 ${
          isFocused ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className={`h-full w-full rounded-full studio-glow-pulse ${
            focusedField === "password"
              ? "bg-gradient-to-tr from-indigo-400/25 via-emerald-400/20 to-sky-400/25 dark:from-indigo-500/25 dark:via-emerald-500/20 dark:to-sky-500/20"
              : "bg-gradient-to-tr from-amber-400/25 via-rose-400/20 to-violet-400/25 dark:from-amber-500/22 dark:via-rose-500/18 dark:to-violet-500/22"
          }`}
        />
      </div>

      {/* Floating Glassmorphic Micro-Card 1: AI Voice (Desktop Left) */}
      <div
        className={`hidden lg:flex studio-float-1 absolute top-[20%] left-[6%] xl:left-[10%] items-center gap-3 rounded-2xl border px-3.5 py-2.5 backdrop-blur-xl transition-all duration-500 ${
          focusedField === "email"
            ? "border-amber-400/50 dark:border-amber-400/40 bg-white/75 dark:bg-[#27272A]/75 shadow-lg shadow-amber-500/10 scale-[1.04]"
            : "border-white/60 dark:border-white/10 bg-white/55 dark:bg-[#27272A]/50 shadow-sm"
        }`}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <Mic className="h-4 w-4" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4]">
              {t(language, "auth.studioVoiceTitle")}
            </span>
            <span className="flex items-end gap-[2px] h-3.5">
              {MINI_VOICE_BARS.map((bar, i) => (
                <span
                  key={i}
                  className="studio-wave-bar w-[2px] rounded-full bg-amber-500/80 dark:bg-amber-400/80"
                  style={{
                    height: `${bar.height}px`,
                    animationDelay: bar.delay,
                  }}
                />
              ))}
            </span>
          </div>
          <p className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
            {t(language, "auth.studioVoiceSub")}
          </p>
        </div>
      </div>

      {/* Floating Glassmorphic Micro-Card 2: Mascot Studio (Desktop Right Top) */}
      <div
        className={`hidden lg:flex studio-float-2 absolute top-[24%] right-[6%] xl:right-[10%] items-center gap-3 rounded-2xl border px-3.5 py-2.5 backdrop-blur-xl transition-all duration-500 ${
          focusedField === "password"
            ? "border-indigo-400/50 dark:border-indigo-400/40 bg-white/75 dark:bg-[#27272A]/75 shadow-lg shadow-indigo-500/10 scale-[1.04]"
            : "border-white/60 dark:border-white/10 bg-white/55 dark:bg-[#27272A]/50 shadow-sm"
        }`}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700 dark:text-violet-300">
          <Sparkles className="h-4 w-4" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4]">
              {t(language, "auth.studioMascotTitle")}
            </span>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500/80" />
          </div>
          <p className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
            {t(language, "auth.studioMascotSub")}
          </p>
        </div>
      </div>

      {/* Floating Glassmorphic Micro-Card 3: Social QR (Desktop Bottom Left) */}
      <div
        className={`hidden lg:flex studio-float-3 absolute bottom-[18%] left-[8%] xl:left-[12%] items-center gap-3 rounded-2xl border px-3.5 py-2.5 backdrop-blur-xl transition-all duration-500 ${
          isFocused
            ? "border-emerald-400/45 dark:border-emerald-400/35 bg-white/75 dark:bg-[#27272A]/75 shadow-lg shadow-emerald-500/10 scale-[1.03]"
            : "border-white/60 dark:border-white/10 bg-white/55 dark:bg-[#27272A]/50 shadow-sm"
        }`}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
          <QrCode className="h-4 w-4" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <span className="text-xs font-semibold text-[#1C1917] dark:text-[#F5F5F4] block">
            {t(language, "auth.studioQrTitle")}
          </span>
          <p className="text-[11px] text-[#57534E] dark:text-[#A1A1AA] font-myanmar">
            {t(language, "auth.studioQrSub")}
          </p>
        </div>
      </div>

      {/* Subtle Animated Audio Waveform Bar (Desktop Bottom Right & Subtle Bottom Accent) */}
      <div
        className={`hidden md:flex absolute bottom-[16%] right-[7%] xl:right-[11%] items-center gap-3 rounded-2xl border px-4 py-2.5 backdrop-blur-xl transition-all duration-500 ${
          isFocused
            ? "border-stone-400/45 dark:border-white/20 bg-white/72 dark:bg-[#27272A]/72 shadow-md scale-[1.03]"
            : "border-white/55 dark:border-white/10 bg-white/48 dark:bg-[#27272A]/45"
        }`}
      >
        <div className="flex items-end gap-[3px] h-9">
          {WAVE_BARS.map((bar, index) => (
            <span
              key={index}
              className={`studio-wave-bar w-[3px] rounded-full transition-colors duration-500 ${
                focusedField === "email"
                  ? "bg-amber-600/75 dark:bg-amber-400/80"
                  : focusedField === "password"
                  ? "bg-indigo-600/75 dark:bg-indigo-400/80"
                  : "bg-[#1C1917]/40 dark:bg-[#F5F5F4]/45"
              }`}
              style={{
                height: `${bar.height}px`,
                animationDelay: bar.delay,
                animationDuration: bar.duration,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
