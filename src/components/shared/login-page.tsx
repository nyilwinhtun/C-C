"use client"

import { useState } from "react"
import { Clapperboard, Globe, Mic, QrCode } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUIStore } from "@/store/useUIStore"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/components/ui/sonner"
import { t } from "@/locales/translations"
import { ThemeToggle } from "@/components/shared/theme-toggle"
import { AnimatedBrandEmblem } from "@/components/shared/BrandLogo"
import {
  LiveStudioBackdrop,
  MINI_VOICE_BARS,
  WAVE_BARS,
  type FocusedAuthField,
} from "@/components/shared/live-studio-backdrop"

const OFFLINE_AUTH_STORAGE_KEY = "cc-offline-auth"

interface OfflineAuthRecord {
  hash: string
  userId: string
}

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : String(err ?? "")
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: unknown }).name ?? "")
      : ""
  return (
    name === "AuthRetryableFetchError" ||
    /failed to fetch|networkerror|network request failed|load failed|err_network/i.test(message)
  )
}

async function hashCredential(email: string, password: string): Promise<string> {
  const input = `${email.trim().toLowerCase()}:${password}`
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoded = new TextEncoder().encode(input)
    const digest = await crypto.subtle.digest("SHA-256", encoded)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  }
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function readOfflineAuthMap(): Record<string, OfflineAuthRecord> {
  try {
    const raw = localStorage.getItem(OFFLINE_AUTH_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, OfflineAuthRecord>) : {}
  } catch {
    return {}
  }
}

async function saveOfflineCredential(email: string, password: string, userId?: string): Promise<void> {
  try {
    const normalizedEmail = email.trim().toLowerCase()
    const hash = await hashCredential(normalizedEmail, password)
    const map = readOfflineAuthMap()
    map[normalizedEmail] = {
      hash,
      userId: userId || map[normalizedEmail]?.userId || `offline-${hash.slice(0, 16)}`,
    }
    localStorage.setItem(OFFLINE_AUTH_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore storage errors (e.g. private browsing quota)
  }
}

async function verifyOfflineCredential(
  email: string,
  password: string
): Promise<{ id: string; email: string } | null> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail.includes("@") || !password) return null

  const hash = await hashCredential(normalizedEmail, password)
  const map = readOfflineAuthMap()
  const existing = map[normalizedEmail]

  if (existing) {
    return existing.hash === hash ? { id: existing.userId, email: normalizedEmail } : null
  }

  return null
}

const COMPACT_WAVE_BARS = [
  { height: 7, delay: "0s" },
  { height: 13, delay: "0.14s" },
  { height: 9, delay: "0.28s" },
  { height: 15, delay: "0.08s" },
  { height: 10, delay: "0.22s" },
]

export function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<FocusedAuthField>(null)

  const { language, setLanguage, setAuth } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setLanguage: state.setLanguage,
      setAuth: state.setAuth,
    }))
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) throw signInError

      if (data?.session) {
        await saveOfflineCredential(email, password, data.session.user?.id)
        setAuth(
          data.session.user
            ? { id: data.session.user.id, email: data.session.user.email ?? "" }
            : null,
          data.session.access_token
        )
      }
      toast.success(t(language, "auth.signInSuccess"))
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        const offlineUser = await verifyOfflineCredential(email, password)
        if (offlineUser) {
          setAuth(offlineUser, "offline-session")
          toast.success(`${t(language, "auth.signInSuccess")} (Offline)`)
          return
        }
        const invalidMsg = "Invalid email or password for offline sign-in."
        setError(invalidMsg)
        toast.error(invalidMsg)
        return
      }
      const message =
        err instanceof Error && err.message ? err.message : t(language, "auth.error")
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const isFocused = focusedField !== null

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#141418] flex flex-col items-center justify-center px-4 pt-14 pb-4 sm:p-6 relative overflow-hidden">
      {/* Zero-latency Live Interactive Studio Backdrop (with optional video fallback) */}
      <LiveStudioBackdrop focusedField={focusedField} language={language} />

      {/* Top right language & theme controls */}
      <div className="absolute top-3.5 right-4 sm:top-4 flex items-center gap-2 z-20 pt-safe">
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setLanguage(language === "en" ? "my" : "en")}
          className="h-9 px-3 text-xs font-medium flex items-center gap-1.5 rounded-full bg-white/75 dark:bg-[#27272A]/75 backdrop-blur-xl border-white/60 dark:border-white/15 shadow-xs"
          aria-label={t(language, "header.language")}
          title={t(language, "header.language")}
        >
          <Globe className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <span className={language === "en" ? "font-bold text-[#1C1917] dark:text-[#F5F5F4]" : "text-muted-foreground"}>
            EN
          </span>
          <span className="text-muted-foreground/60">|</span>
          <span className={language === "my" ? "font-bold text-[#1C1917] dark:text-[#F5F5F4]" : "text-muted-foreground"}>
            MY
          </span>
        </Button>
        <ThemeToggle />
      </div>

      {/* Central Glassmorphism Sign-In Card */}
      <div className="w-full max-w-md relative z-10 studio-card-enter">
        {/* Live Studio Status Pill */}
        <div className="flex justify-center mb-2 sm:mb-3.5">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-[11px] font-medium backdrop-blur-xl transition-all duration-300 ${
              isFocused
                ? "border-amber-500/40 dark:border-amber-400/35 bg-white/80 dark:bg-[#27272A]/80 text-[#1C1917] dark:text-[#F5F5F4] shadow-sm"
                : "border-white/60 dark:border-white/10 bg-white/60 dark:bg-[#27272A]/55 text-[#57534E] dark:text-[#A1A1AA]"
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  focusedField === "password"
                    ? "bg-indigo-500"
                    : "bg-emerald-500"
                } motion-safe:animate-ping`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  focusedField === "password"
                    ? "bg-indigo-500"
                    : "bg-emerald-500"
                }`}
              />
            </span>
            <span>{t(language, "auth.studioBadge")}</span>
            <span className="flex items-end gap-[2px] h-3.5 pl-0.5" aria-hidden="true">
              {COMPACT_WAVE_BARS.map((bar, i) => (
                <span
                  key={i}
                  className={`studio-wave-bar w-[2px] rounded-full transition-colors duration-300 ${
                    focusedField === "email"
                      ? "bg-amber-600 dark:bg-amber-400"
                      : focusedField === "password"
                      ? "bg-indigo-600 dark:bg-indigo-400"
                      : "bg-[#1C1917]/45 dark:bg-[#F5F5F4]/50"
                  }`}
                  style={{
                    height: `${bar.height}px`,
                    animationDelay: bar.delay,
                  }}
                />
              ))}
            </span>
          </div>
        </div>

        {/* Mobile / Tablet Top Floating Studio Deck (above card, never overlaps inputs) */}
        <div
          aria-hidden="true"
          className="mb-2.5 grid grid-cols-2 gap-2 lg:hidden"
        >
          {/* Floating Micro-Card 1: Voice & Audio */}
          <div
            className={`studio-float-mobile-1 flex items-center gap-2 rounded-2xl border px-2.5 py-2 backdrop-blur-xl transition-all duration-500 min-w-0 ${
              focusedField === "email"
                ? "border-amber-400/55 dark:border-amber-400/45 bg-white/80 dark:bg-[#27272A]/80 shadow-md shadow-amber-500/12 scale-[1.02]"
                : "border-white/65 dark:border-white/12 bg-white/62 dark:bg-[#27272A]/55 shadow-xs"
            }`}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <Mic className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-[#1C1917] dark:text-[#F5F5F4] truncate">
                  {t(language, "auth.studioVoiceTitle")}
                </span>
                <span className="flex items-end gap-[1.5px] h-3 shrink-0">
                  {MINI_VOICE_BARS.map((bar, i) => (
                    <span
                      key={i}
                      className="studio-wave-bar w-[2px] rounded-full bg-amber-500/85 dark:bg-amber-400/85"
                      style={{
                        height: `${Math.max(6, Math.round(bar.height * 0.72))}px`,
                        animationDelay: bar.delay,
                      }}
                    />
                  ))}
                </span>
              </div>
              <p className="text-[10px] text-[#57534E] dark:text-[#A1A1AA] truncate font-myanmar leading-tight mt-0.5">
                {t(language, "auth.studioVoiceSub")}
              </p>
            </div>
          </div>

          {/* Floating Micro-Card 2: Presenter Studio */}
          <div
            className={`studio-float-mobile-2 flex items-center gap-2 rounded-2xl border px-2.5 py-2 backdrop-blur-xl transition-all duration-500 min-w-0 ${
              focusedField === "password"
                ? "border-stone-400/55 dark:border-stone-300/40 bg-white/80 dark:bg-[#27272A]/80 shadow-md shadow-stone-500/12 scale-[1.02]"
                : "border-white/65 dark:border-white/12 bg-white/62 dark:bg-[#27272A]/55 shadow-xs"
            }`}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-stone-500/15 text-stone-700 dark:text-stone-200">
              <Clapperboard className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-[#1C1917] dark:text-[#F5F5F4] truncate">
                  {t(language, "auth.studioMascotTitle")}
                </span>
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/85" />
              </div>
              <p className="text-[10px] text-[#57534E] dark:text-[#A1A1AA] truncate font-myanmar leading-tight mt-0.5">
                {t(language, "auth.studioMascotSub")}
              </p>
            </div>
          </div>
        </div>

        {/* Frosted-Glass Card with Subtle Border Shimmer */}
        <div
          className={`relative rounded-[24px] p-[1px] overflow-hidden transition-all duration-500 ${
            focusedField === "email"
              ? "shadow-2xl shadow-amber-900/10 dark:shadow-amber-500/10"
              : focusedField === "password"
              ? "shadow-2xl shadow-indigo-900/10 dark:shadow-indigo-500/15"
              : "shadow-xl shadow-stone-900/8 dark:shadow-black/40"
          }`}
        >
          {/* Animated subtle border shimmer layer */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[24px] bg-gradient-to-br from-white/80 via-[#E7E5E4]/60 to-white/40 dark:from-white/18 dark:via-white/6 dark:to-white/12"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 studio-border-shimmer bg-gradient-to-r from-transparent via-white/90 dark:via-white/30 to-transparent opacity-70"
          />

          <div className="relative rounded-[23px] bg-white/72 dark:bg-[#222227]/70 sm:bg-white/78 sm:dark:bg-[#222227]/76 backdrop-blur-2xl p-4 sm:p-7 border border-white/55 dark:border-white/10">
            <div className="flex flex-col items-center text-center mb-3.5 sm:mb-5">
              <AnimatedBrandEmblem
                size={52}
                focusedField={focusedField}
                className="mb-2.5 sm:mb-3"
              />
              <h1 className="text-[21px] sm:text-2xl font-bold tracking-tight text-foreground leading-tight">
                Content Creator
              </h1>
              <p className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs font-medium tracking-[0.02em] text-muted-foreground leading-snug">
                <span>Social Link &amp; QR</span>
                <span className="text-amber-600/80 dark:text-amber-400/80" aria-hidden="true">•</span>
                <span>Photo &amp; Poster</span>
                <span className="text-stone-400 dark:text-stone-500" aria-hidden="true">•</span>
                <span>Voice &amp; Video</span>
              </p>
            </div>

            {error && (
              <div className="mb-3.5 rounded-[14px] border-[0.5px] border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive leading-relaxed">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              <div className="space-y-1">
                <Label htmlFor="auth-email">{t(language, "auth.email")}</Label>
                <Input
                  id="auth-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField((prev) => (prev === "email" ? null : prev))}
                  required
                  autoComplete="email"
                  disabled={loading}
                  className="bg-white/70 dark:bg-[#18181B]/65 backdrop-blur-sm border-[#E7E5E4]/90 dark:border-white/12 transition-shadow focus-visible:ring-2 focus-visible:ring-amber-500/40 dark:focus-visible:ring-amber-400/40"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="auth-password">{t(language, "auth.password")}</Label>
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField((prev) => (prev === "password" ? null : prev))}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  className="bg-white/70 dark:bg-[#18181B]/65 backdrop-blur-sm border-[#E7E5E4]/90 dark:border-white/12 transition-shadow focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:focus-visible:ring-indigo-400/40"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full mt-1.5 font-semibold shadow-sm ios-press"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    <span>{t(language, "auth.signingIn")}</span>
                  </span>
                ) : (
                  t(language, "auth.signIn")
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Mobile / Tablet Bottom Floating Studio Deck: Social QR + Live Audio Equalizer Waveform */}
        <div
          aria-hidden="true"
          className="mt-2.5 grid grid-cols-[1fr_auto] items-stretch gap-2 lg:hidden"
        >
          {/* Floating Micro-Card 3: Social QR */}
          <div
            className={`studio-float-mobile-3 flex items-center gap-2 rounded-2xl border px-2.5 py-2 backdrop-blur-xl transition-all duration-500 min-w-0 ${
              isFocused
                ? "border-emerald-400/50 dark:border-emerald-400/40 bg-white/80 dark:bg-[#27272A]/80 shadow-md shadow-emerald-500/10 scale-[1.02]"
                : "border-white/65 dark:border-white/12 bg-white/62 dark:bg-[#27272A]/55 shadow-xs"
            }`}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <QrCode className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-semibold text-[#1C1917] dark:text-[#F5F5F4] block truncate">
                {t(language, "auth.studioQrTitle")}
              </span>
              <p className="text-[10px] text-[#57534E] dark:text-[#A1A1AA] truncate font-myanmar leading-tight mt-0.5">
                {t(language, "auth.studioQrSub")}
              </p>
            </div>
          </div>

          {/* Floating Live Audio Equalizer Waveform Card */}
          <div
            className={`studio-float-mobile-4 flex items-center justify-center rounded-2xl border px-3 py-2 backdrop-blur-xl transition-all duration-500 ${
              isFocused
                ? "border-stone-400/50 dark:border-white/22 bg-white/78 dark:bg-[#27272A]/78 shadow-md scale-[1.02]"
                : "border-white/65 dark:border-white/12 bg-white/60 dark:bg-[#27272A]/52 shadow-xs"
            }`}
          >
            <div className="flex items-end gap-[2.5px] h-7">
              {WAVE_BARS.map((bar, index) => (
                <span
                  key={index}
                  className={`studio-wave-bar w-[2.5px] rounded-full transition-colors duration-500 ${
                    focusedField === "email"
                      ? "bg-amber-600/85 dark:bg-amber-400/85"
                      : focusedField === "password"
                      ? "bg-indigo-600/85 dark:bg-indigo-400/85"
                      : "bg-gradient-to-t from-amber-500/75 via-rose-500/70 to-violet-500/75 dark:from-amber-400/80 dark:via-rose-400/75 dark:to-violet-400/80"
                  }`}
                  style={{
                    height: `${Math.max(8, Math.round(bar.height * 0.72))}px`,
                    animationDelay: bar.delay,
                    animationDuration: bar.duration,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
