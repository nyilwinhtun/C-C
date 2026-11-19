"use client"

import { useEffect, useState } from "react"
import { GeneratorPage } from "@/features/generator/page"
import { VideoToContentSection } from "@/features/generator/VideoToContentSection"
import { TranscriberPage } from "@/features/transcriber/page"
import { VoiceoverPage } from "@/features/voiceover/page"
import { AudiobookPage } from "@/features/audiobook/page"
import { AutoCutPage } from "@/features/autocut/page"
import { PhotoStudioPage } from "@/features/photo-studio/page"
import { VaultAndCalendarPage } from "@/features/vault/page"
import { Header } from "@/components/shared/header"
import { Sidebar } from "@/components/shared/sidebar"
import { SettingsDialog } from "@/components/shared/settings-dialog"
import { PWAInstallBanner } from "@/components/shared/pwa-install-banner"
import { getRoomForPageKey, getRoomTitle } from "@/components/shared/rooms"
import { useUIStore } from "@/store/useUIStore"
import { useShallow } from "zustand/react/shallow"
import { cn } from "@/lib/utils"

const pages: Record<string, React.FC> = {
  text: GeneratorPage,
  video: VideoToContentSection,
  transcriber: TranscriberPage,
  voiceover: VoiceoverPage,
  audiobook: AudiobookPage,
  autocut: AutoCutPage,
  studio: PhotoStudioPage,
  vault: VaultAndCalendarPage,
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { language, activePageKey, setActivePageKey, sidebarCollapsed } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      activePageKey: state.activePageKey,
      setActivePageKey: state.setActivePageKey,
      sidebarCollapsed: state.sidebarCollapsed,
    }))
  )

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) {
        setMobileOpen(false)
      }
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const activeRoom = getRoomForPageKey(activePageKey)
  const roomTitle = getRoomTitle(activeRoom, language)
  const Page = pages[activePageKey] ?? GeneratorPage

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar mobileOpen={mobileOpen} onMobileToggle={setMobileOpen} />
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-[padding] duration-200",
          sidebarCollapsed ? "md:pl-16" : "md:pl-60"
        )}
      >
        <Header
          title={roomTitle}
          onMenuToggle={() => setMobileOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <main className="flex-1 overflow-y-auto bg-background text-foreground p-3.5 sm:p-6 pb-8">
          <div className="mx-auto max-w-6xl space-y-4">
            {activeRoom.tabs.length > 1 && (
              <div
                role="tablist"
                aria-label={roomTitle}
                className="inline-flex w-full sm:w-auto flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1"
              >
                {activeRoom.tabs.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activePageKey === tab.key
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActivePageKey(tab.key)}
                      className={cn(
                        "flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition-all cursor-pointer font-myanmar whitespace-nowrap",
                        isActive
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{language === "my" ? tab.labelMy : tab.labelEn}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <Page />
          </div>
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <PWAInstallBanner />
    </div>
  )
}
