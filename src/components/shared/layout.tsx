"use client"

import { useEffect, useState } from "react"
import { t } from "@/locales/translations"
import {
  Calendar,
  Camera,
  FileText,
  FolderKanban,
  LayoutList,
  Settings,
} from "lucide-react"
import { GeneratorPage } from "@/features/generator/page"
import { PhotoStudioPage } from "@/features/photo-studio/page"
import { PlannerPage } from "@/features/planner/page"
import { VaultPage } from "@/features/vault/page"
import { Header } from "@/components/shared/header"
import { Sidebar } from "@/components/shared/sidebar"
import { SettingsDialog } from "@/components/shared/settings-dialog"
import { PWAInstallBanner } from "@/components/shared/pwa-install-banner"
import { useUIStore } from "@/store/useUIStore"
import { useContentStore } from "@/store/useContentStore"
import { useShallow } from "zustand/react/shallow"
import { cn } from "@/lib/utils"

const pages: Record<string, React.FC> = {
  generator: GeneratorPage,
  "photo-studio": PhotoStudioPage,
  vault: VaultPage,
  planner: PlannerPage,
}

export function Layout() {
  const language = useUIStore(useShallow((state) => state.language))
  const pageTitles: Record<string, string> = {
    generator: t(language, "page.generator"),
    "photo-studio": t(language, "page.photo-studio"),
    vault: t(language, "page.vault"),
    planner: t(language, "page.planner"),
  }
  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { activePageKey, setActivePageKey, sidebarCollapsed } = useUIStore(
    useShallow((state) => ({
      activePageKey: state.activePageKey,
      setActivePageKey: state.setActivePageKey,
      sidebarCollapsed: state.sidebarCollapsed,
    }))
  )
  const { savedVault, generatedHistory } = useContentStore(
    useShallow((state) => ({
      savedVault: state.savedVault,
      generatedHistory: state.generatedHistory,
    }))
  )

  const savedCount = savedVault.length
  const scheduledCount = savedVault.filter((i) => Boolean(i.scheduledDate)).length
  const generatedCount = generatedHistory.length

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

  const mobileNavItems = [
    { key: "generator", label: t(language, "nav.mobile.generator"), icon: LayoutList },
    { key: "photo-studio", label: t(language, "nav.mobile.photo-studio"), icon: Camera },
    { key: "vault", label: t(language, "nav.mobile.vault"), icon: FolderKanban },
    { key: "planner", label: t(language, "nav.mobile.planner"), icon: Calendar },
  ] as const

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
          title={pageTitles[activePageKey] ?? t(language, "page.generator")}
          onMenuToggle={() => setMobileOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <main className="flex-1 overflow-y-auto bg-background text-foreground p-4 sm:p-6 pb-24 md:pb-8">
          <div className="mx-auto max-w-6xl">
            {activePageKey !== "generator" && activePageKey !== "photo-studio" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
                <StatCard title={t(language, "stats.savedIdeas")} value={savedCount} icon={FolderKanban} />
                <StatCard title={t(language, "stats.scheduledPosts")} value={scheduledCount} icon={Calendar} />
                <StatCard title={t(language, "stats.generatedCount")} value={generatedCount} icon={FileText} />
              </div>
            )}
            <Page />
          </div>
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label={t(language, "sidebar.mobile_nav_title")}
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-lg pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.25)]"
      >
        <div className="grid grid-cols-5 items-stretch">
          {mobileNavItems.map((item) => {
            const Icon = item.icon
            const isActive = !settingsOpen && activePageKey === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setSettingsOpen(false)
                  setActivePageKey(item.key)
                }}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 min-h-[60px] px-1 py-1.5 text-[11px] leading-tight transition-colors cursor-pointer",
                  isActive
                    ? "text-blue-600 dark:text-blue-400 font-semibold"
                    : "text-muted-foreground font-medium hover:text-foreground hover:bg-accent/30"
                )}
              >
                {isActive && (
                  <span
                    className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full px-2.5 py-0.5 transition-colors",
                    isActive ? "bg-blue-500/12 dark:bg-blue-500/20" : ""
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                </span>
                <span className="max-w-full whitespace-nowrap leading-tight">
                  {item.label}
                </span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={t(language, "nav.mobile.settings")}
            aria-current={settingsOpen ? "page" : undefined}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 min-h-[60px] px-1 py-1.5 text-[11px] leading-tight transition-colors cursor-pointer",
              settingsOpen
                ? "text-blue-600 dark:text-blue-400 font-semibold"
                : "text-muted-foreground font-medium hover:text-foreground hover:bg-accent/30"
            )}
          >
            {settingsOpen && (
              <span
                className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400"
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                "flex items-center justify-center rounded-full px-2.5 py-0.5 transition-colors",
                settingsOpen ? "bg-blue-500/12 dark:bg-blue-500/20" : ""
              )}
            >
              <Settings className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            </span>
            <span className="max-w-full whitespace-nowrap leading-tight">
              {t(language, "nav.mobile.settings")}
            </span>
          </button>
        </div>
      </nav>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <PWAInstallBanner />
    </div>
  )
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: React.ComponentType<any> }) {
  const Icon = icon
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-xs transition-all hover:shadow-sm flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-xs font-medium text-muted-foreground leading-relaxed block truncate">
          {title}
        </span>
        <div className="text-2xl font-bold tracking-tight mt-0.5">{value}</div>
      </div>
      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-blue-500/15 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
      </div>
    </div>
  )
}
