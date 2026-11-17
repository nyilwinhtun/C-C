import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { Layout } from "@/components/shared/layout"
import { LoginPage } from "@/components/shared/login-page"
import { useUIStore } from "@/store/useUIStore"
import { useContentStore } from "@/store/useContentStore"
import { supabase } from "@/lib/supabase"
import { useShallow } from "zustand/react/shallow"

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
    <QueryClientProvider client={queryClient}>
      <Toaster position="bottom-right" richColors />
      <AppContent />
    </QueryClientProvider>
  )
}
