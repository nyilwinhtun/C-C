"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUIStore } from "@/store/useUIStore"
import { useShallow } from "zustand/react/shallow"
import { toast } from "@/components/ui/sonner"
import { t } from "@/locales/translations"

export function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { language, setLanguage, session } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setLanguage: state.setLanguage,
      session: state.session,
    }))
  )

  // If already logged in, redirect to main app
  useEffect(() => {
    if (session) {
      // Navigate to main app - but we'll let App.tsx handle this
    }
  }, [session])

  const handleSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      toast.success(t(language, "auth.signInSuccess"))
      // The app will handle the session state change
    } catch (err: any) {
      setError(err.message || "Authentication failed")
      toast.error(t(language, "auth.error"))
    } finally {
      setLoading(false)
    }
  }

  // Check auth state on mount
  useEffect(() => {
    // If there's a session, the App component will handle rendering Layout
    // This component is only shown when logged out
  }, [session])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="rounded-2xl bg-card p-8 shadow-lg max-w-md w-full">
        <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
          {t(language, "auth.title")}
        </h2>

        {error && (
          <div className="bg-red-100 border-red-400 text-red-700 px-4 py-3 rounded mb-4 animate-shake">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={e => {
          e.preventDefault()
          handleSignIn()
        }}>
          <div>
            <Label htmlFor="auth-email">{t(language, "auth.email")}</Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="auth-password">{t(language, "auth.password")}</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex gap-3">
            <Button variant="ghost" type="button" onClick={() => setLanguage(language === "en" ? "my" : "en")}>
              <span className="ml-1 text-xs font-medium hidden sm:inline">
                {language === "en" ? "EN" : "MY"}
              </span>
              <svg className="h-4 w-4" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="8.5" cy="8.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </Button>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in..." : t(language, "auth.signIn")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}