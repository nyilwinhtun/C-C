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
    <header className="flex items-center justify-between gap-4 px-4 sm:px-6 h-14 border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="outline"
          size="icon"
          onClick={onMenuToggle}
          className="md:hidden h-9 w-9 border-border/60 shrink-0"
          aria-label={t(language, "nav.collapse")}
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </Button>
        <h2 className="text-sm sm:text-base font-semibold tracking-tight leading-relaxed truncate">
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLanguage(language === "en" ? "my" : "en")}
          aria-label="Toggle language"
          title={t(language, "header.language")}
          className="h-8 px-2.5 text-xs font-medium border-border/60 bg-background/60 hover:bg-accent/70 gap-1.5"
        >
          <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold">
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
            className="h-8 px-2.5 text-xs font-medium border-border/60 bg-background/60 hover:bg-accent/70 flex items-center gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t(language, "header.signOut")}</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleOpenSettings}
          aria-label={t(language, "header.settings")}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </Button>
        <ThemeToggle />
      </div>
      {!onOpenSettings && (
        <SettingsDialog open={internalSettingsOpen} onOpenChange={setInternalSettingsOpen} />
      )}
    </header>
  )
}
