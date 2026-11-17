"use client"

import { useCallback, useState } from "react"
import { Calendar } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { useShallow } from "zustand/react/shallow"
import type { SavedVaultItem } from "@/store/useContentStore"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"
import { t, type Locale } from "@/locales/translations"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

function formatDateLabel(isoDate: string, language: Locale): string {
  const date = new Date(isoDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (target.getTime() === today.getTime()) return t(language, "planner.today")
  if (target.getTime() === tomorrow.getTime()) return t(language, "planner.tomorrow")
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function PlannerPage() {
  const { language } = useUIStore(useShallow((state) => ({ language: state.language })))
  const STATUS_LABEL: Record<string, string> = {
    idea: t(language, "vault.statusIdea"),
    draft: t(language, "vault.statusDraft"),
    scheduled: t(language, "vault.statusScheduled"),
  }
  const { savedVault, updateVaultItem } = useContentStore(
    useShallow((state) => ({
      savedVault: state.savedVault,
      updateVaultItem: state.updateVaultItem,
    }))
  )

  const [scheduleDates, setScheduleDates] = useState<Record<string, string>>({})

  const scheduledItems = savedVault.filter((item) => Boolean(item.scheduledDate))
  const unscheduledItems = savedVault.filter((item) => !item.scheduledDate)

  const groupedByDate = new Map<string, SavedVaultItem[]>()
  scheduledItems.forEach((item) => {
    const date = item.scheduledDate!
    const list = groupedByDate.get(date) ?? []
    list.push(item)
    groupedByDate.set(date, list)
  })
  const sortedDates = Array.from(groupedByDate.keys()).sort((a, b) =>
    a.localeCompare(b)
  )

  const handleSchedule = useCallback(
    (id: string) => {
      const date = scheduleDates[id]
      if (!date) {
        toast.error(t(language, "planner.pickDate"))
        return
      }
      updateVaultItem(id, { scheduledDate: date, status: "scheduled" })
      setScheduleDates((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      toast.success(t(language, "planner.scheduleSuccess", { date: new Date(date).toLocaleDateString() }))
    },
    [scheduleDates, updateVaultItem]
  )

  const handleCopy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    toast.success(t(language, "generator.copySuccess"))
  }, [language])

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">{t(language, "planner.title")}</CardTitle>
            <CardDescription>{t(language, "planner.desc")}</CardDescription>
          </div>
          <Badge variant="outline">{scheduledItems.length} {t(language, "planner.scheduled")}</Badge>
        </CardHeader>
        <CardContent>
          {sortedDates.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground leading-relaxed">
              {t(language, "planner.empty")}
            </div>
          ) : (
            <div className="space-y-4">
              {sortedDates.map((date) => {
                const items = groupedByDate.get(date) ?? []
                return (
                  <div key={date} className="border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="h-4 w-4" aria-hidden="true" />
                      <h3 className="font-semibold leading-relaxed">
                        {formatDateLabel(date, language)}
                      </h3>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {t(language, "planner.postsCount", { count: String(items.length) })}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <Card
                          key={item.id}
                          className="border bg-background p-3 hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => handleCopy(item.content)}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <h4 className="font-semibold leading-relaxed">
                                {item.title}
                              </h4>
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                {item.content}
                              </p>
                            </div>
                            <div className="flex flex-col gap-1 text-right">
                              <Badge variant="outline">
                                {STATUS_LABEL[item.status]}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {item.platform}
                              </span>
                            </div>
                          </div>
                          {item.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  #{tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t(language, "planner.unscheduled")}</CardTitle>
          <CardDescription>{t(language, "planner.unscheduledDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {unscheduledItems.length === 0 ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(language, "planner.allScheduled")}
            </p>
          ) : (
            <div className="space-y-3">
              {unscheduledItems.map((item) => (
                <Card key={item.id} className="border rounded-xl p-4">
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div>
                        <h4 className="font-semibold leading-relaxed">
                          {item.title}
                        </h4>
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                          {item.content}
                        </p>
                        <Badge variant="outline">
                          {STATUS_LABEL[item.status]}
                        </Badge>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <Input
                          type="date"
                          value={scheduleDates[item.id] ?? ""}
                          onChange={(e) =>
                            setScheduleDates((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="w-full sm:w-[170px]"
                        />
                        <Button onClick={() => handleSchedule(item.id)}>
                          {t(language, "planner.schedule")}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}