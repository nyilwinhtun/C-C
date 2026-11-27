import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { Layout } from "@/components/shared/layout"
import { LoginPage } from "@/components/shared/login-page"
import { applyThemeToDocument, useUIStore } from "@/store/useUIStore"
import { useContentStore } from "@/store/useContentStore"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"
import { setIosAudioSessionPlayback } from "@/lib/iosAudio"
import { useShallow } from "zustand/react/shallow"
import {
  decodeBioPayload,
  extractBioTokenFromLocation,
} from "@/features/social-qr/bioCodec"
import { PublicBioPage } from "@/features/social-qr/PublicBioPage"

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || "Unexpected error" }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught application error:", error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center gap-4">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function AppContent() {
  const { user, setAuth, theme } = useUIStore(
    useShallow((state) => ({
      user: state.user,
      setAuth: state.setAuth,
      theme: state.theme,
    }))
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme])

  useEffect(() => {
    setIosAudioSessionPlayback()
    if (!isSupabaseConfigured) {
      setAuth(null, null)
      setLoading(false)
      return
    }

    // 1. Check initial active session
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          setAuth(
            { id: session.user.id, email: session.user.email ?? "" },
            session.access_token
          )
          void useContentStore.getState().loadVaultFromSupabase()
        } else {
          setAuth(null, null)
        }
      })
      .catch((err) => {
        console.error("Failed to get Supabase session", err)
      })
      .finally(() => {
        setLoading(false)
      })

    // 2. Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuth(
          { id: session.user.id, email: session.user.email ?? "" },
          session.access_token
        )
        void useContentStore.getState().loadVaultFromSupabase()
      } else {
        setAuth(null, null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [setAuth])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return <Layout />
}

export default function App() {
  const [bioDismissed, setBioDismissed] = useState(false)
  const bioPayload = useMemo(() => {
    if (bioDismissed) return null
    const token = extractBioTokenFromLocation()
    return token ? decodeBioPayload(token) : null
  }, [bioDismissed])

  const handleOpenStudioFromBio = () => {
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete("bio")
      if (url.hash.startsWith("#bio=") || url.hash.includes("?bio=")) {
        url.hash = ""
      }
      window.history.replaceState({}, "", url.toString())
    } catch {
      // Ignore history errors
    }
    setBioDismissed(true)
  }

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Toaster position="bottom-right" richColors mobileOffset={{ bottom: "5rem" }} />
        {bioPayload ? (
          <PublicBioPage
            payload={bioPayload}
            onOpenStudio={handleOpenStudioFromBio}
          />
        ) : (
          <AppContent />
        )}
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
