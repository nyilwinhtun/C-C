"use client"

import { useEffect, useState } from "react"
import { Calendar, FolderKanban, FileText } from "lucide-react"
import { GeneratorPage } from "@/features/generator/page"
import { PlannerPage } from "@/features/planner/page"
import { VaultPage } from "@/features/vault/page"
import { Header } from "@/components/shared/header"
import { Sidebar } from "@/components/shared/sidebar"
import { useUIStore } from "@/store/useUIStore"
import { useContentStore } from "@/store/useContentStore"
import { useShallow } from "zustand/react/shallow"
import { cn } from "@/lib/utils"

const pages: Record<string, React.FC> = {
  generator: GeneratorPage,
  vault: VaultPage,
  planner: PlannerPage,
}

const pageTitles: Record<string, string> = {
  generator: "AI Generator",
  vault: "Idea Vault",
  planner: "Content Planner",
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const activePageKey = useUIStore((state) => state.activePageKey)
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
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
    <div className="flex h-screen bg-background">
      <Sidebar mobileOpen={mobileOpen} onMobileToggle={setMobileOpen} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={pageTitles[activePageKey] ?? "AI Generator"} onMenuToggle={() => setMobileOpen(true)} />
        <main
          className={cn(
            "flex-1 overflow-y-auto bg-background p-6",
            sidebarCollapsed ? "md:pl-16" : "md:pl-64"
          )}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <StatCard title="Saved Ideas" value={savedCount} icon={FolderKanban} />
            <StatCard title="Scheduled Posts" value={scheduledCount} icon={Calendar} />
            <StatCard title="Generated Count" value={generatedCount} icon={FileText} />
          </div>
          <Page />
        </main>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: React.ComponentType<any> }) {
  const Icon = icon
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">{title}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}
