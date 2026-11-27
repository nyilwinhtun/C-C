"use client"

import { useEffect, useRef, useState } from "react"
import { GeneratorPage } from "@/features/generator/page"
import { VideoToContentSection } from "@/features/generator/VideoToContentSection"
import { TranscriberPage } from "@/features/transcriber/page"
import { VoiceoverPage } from "@/features/voiceover/page"
import { AudiobookPage } from "@/features/audiobook/page"
import { PhotoStudioPage } from "@/features/photo-studio/page"
import { Presenter3DPage } from "@/features/presenter-3d/page"
import { SocialQrPage } from "@/features/social-qr/page"
import { VaultAndCalendarPage } from "@/features/vault/page"
import { Header } from "@/components/shared/header"
import { Sidebar } from "@/components/shared/sidebar"
import { SettingsDialog } from "@/components/shared/settings-dialog"
import { PWAInstallBanner } from "@/components/shared/pwa-install-banner"
import { IosSegmentedControl } from "@/components/shared/ios-segmented-control"
import { WORKSPACE_ROOMS, getRoomForPageKey, getRoomShort, getRoomTitle, getTabLabel } from "@/components/shared/rooms"
import { t } from "@/locales/translations"
import { useUIStore } from "@/store/useUIStore"
import { useContentStore } from "@/store/useContentStore"
import { useShallow } from "zustand/react/shallow"
import { cn, triggerHaptic } from "@/lib/utils"

const pages: Record<string, React.FC> = {
  text: GeneratorPage,
  video: VideoToContentSection,
  transcriber: TranscriberPage,
  voiceover: VoiceoverPage,
  audiobook: AudiobookPage,
  studio: PhotoStudioPage,
  presenter3d: Presenter3DPage,
  socialQr: SocialQrPage,
  vault: VaultAndCalendarPage,
}

export function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tabBarVisible, setTabBarVisible] = useState(true)
  const mainRef = useRef<HTMLElement | null>(null)
  const lastScrollTopRef = useRef(0)

  const { language, activePageKey, setActivePageKey, sidebarCollapsed } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      activePageKey: state.activePageKey,
      setActivePageKey: state.setActivePageKey,
      sidebarCollapsed: state.sidebarCollapsed,
    }))
  )

  const { ttsStatus, ttsProgress } = useContentStore(
    useShallow((state) => ({
      ttsStatus: state.ttsStatus,
      ttsProgress: state.ttsProgress,
    }))
  )
  const isBgTtsActive =
    (ttsStatus === "preparing" || ttsStatus === "generating") && activePageKey !== "voiceover"

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    setTabBarVisible(true)
    lastScrollTopRef.current = mainRef.current?.scrollTop ?? 0
  }, [activePageKey])

  const handleMainScroll = (e: React.UIEvent<HTMLElement>) => {
    const currentScrollTop = Math.max(0, e.currentTarget.scrollTop)

    if (currentScrollTop <= 40) {
      setTabBarVisible(true)
      lastScrollTopRef.current = currentScrollTop
      return
    }

    const deltaY = currentScrollTop - lastScrollTopRef.current
    if (deltaY > 10) {
      setTabBarVisible(false)
      lastScrollTopRef.current = currentScrollTop
    } else if (deltaY < -8) {
      setTabBarVisible(true)
      lastScrollTopRef.current = currentScrollTop
    }
  }

  const activeRoom = getRoomForPageKey(activePageKey)
  const activeRoomIndex = Math.max(
    0,
    WORKSPACE_ROOMS.findIndex((room) => room.id === activeRoom.id)
  )
  const roomTitle = getRoomTitle(activeRoom, language)
  const Page = pages[activePageKey] ?? GeneratorPage

  return (
    <div className="flex h-[100dvh] bg-background text-foreground">
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
        <main
          ref={mainRef}
          onScroll={handleMainScroll}
          className="flex-1 overflow-y-auto bg-background text-foreground p-3.5 sm:p-6 pb-28 md:pb-8"
        >
          <div className="mx-auto max-w-6xl space-y-4">
            {activeRoom.tabs.length > 1 && (
              <IosSegmentedControl
                ariaLabel={roomTitle}
                value={activePageKey}
                onChange={setActivePageKey}
                options={activeRoom.tabs.map((tab) => ({
                  value: tab.key,
                  label: getTabLabel(tab, language),
                  icon: tab.icon,
                  badge:
                    tab.key === "voiceover" && isBgTtsActive ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-700 dark:text-amber-300"
                        aria-label="Voiceover generating in background"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        {ttsProgress && ttsProgress.total > 1 && (
                          <span>
                            {ttsProgress.current}/{ttsProgress.total}
                          </span>
                        )}
                      </span>
                    ) : tab.badge ? (
                      <span
                        className={cn(
                          "hidden sm:inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none",
                          tab.badge === "instant"
                            ? "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
                            : "bg-stone-500/10 text-stone-600 dark:bg-zinc-400/15 dark:text-zinc-300"
                        )}
                      >
                        {t(language, tab.badge === "instant" ? "home.badge.instant" : "home.badge.noApi")}
                      </span>
                    ) : undefined,
                }))}
              />
            )}
            <Page />
          </div>
        </main>
      </div>

      {/* Mobile iOS Frosted Glass Bottom Tab Bar (4 Clean Primary Tabs) */}
      <nav
        aria-label="Primary sections"
        className={cn(
          "md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#E7E5E4] dark:border-[#3F3F46] bg-[#FAF8F5]/90 dark:bg-[#18181B]/90 ios-glass pb-safe transition-all duration-300 ease-out",
          tabBarVisible
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none"
        )}
      >
        <div className="relative grid grid-cols-4 h-[58px] px-1.5">
          {/* GPU-Accelerated Sliding Active Pill Indicator */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1.5 right-1.5"
          >
            <div
              className="nav-active-slider h-full w-1/4 flex items-start justify-center pt-[6px]"
              style={{
                transform: `translate3d(${activeRoomIndex * 100}%, 0, 0)`,
              }}
            >
              <span className="nav-pill-glow h-[28px] w-[46px] rounded-full bg-[#1C1917]/10 dark:bg-[#F5F5F4]/14 ring-1 ring-[#1C1917]/8 dark:ring-[#F5F5F4]/15 shadow-[0_2px_10px_rgba(28,25,23,0.08)] dark:shadow-[0_2px_12px_rgba(245,245,244,0.09)]" />
            </div>
          </div>

          {WORKSPACE_ROOMS.map((room) => {
            const Icon = room.icon
            const isActive = activeRoom.id === room.id
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => {
                  triggerHaptic(10)
                  setTabBarVisible(true)
                  setActivePageKey(room.defaultPageKey)
                }}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "nav-tab-press relative z-10 flex flex-col items-center justify-center gap-0.5 cursor-pointer min-w-0 select-none",
                  isActive
                    ? room.activeColorClass
                    : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300"
                )}
              >
                <span
                  key={`${room.id}-${isActive ? "active" : "idle"}`}
                  className={cn(
                    "relative inline-flex h-[28px] w-[46px] items-center justify-center rounded-full",
                    isActive
                      ? "animate-nav-tab-spring"
                      : "transition-transform duration-200 ease-out"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[19px] w-[19px]",
                      isActive && "nav-icon-float"
                    )}
                    strokeWidth={isActive ? 2.2 : 1.75}
                    aria-hidden="true"
                  />
                  {room.id === "audio" && isBgTtsActive && (
                    <span
                      className="absolute top-0.5 right-2 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-[#FAF8F5] dark:ring-[#18181B] animate-pulse"
                      aria-label="Voiceover generating in background"
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "text-[10px] leading-none font-myanmar whitespace-nowrap truncate max-w-[72px] transition-opacity duration-200",
                    isActive ? "font-bold opacity-100" : "font-medium opacity-80"
                  )}
                >
                  {getRoomShort(room, language)}
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
