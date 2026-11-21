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
import { IosSegmentedControl } from "@/components/shared/ios-segmented-control"
import { WORKSPACE_ROOMS, getRoomForPageKey, getRoomTitle } from "@/components/shared/rooms"
import { useUIStore } from "@/store/useUIStore"
import { useShallow } from "zustand/react/shallow"
import { cn, triggerHaptic } from "@/lib/utils"

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

  const activeRoom = getRoomForPageKey(activePageKey)
  const roomTitle = getRoomTitle(activeRoom, language)
  const Page = pages[activePageKey] ?? GeneratorPage

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-[padding] duration-200",
          sidebarCollapsed ? "md:pl-[68px]" : "md:pl-[248px]"
        )}
      >
        <Header
          title={roomTitle}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <main className="flex-1 overflow-y-auto bg-background text-foreground p-3.5 sm:p-6 pb-28 md:pb-8">
          <div className="mx-auto max-w-6xl space-y-4">
            {activeRoom.tabs.length > 1 && (
              <IosSegmentedControl
                ariaLabel={roomTitle}
                value={activePageKey}
                onChange={setActivePageKey}
                options={activeRoom.tabs.map((tab) => ({
                  value: tab.key,
                  label: language === "my" ? tab.labelMy : tab.labelEn,
                  icon: tab.icon,
                }))}
              />
            )}
            <Page />
          </div>
        </main>
      </div>

      {/* Mobile iOS Frosted Glass Bottom Tab Bar */}
      <nav
        aria-label="Primary sections"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)] bg-white/80 dark:bg-black/80 ios-glass pb-safe"
      >
        <div className="grid grid-cols-4 h-[54px] px-1">
          {WORKSPACE_ROOMS.map((room) => {
            const Icon = room.icon
            const isActive = activeRoom.id === room.id
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => {
                  triggerHaptic(8)
                  setActivePageKey(room.defaultPageKey)
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 cursor-pointer",
                  isActive
                    ? "text-[#007AFF] dark:text-[#0A84FF]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  className="h-5 w-5"
                  strokeWidth={isActive ? 2.1 : 1.75}
                  aria-hidden="true"
                />
                <span className="text-[10px] font-medium leading-none font-myanmar truncate max-w-[76px]">
                  {language === "my" ? room.shortMy : room.shortEn}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <PWAInstallBanner />
    </div>
  )
}
