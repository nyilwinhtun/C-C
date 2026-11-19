"use client"

import { useState } from "react"
import { t } from "@/locales/translations"
import { useShallow } from "zustand/react/shallow"
import { Menu, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUIStore } from "@/store/useUIStore"
import { SettingsDialog } from "@/components/shared/settings-dialog"

interface HeaderProps {
  title: string
  onMenuToggle: () => void
  onOpenSettings?: () => void
}

export function Header({ title, onMenuToggle, onOpenSettings }: HeaderProps) {
  const language = useUIStore(useShallow((state) => state.language))
  const [internalSettingsOpen, setInternalSettingsOpen] = useState(false)

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      onOpenSettings()
    } else {
      setInternalSettingsOpen(true)
    }
  }

  return (
    <header className="flex items-center justify-between gap-3 px-3.5 sm:px-6 min-h-14 py-2 border-b border-border/60 bg-background/80 backdrop-blur-md sticky top-0 z-20">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onMenuToggle}
        className="md:hidden h-9 w-9 border-border/60 shrink-0"
        aria-label={t(language, "sidebar.mobile_nav_title")}
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </Button>

      <h2 className="flex-1 min-w-0 text-sm sm:text-base font-semibold tracking-tight leading-snug font-myanmar">
        {title}
      </h2>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleOpenSettings}
        aria-label={t(language, "header.settings")}
        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
      </Button>

      {!onOpenSettings && (
        <SettingsDialog open={internalSettingsOpen} onOpenChange={setInternalSettingsOpen} />
      )}
    </header>
  )
}
