"use client"

import { useEffect, useState } from "react"
import { t } from "@/locales/translations"
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
  const language = useUIStore(useShallow((state) => state.language))
  const pageTitles: Record<string, string> = {
    text: t(language, "page.text"),
    video: t(language, "page.video"),
    transcriber: t(language, "page.transcriber"),
    voiceover: t(language, "page.voiceover"),
    audiobook: t(language, "page.audiobook"),
    autocut: t(language, "page.autocut"),
    studio: t(language, "page.studio"),
    vault: t(language, "page.vault"),
  }
  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { activePageKey, sidebarCollapsed } = useUIStore(
    useShallow((state) => ({
      activePageKey: state.activePageKey,
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
          title={pageTitles[activePageKey] ?? t(language, "page.text")}
          onMenuToggle={() => setMobileOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <main className="flex-1 overflow-y-auto bg-background text-foreground p-3.5 sm:p-6 pb-8">
          <div className="mx-auto max-w-6xl">
            <Page />
          </div>
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <PWAInstallBanner />
    </div>
  )
}
