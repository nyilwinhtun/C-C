"use client"

import { useState } from "react"
import { Globe } from "lucide-react"
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

export function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { language, setLanguage, setAuth } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setLanguage: state.setLanguage,
      setAuth: state.setAuth,
    }))
  )

  const handleSignIn = async (e: React.FormEvent) => {
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

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle ambient brand glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-gradient-to-tr from-blue-500/15 via-indigo-500/15 to-amber-500/10 blur-3xl"
      />

      {/* Top right language & theme controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setLanguage(language === "en" ? "my" : "en")}
          className="h-9 px-3 text-xs font-medium flex items-center gap-1.5 border-border/60 bg-background/80 backdrop-blur-md"
          aria-label={t(language, "header.language")}
          title={t(language, "header.language")}
        >
          <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className={language === "en" ? "font-bold text-blue-600 dark:text-blue-400" : "text-muted-foreground"}>
            EN
          </span>
          <span className="text-muted-foreground/60">|</span>
          <span className={language === "my" ? "font-bold text-blue-600 dark:text-blue-400" : "text-muted-foreground"}>
            MY
          </span>
        </Button>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="rounded-2xl border border-border/60 bg-card/90 backdrop-blur-md p-8 shadow-xl">
          <div className="flex flex-col items-center text-center mb-6">
            <CCLogo size={56} className="h-14 w-14 mb-3 rounded-2xl shadow-lg ring-1 ring-border/60" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground leading-relaxed">
              {t(language, "auth.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {t(language, "auth.signInDesc")}
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive leading-relaxed">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="auth-email">{t(language, "auth.email")}</Label>
              <Input
                id="auth-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={loading}
                className="border-border/60"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="auth-password">{t(language, "auth.password")}</Label>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={loading}
                className="border-border/60"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2 font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 border-0"
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
    </div>
  )
}
