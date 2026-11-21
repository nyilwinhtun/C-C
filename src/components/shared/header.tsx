"use client"

import { useState } from "react"
import { t } from "@/locales/translations"
import { useShallow } from "zustand/react/shallow"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUIStore } from "@/store/useUIStore"
import { SettingsDialog } from "@/components/shared/settings-dialog"
import { SquircleIcon } from "@/components/shared/squircle-icon"
import { getRoomForPageKey } from "@/components/shared/rooms"

interface HeaderProps {
  title: string
  onOpenSettings?: () => void
}

export function Header({ title, onOpenSettings }: HeaderProps) {
  const { language, activePageKey } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      activePageKey: state.activePageKey,
    }))
  )
  const [internalSettingsOpen, setInternalSettingsOpen] = useState(false)
  const activeRoom = getRoomForPageKey(activePageKey)

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      onOpenSettings()
    } else {
      setInternalSettingsOpen(true)
    }
  }

  return (
    <header className="flex items-center justify-between gap-3 px-4 sm:px-6 min-h-14 py-2 border-b-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)] bg-white/80 dark:bg-black/80 ios-glass sticky top-0 z-20 pt-safe">
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <SquircleIcon icon={activeRoom.icon} tone={activeRoom.tone} size="sm" />
        <h2 className="min-w-0 text-[17px] sm:text-lg font-bold tracking-tight leading-snug font-myanmar truncate">
          {title}
        </h2>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleOpenSettings}
        aria-label={t(language, "header.settings")}
        className="h-9 w-9 shrink-0 rounded-full bg-black/[0.04] dark:bg-white/[0.08] text-foreground/80 hover:text-foreground"
      >
        <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
      </Button>

      {!onOpenSettings && (
        <SettingsDialog open={internalSettingsOpen} onOpenChange={setInternalSettingsOpen} />
      )}
    </header>
  )
}
