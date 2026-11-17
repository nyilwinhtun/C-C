"use client"

import { useState } from "react"
import { t } from "@/locales/translations"
import { useShallow } from "zustand/react/shallow"
import { Menu, Settings, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/shared/theme-toggle"
import { useUIStore } from "@/store/useUIStore"
import { AuthDialog } from "@/components/shared/auth-dialog"
import { SettingsDialog } from "@/components/shared/settings-dialog"

interface HeaderProps {
  title: string
  onMenuToggle: () => void
}

export function Header({ title, onMenuToggle }: HeaderProps) {
  const { language, setLanguage, user } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setLanguage: state.setLanguage,
      user: state.user,
    }))
  )
  const [authOpen, setAuthOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
        {user ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAuthOpen(true)}
            aria-label={t(language, "header.signIn")}
          >
            {t(language, "header.signIn")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAuthOpen(true)}
            aria-label={t(language, "header.signIn")}
          >
            {t(language, "header.signIn")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          aria-label={t(language, "header.settings")}
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </Button>
        <ThemeToggle />
      </div>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}