"use client"

import { useState } from "react"
import { Globe, Mic, QrCode, Sparkles } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUIStore } from "@/store/useUIStore"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/components/ui/sonner"
import { t } from "@/locales/translations"
import { ThemeToggle } from "@/components/shared/theme-toggle"
import { CCLogo } from "@/components/shared/cc-logo"
import {
  LiveStudioBackdrop,
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

  const userId = `offline-${hash.slice(0, 16)}`
  await saveOfflineCredential(normalizedEmail, password, userId)
  return { id: userId, email: normalizedEmail }
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
  const [isSignUp, setIsSignUp] = useState(false)
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

  const handleContinueOffline = () => {
    setAuth({ id: "offline-local-user", email: "local@offline.studio" }, "offline-session")
    toast.success(
      language === "my"
        ? "Offline Mode ဖြင့် ဆက်လက်အသုံးပြုနိုင်ပါပြီ"
        : "Continuing in Offline Mode"
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        })
        if (signUpError) throw signUpError

        await saveOfflineCredential(email, password, data.user?.id)
        if (data?.session) {
          setAuth(
            data.session.user
              ? { id: data.session.user.id, email: data.session.user.email ?? "" }
              : null,
            data.session.access_token
          )
          toast.success(t(language, "auth.signInSuccess"))
        } else {
          toast.success(t(language, "auth.signUpSuccess"))
          setIsSignUp(false)
        }
        return
      }

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
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#141418] flex flex-col items-center justify-center px-4 py-16 sm:p-6 relative overflow-hidden">
      {/* Zero-latency Live Interactive Studio Backdrop (with optional video fallback) */}
      <LiveStudioBackdrop focusedField={focusedField} language={language} />

      {/* Top right language & theme controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20 pt-safe">
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
        <div className="flex justify-center mb-3.5">
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

          <div className="relative rounded-[23px] bg-white/78 dark:bg-[#222227]/76 backdrop-blur-2xl p-6 sm:p-8 border border-white/50 dark:border-white/8">
            <div className="flex flex-col items-center text-center mb-6">
              <div
                className={`relative mb-3 rounded-[18px] p-1 transition-all duration-500 ${
                  isFocused
                    ? "ring-2 ring-amber-500/35 dark:ring-amber-400/35 scale-[1.03]"
                    : "ring-1 ring-black/5 dark:ring-white/10"
                }`}
              >
                <CCLogo
                  size={56}
                  className="h-14 w-14 rounded-[15px] shadow-md"
                />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground leading-relaxed">
                {isSignUp ? t(language, "auth.signUpTitle") : t(language, "auth.title")}
              </h1>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {isSignUp ? t(language, "auth.signUpDesc") : t(language, "auth.signInDesc")}
              </p>
            </div>

            {error && (
              <div className="mb-5 rounded-[14px] border-[0.5px] border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive leading-relaxed">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
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

              <div className="space-y-1.5">
                <Label htmlFor="auth-password">{t(language, "auth.password")}</Label>
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField((prev) => (prev === "password" ? null : prev))}
                  required
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  disabled={loading}
                  className="bg-white/70 dark:bg-[#18181B]/65 backdrop-blur-sm border-[#E7E5E4]/90 dark:border-white/12 transition-shadow focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:focus-visible:ring-indigo-400/40"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full mt-2 font-semibold shadow-sm ios-press"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    <span>{t(language, "auth.signingIn")}</span>
                  </span>
                ) : isSignUp ? (
                  t(language, "auth.createAccount")
                ) : (
                  t(language, "auth.signIn")
                )}
              </Button>
            </form>

            <div className="mt-4 space-y-3 pt-3.5 border-t border-[#E7E5E4]/80 dark:border-white/10">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setError(null)
                  setIsSignUp((prev) => !prev)
                }}
                className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-myanmar"
              >
                {isSignUp ? t(language, "auth.signIn") : t(language, "auth.createAccount")}
              </button>

              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={handleContinueOffline}
                className="w-full text-xs font-semibold font-myanmar bg-white/60 dark:bg-white/5 hover:bg-white/90 dark:hover:bg-white/10 border-[#E7E5E4]/90 dark:border-white/12 ios-press"
              >
                ဆက်လက်အသုံးပြုမည် (Offline Mode)
              </Button>
            </div>
          </div>
        </div>

        {/* Compact Mobile / Tablet Studio Feature Strip (hidden on lg where floating cards appear) */}
        <div
          aria-hidden="true"
          className="mt-4 flex lg:hidden flex-wrap items-center justify-center gap-2"
        >
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium backdrop-blur-xl transition-all duration-300 ${
              focusedField === "email"
                ? "border-amber-400/50 bg-white/80 dark:bg-[#27272A]/80 text-[#1C1917] dark:text-[#F5F5F4] scale-[1.03]"
                : "border-white/60 dark:border-white/10 bg-white/55 dark:bg-[#27272A]/50 text-[#57534E] dark:text-[#A1A1AA]"
            }`}
          >
            <Mic className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" strokeWidth={2} />
            <span>{t(language, "auth.studioVoiceTitle")}</span>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium backdrop-blur-xl transition-all duration-300 ${
              focusedField === "password"
                ? "border-indigo-400/50 bg-white/80 dark:bg-[#27272A]/80 text-[#1C1917] dark:text-[#F5F5F4] scale-[1.03]"
                : "border-white/60 dark:border-white/10 bg-white/55 dark:bg-[#27272A]/50 text-[#57534E] dark:text-[#A1A1AA]"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" strokeWidth={2} />
            <span>{t(language, "auth.studioMascotTitle")}</span>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium backdrop-blur-xl transition-all duration-300 ${
              isFocused
                ? "border-emerald-400/45 bg-white/80 dark:bg-[#27272A]/80 text-[#1C1917] dark:text-[#F5F5F4] scale-[1.03]"
                : "border-white/60 dark:border-white/10 bg-white/55 dark:bg-[#27272A]/50 text-[#57534E] dark:text-[#A1A1AA]"
            }`}
          >
            <QrCode className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
            <span>{t(language, "auth.studioQrTitle")}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
