import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { Layout } from "@/components/shared/layout"
import { LoginPage } from "@/components/shared/login-page"
import { useUIStore } from "@/store/useUIStore"
import { useContentStore } from "@/store/useContentStore"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"
import { useShallow } from "zustand/react/shallow"

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
  const { user, setAuth } = useUIStore(
    useShallow((state) => ({
      user: state.user,
      setAuth: state.setAuth,
    }))
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Toaster position="bottom-right" richColors mobileOffset={{ bottom: "5rem" }} />
        <AppContent />
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
