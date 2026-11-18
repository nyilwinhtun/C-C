"use client"

import { useCallback, useState } from "react"
import { Calendar, CheckCircle2, Circle, Copy, Plus, X } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectItem } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

const PLATFORMS = [
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
] as const

function getTodayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDateLabel(isoDate: string, language: Locale): string {
  const target = new Date(`${isoDate}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (target.getTime() === today.getTime()) return t(language, "planner.today")
  if (target.getTime() === tomorrow.getTime()) return t(language, "planner.tomorrow")
  return target.toLocaleDateString(undefined, {
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
    posted: t(language, "planner.posted"),
  }
  const { savedVault, saveToVault, updateVaultItem } = useContentStore(
    useShallow((state) => ({
      savedVault: state.savedVault,
      saveToVault: state.saveToVault,
      updateVaultItem: state.updateVaultItem,
    }))
  )

  const todayIso = getTodayIsoDate()
  const [scheduleDates, setScheduleDates] = useState<Record<string, string>>({})
  const [dateFilter, setDateFilter] = useState("")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [previewItemId, setPreviewItemId] = useState<string | null>(null)
  const [newPostDate, setNewPostDate] = useState(todayIso)
  const [newPostTitle, setNewPostTitle] = useState("")
  const [newPostPlatform, setNewPostPlatform] = useState("facebook")
  const [newPostContent, setNewPostContent] = useState("")
  const [newPostTags, setNewPostTags] = useState("")

  const scheduledItems = savedVault.filter((item) => Boolean(item.scheduledDate))
  const unscheduledItems = savedVault.filter((item) => !item.scheduledDate)
  const previewItem = scheduledItems.find((item) => item.id === previewItemId) ?? null

  const visibleScheduledItems = dateFilter
    ? scheduledItems.filter((item) => item.scheduledDate === dateFilter)
    : scheduledItems

  const groupedByDate = new Map<string, SavedVaultItem[]>()
  visibleScheduledItems.forEach((item) => {
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
      const date = scheduleDates[id] ?? todayIso
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
      toast.success(
        t(language, "planner.scheduleSuccess", {
          date: new Date(`${date}T00:00:00`).toLocaleDateString(),
        })
      )
    },
    [language, scheduleDates, todayIso, updateVaultItem]
  )

  const handleTogglePosted = useCallback(
    (item: SavedVaultItem) => {
      const nextStatus = item.status === "posted" ? "scheduled" : "posted"
      updateVaultItem(item.id, { status: nextStatus })
    },
    [updateVaultItem]
  )

  const handleUnschedule = useCallback(
    (item: SavedVaultItem) => {
      updateVaultItem(item.id, { scheduledDate: undefined, status: "draft" })
    },
    [updateVaultItem]
  )

  const handleCopy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t(language, "generator.copySuccess"))
      } catch {
        toast.error(t(language, "generator.copyError"))
      }
    },
    [language]
  )

  const handleAddPost = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!newPostDate) {
        toast.error(t(language, "planner.pickDate"))
        return
      }
      if (newPostTitle.trim().length < 2 || newPostContent.trim().length < 5) {
        return
      }
      const parsedTags = newPostTags
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)

      saveToVault({
        title: newPostTitle.trim(),
        platform: newPostPlatform,
        content: newPostContent.trim(),
        tags: parsedTags,
        status: "scheduled",
        scheduledDate: newPostDate,
      })

      toast.success(
        t(language, "planner.scheduleSuccess", {
          date: new Date(`${newPostDate}T00:00:00`).toLocaleDateString(),
        })
      )
      setNewPostTitle("")
      setNewPostContent("")
      setNewPostTags("")
      setNewPostDate(todayIso)
      setAddDialogOpen(false)
    },
    [
      language,
      newPostContent,
      newPostDate,
      newPostPlatform,
      newPostTags,
      newPostTitle,
      saveToVault,
      todayIso,
    ]
  )

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex-1">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{t(language, "planner.title")}</CardTitle>
            <CardDescription>{t(language, "planner.desc")}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                aria-label={t(language, "planner.filterAllDates")}
                className="h-8 w-[150px] px-2 text-xs"
              />
              {dateFilter && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setDateFilter("")}
                >
                  <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  {t(language, "planner.clearFilter")}
                </Button>
              )}
            </div>
            <Badge variant="outline">
              {scheduledItems.length} {t(language, "planner.scheduled")}
            </Badge>
            <Button
              size="sm"
              onClick={() => setAddDialogOpen(true)}
              className="min-h-[44px] rounded-xl font-medium px-4"
            >
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {t(language, "planner.addPost")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sortedDates.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/70 bg-muted/15 p-6 text-center text-sm text-muted-foreground leading-relaxed gap-3">
              <p className="max-w-sm">
                {dateFilter
                  ? t(language, "planner.noPostsForDate")
                  : t(language, "planner.empty")}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddDialogOpen(true)}
                className="min-h-[44px] rounded-xl font-medium px-4"
              >
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {t(language, "planner.addPost")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedDates.map((date) => {
                const items = groupedByDate.get(date) ?? []
                return (
                  <div key={date} className="border border-border/60 rounded-2xl p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Calendar className="h-4 w-4" aria-hidden="true" />
                      <h3 className="font-semibold leading-relaxed">
                        {formatDateLabel(date, language)}
                      </h3>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {t(language, "planner.postsCount", { count: String(items.length) })}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const isPosted = item.status === "posted"
                        return (
                          <Card
                            key={item.id}
                            onClick={() => setPreviewItemId(item.id)}
                            className="border bg-background p-3 hover:bg-accent/30 transition-colors cursor-pointer"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-semibold leading-relaxed">
                                    {item.title}
                                  </h4>
                                  <span className="text-xs text-muted-foreground capitalize">
                                    {item.platform}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mt-1">
                                  {item.content}
                                </p>
                              </div>
                              <div
                                className="flex flex-wrap items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleTogglePosted(item)}
                                  className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                                  title={t(language, "planner.markPosted")}
                                >
                                  <Badge
                                    variant={isPosted ? "default" : "outline"}
                                    className={
                                      isPosted
                                        ? "cursor-pointer bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/25"
                                        : "cursor-pointer hover:bg-accent"
                                    }
                                  >
                                    {isPosted ? (
                                      <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden="true" />
                                    ) : (
                                      <Circle className="h-3 w-3 mr-1" aria-hidden="true" />
                                    )}
                                    {isPosted
                                      ? t(language, "planner.posted")
                                      : STATUS_LABEL[item.status] ?? t(language, "vault.statusScheduled")}
                                  </Badge>
                                </button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleCopy(item.content)}
                                >
                                  <Copy className="h-3 w-3 mr-1" aria-hidden="true" />
                                  {t(language, "vault.copy")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => handleUnschedule(item)}
                                  title={t(language, "planner.unschedule")}
                                >
                                  <X className="h-3 w-3" aria-hidden="true" />
                                </Button>
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
                        )
                      })}
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
                <Card key={item.id} className="border border-border/60 rounded-2xl p-4">
                  <CardHeader className="p-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold leading-relaxed">
                          {item.title}
                        </h4>
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                          {item.content}
                        </p>
                        <Badge variant="outline" className="mt-2">
                          {STATUS_LABEL[item.status]}
                        </Badge>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <Input
                          type="date"
                          value={scheduleDates[item.id] ?? todayIso}
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

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogTitle>{t(language, "planner.addPost")}</DialogTitle>
          <DialogDescription>{t(language, "planner.addPostDesc")}</DialogDescription>
          <Separator className="my-3" />
          <form onSubmit={handleAddPost} className="grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label>{t(language, "vault.scheduledDate")}</Label>
                <Input
                  type="date"
                  value={newPostDate}
                  onChange={(e) => setNewPostDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>{t(language, "vault.formPlatform")}</Label>
                <Select
                  value={newPostPlatform}
                  onChange={(e) => setNewPostPlatform(e.target.value)}
                >
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label>{t(language, "vault.formTitle")}</Label>
              <Input
                value={newPostTitle}
                onChange={(e) => setNewPostTitle(e.target.value)}
                placeholder={t(language, "vault.formTitlePlaceholder")}
                required
                minLength={2}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>{t(language, "vault.formContent")}</Label>
              <Textarea
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                rows={4}
                placeholder={t(language, "vault.formContentPlaceholder")}
                required
                minLength={5}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>{t(language, "vault.formTags")}</Label>
              <Input
                value={newPostTags}
                onChange={(e) => setNewPostTags(e.target.value)}
                placeholder={t(language, "vault.formTagsPlaceholder")}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                {t(language, "vault.cancel")}
              </Button>
              <Button type="submit">{t(language, "planner.schedule")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Sheet
        open={Boolean(previewItem)}
        onOpenChange={(open) => {
          if (!open) setPreviewItemId(null)
        }}
        side="right"
        className="w-full sm:max-w-md"
      >
        {previewItem && (
          <SheetContent className="border-b-0 gap-4 overflow-y-auto">
            <SheetHeader className="items-start gap-3 border-b border-border/60 pb-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="capitalize text-xs">
                    {previewItem.platform}
                  </Badge>
                  {previewItem.scheduledDate && (
                    <span className="text-xs text-muted-foreground">
                      {formatDateLabel(previewItem.scheduledDate, language)} ({previewItem.scheduledDate})
                    </span>
                  )}
                </div>
                <SheetTitle className="text-base leading-snug break-words">
                  {previewItem.title}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  {t(language, "planner.desc")}
                </SheetDescription>
              </div>
              <SheetClose onClick={() => setPreviewItemId(null)} aria-label="Close" />
            </SheetHeader>

            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 text-sm leading-relaxed whitespace-pre-wrap break-words">
                {previewItem.content}
              </div>

              {previewItem.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {previewItem.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border/60 pt-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={previewItem.status === "posted" ? "outline" : "default"}
                  size="sm"
                  onClick={() => handleTogglePosted(previewItem)}
                  className={
                    previewItem.status === "posted"
                      ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/20"
                      : ""
                  }
                >
                  {previewItem.status === "posted" ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                      {language === "my" ? "တင်ပြီး (Posted)" : "Posted"}
                    </>
                  ) : (
                    <>
                      <Circle className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                      {language === "my" ? "စီစဉ်ထား (Planned)" : "Planned"}
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(previewItem.content)}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {language === "my" ? "Copy Post" : "Copy Post"}
                </Button>
              </div>
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  )
}