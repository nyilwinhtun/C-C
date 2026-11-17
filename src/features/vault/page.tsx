"use client"

import { useCallback, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Calendar, Copy, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { useShallow } from "zustand/react/shallow"
import type { SavedVaultItem } from "@/store/useContentStore"
import { useContentStore } from "@/store/useContentStore"
import { useUIStore } from "@/store/useUIStore"
import { t } from "@/locales/translations"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectItem } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { vaultItemSchema, type VaultItemFormValues } from "@/features/vault/schema"

const PLATFORMS: { value: "facebook" | "tiktok" | "youtube" | "instagram"; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
]

type PlatformFilter = "all" | "facebook" | "tiktok" | "youtube" | "instagram"

function getTodayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function VaultPage() {
  const { language } = useUIStore(useShallow((state) => ({ language: state.language })))
  const STATUS_LABEL: Record<string, string> = {
    idea: t(language, "vault.statusIdea"),
    draft: t(language, "vault.statusDraft"),
    scheduled: t(language, "vault.statusScheduled"),
    posted: t(language, "vault.statusPosted"),
  }
  const { savedVault, saveToVault, updateVaultItem, deleteVaultItem } =
    useContentStore(
      useShallow((state) => ({
        savedVault: state.savedVault,
        saveToVault: state.saveToVault,
        updateVaultItem: state.updateVaultItem,
        deleteVaultItem: state.deleteVaultItem,
      }))
    )

  const [search, setSearch] = useState("")
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<SavedVaultItem | null>(null)
  const [scheduleDates, setScheduleDates] = useState<Record<string, string>>({})
  const todayIso = getTodayIsoDate()

  const form = useForm<VaultItemFormValues>({
    resolver: zodResolver(vaultItemSchema),
    defaultValues: { title: "", platform: "instagram", content: "", tags: "" },
  })

  const filteredItems = savedVault.filter((item) => {
    const text = `${item.title} ${item.content} ${item.tags.join(" ")}`.toLowerCase()
    const matchesSearch = text.includes(search.toLowerCase())
    const matchesPlatform =
      platformFilter === "all" || item.platform === platformFilter
    return matchesSearch && matchesPlatform
  })

  const openCreateDialog = useCallback(() => {
    setEditingItem(null)
    form.reset({ title: "", platform: "instagram", content: "", tags: "" })
    setDialogOpen(true)
  }, [form])

  const openEditDialog = useCallback(
    (item: SavedVaultItem) => {
      setEditingItem(item)
      const validPlatform = PLATFORMS.some((p) => p.value === item.platform)
        ? (item.platform as VaultItemFormValues["platform"])
        : "instagram"
      form.reset({
        title: item.title,
        platform: validPlatform,
        content: item.content,
        tags: item.tags.join(", "),
      })
      setDialogOpen(true)
    },
    [form]
  )

  const handleSubmit = useCallback(
    (values: VaultItemFormValues) => {
      const parsedTags = values.tags
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)

      if (editingItem) {
        updateVaultItem(editingItem.id, {
          title: values.title,
          platform: values.platform,
          content: values.content,
          tags: parsedTags,
        })
        toast.success(t(language, "vault.updateSuccess"))
      } else {
        saveToVault({
          title: values.title,
          platform: values.platform,
          content: values.content,
          tags: parsedTags,
        })
        toast.success(t(language, "vault.saveSuccess"))
      }
      form.reset()
      setEditingItem(null)
      setDialogOpen(false)
    },
    [editingItem, form, language, saveToVault, updateVaultItem]
  )

  const handleCopy = useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text)
      toast.success(t(language, "vault.copy"))
    },
    [language]
  )

  const handleStatusChange = useCallback(
    (id: string, status: SavedVaultItem["status"]) => {
      updateVaultItem(id, { status })
    },
    [updateVaultItem]
  )

  const handleScheduleOneClick = useCallback(
    (item: SavedVaultItem) => {
      const date = scheduleDates[item.id] ?? item.scheduledDate ?? todayIso
      if (!date) {
        toast.error(t(language, "vault.pickDate"))
        return
      }
      updateVaultItem(item.id, {
        scheduledDate: date,
        status: item.status === "posted" ? "posted" : "scheduled",
      })
      toast.success(t(language, "vault.scheduleSuccess", { date }))
    },
    [language, scheduleDates, todayIso, updateVaultItem]
  )

  const handleDelete = useCallback(
    (id: string) => {
      deleteVaultItem(id)
      toast.success(t(language, "vault.deleteSuccess"))
    },
    [deleteVaultItem, language]
  )


  const renderDialog = () => (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) setEditingItem(null)
      }}
    >
      <DialogContent>
        <DialogTitle>
          {editingItem ? t(language, "vault.editIdea") : t(language, "vault.newIdea")}
        </DialogTitle>
        <DialogDescription>{t(language, "vault.desc")}</DialogDescription>
        <Separator className="my-4" />
        <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>{t(language, "vault.formTitle")}</Label>
              <Input {...form.register("title")} placeholder={t(language, "vault.formTitlePlaceholder")} />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label>{t(language, "vault.formPlatform")}</Label>
              <Select {...form.register("platform")}>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>{t(language, "vault.formContent")}</Label>
            <Textarea {...form.register("content")} rows={4} placeholder={t(language, "vault.formContentPlaceholder")} />
            {form.formState.errors.content && (
              <p className="text-xs text-destructive">{form.formState.errors.content.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label>{t(language, "vault.formTags")}</Label>
            <Input {...form.register("tags")} placeholder={t(language, "vault.formTagsPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t(language, "vault.tagsLabel")}</p>
            {form.formState.errors.tags && (
              <p className="text-xs text-destructive">{form.formState.errors.tags.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t(language, "vault.cancel")}
            </Button>
            <Button type="submit">{t(language, "vault.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )

  const emptyState = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <CardTitle className="text-xl">{t(language, "vault.title")}</CardTitle>
          <CardDescription>{t(language, "vault.emptySubtitle")}</CardDescription>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          {t(language, "vault.newIdea")}
        </Button>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t(language, "vault.title")}</CardTitle>
          <CardDescription>{t(language, "vault.emptySubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="h-96 flex flex-col items-center justify-center text-center">
          <p className="text-muted-foreground leading-relaxed">
            {t(language, "vault.emptyDesc")}
          </p>
        </CardContent>
      </Card>
      {renderDialog()}
    </div>
  )

  if (savedVault.length === 0) {
    return emptyState
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <CardTitle className="text-xl">{t(language, "vault.title")}</CardTitle>
          <CardDescription>
            {t(language, "vault.savedCount", { count: String(savedVault.length) })}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 w-full lg:w-auto">
          <Input
            placeholder={t(language, "vault.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-[280px]"
          />
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            {t(language, "vault.newIdea")}
          </Button>
        </div>
      </div>

      <Tabs
        value={platformFilter}
        onValueChange={(value) => setPlatformFilter(value as PlatformFilter)}
      >
        <TabsList>
          <TabsTrigger value="all">{t(language, "vault.filterPlatform")}</TabsTrigger>
          {PLATFORMS.map((p) => (
            <TabsTrigger key={p.value} value={p.value}>{p.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filteredItems.length === 0 ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{t(language, "vault.noMatching")}</CardTitle>
            <CardDescription>{t(language, "vault.noMatchingDesc")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredItems.map((item) => (
            <Card key={item.id} className="border rounded-xl p-4">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
                  <div>
                    <h3 className="font-semibold leading-relaxed">{item.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{STATUS_LABEL[item.status]}</Badge>
                      <span className="text-xs text-muted-foreground leading-relaxed capitalize">
                        {item.platform}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full sm:flex-row sm:w-auto sm:items-center">
                    <Select
                      value={item.status}
                      onChange={(e) =>
                        handleStatusChange(
                          item.id,
                          e.target.value as SavedVaultItem["status"]
                        )
                      }
                    >
                      <SelectItem value="idea">{t(language, "vault.statusIdea")}</SelectItem>
                      <SelectItem value="draft">{t(language, "vault.statusDraft")}</SelectItem>
                      <SelectItem value="scheduled">{t(language, "vault.statusScheduled")}</SelectItem>
                      <SelectItem value="posted">{t(language, "vault.statusPosted")}</SelectItem>
                    </Select>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="date"
                        value={scheduleDates[item.id] ?? item.scheduledDate ?? todayIso}
                        onChange={(e) =>
                          setScheduleDates((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        className="h-8 w-[145px] px-2 text-xs"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 px-2.5 text-xs shrink-0"
                        onClick={() => handleScheduleOneClick(item)}
                      >
                        <Calendar className="h-3 w-3 mr-1" aria-hidden="true" />
                        {t(language, "vault.schedule")}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="mb-3">
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  {item.content}
                </p>
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {item.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => handleCopy(item.content)}>
                  <Copy className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  {t(language, "vault.copy")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEditDialog(item)}>
                  <Pencil className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  {t(language, "vault.edit")}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                  <Trash2 className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  {t(language, "vault.delete")}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
      {renderDialog()}
    </div>
  )
}