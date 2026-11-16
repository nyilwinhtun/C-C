"use client"

import { useState } from "react"
import { LogIn, Mail, Lock, User, ArrowRight } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { supabase } from "@/lib/supabase"
import { useUIStore } from "@/store/useUIStore"
import { useShallow } from "zustand/react/shallow"
import { useContentStore } from "@/store/useContentStore"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { t } from "@/locales/translations"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

const authSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type AuthMode = "signin" | "signup"

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>("signin")
  const [loading, setLoading] = useState(false)

  const { user, setAuth } = useUIStore(
    useShallow((state) => ({
      user: state.user,
      setAuth: state.setAuth,
    }))
  )

  const loadVault = useContentStore(
    useShallow((state) => state.loadVaultFromSupabase)
  )

  const form = useForm<z.infer<typeof authSchema>>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: "", password: "" },
  })

  const handleSubmit = async (data: z.infer<typeof authSchema>) => {
    setLoading(true)
    try {
      if (mode === "signin") {
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        })
        if (error) throw error
        if (authData.user) {
          setAuth(
            { id: authData.user.id, email: authData.user.email ?? "" },
            authData.session?.access_token ?? null
          )
          void loadVault()
          toast.success("Signed in successfully")
        }
      } else {
        const { data: authData, error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
        })
        if (error) throw error
        if (authData.user) {
          setAuth(
            { id: authData.user.id, email: authData.user.email ?? "" },
            authData.session?.access_token ?? null
          )
          void loadVault()
          toast.success("Account created successfully")
        }
      }
      onOpenChange(false)
      form.reset()
    } catch (err: any) {
      toast.error(err?.message ?? "Authentication failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign In / Account</DialogTitle>
            <DialogDescription>Signed in as {user.email}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                supabase.auth.signOut()
                setAuth(null, null)
                onOpenChange(false)
                toast.success("Signed out")
              }}
            >
              Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "signin" ? "Sign In" : "Sign Up"}
          </DialogTitle>
          <DialogDescription>
            {mode === "signin"
              ? "Sign in with email"
              : "Create account"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="you@example.com"
                      prefix={<Mail className="h-4 w-4 shrink-0 opacity-50" />}
                      disabled={loading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      placeholder="••••••••"
                      prefix={<Lock className="h-4 w-4 shrink-0 opacity-50" />}
                      disabled={loading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              variant="default"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <ArrowRight className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving...
                </>
              ) : mode === "signin" ? (
                "Sign In"
              ) : (
                "Sign Up"
              )}
            </Button>
          </form>
        </Form>
        <Separator className="my-4">
          <span className="text-xs text-muted-foreground flex items-center gap-2">
            {mode === "signin"
              ? "Don't have an account? "
              : "Already have an account? "}
          </span>
        </Separator>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Sign Up" : "Sign In"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
