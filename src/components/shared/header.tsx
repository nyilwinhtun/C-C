"use client"

import { useState } from "react"
import { t } from "@/locales/translations"
import { useShallow } from "zustand/react/shallow"
import { Menu, Settings, Globe, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/shared/theme-toggle"
import { useUIStore } from "@/store/useUIStore"
import { SettingsDialog } from "@/components/shared/settings-dialog"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/ui/sonner"

interface HeaderProps {
  title: string
  onMenuToggle: () => void
  onOpenSettings?: () => void
}

export function Header({ title, onMenuToggle, onOpenSettings }: HeaderProps) {
  const { language, setLanguage, user, signOut } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setLanguage: state.setLanguage,
      user: state.user,
      signOut: state.signOut,
    }))
  )
  const [internalSettingsOpen, setInternalSettingsOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      onOpenSettings()
    } else {
      setInternalSettingsOpen(true)
    }
  }

  const handleSignOut = async () => {
    setLoggingOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (err: any) {
      console.error("Sign out error", err)
    } finally {
      signOut()
      setLoggingOut(false)
      toast.success(t(language, "auth.signOutSuccess"))
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-20">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onMenuToggle}
          aria-label={t(language, "nav.collapse")}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
        <h2 className="text-sm font-semibold leading-relaxed">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLanguage(language === "en" ? "my" : "en")}
          aria-label="Toggle language"
          title={t(language, "header.language")}
        >
          <Globe className="h-5 w-5" aria-hidden="true" />
          <span className="ml-1 text-xs font-medium hidden sm:inline">
            {language === "en" ? "EN" : "MY"}
          </span>
        </Button>
        {user && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={loggingOut}
            aria-label={t(language, "header.signOut")}
            className="flex items-center gap-1.5"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>{t(language, "header.signOut")}</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleOpenSettings}
          aria-label={t(language, "header.settings")}
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </Button>
        <ThemeToggle />
      </div>
      {!onOpenSettings && (
        <SettingsDialog open={internalSettingsOpen} onOpenChange={setInternalSettingsOpen} />
      )}
    </div>
  )
}
