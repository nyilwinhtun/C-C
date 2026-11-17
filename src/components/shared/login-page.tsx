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
        setAuth(
          data.session.user
            ? { id: data.session.user.id, email: data.session.user.email ?? "" }
            : null,
          data.session.access_token
        )
      }
      toast.success(t(language, "auth.signInSuccess"))
    } catch (err: any) {
      const message = err?.message || t(language, "auth.error")
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
