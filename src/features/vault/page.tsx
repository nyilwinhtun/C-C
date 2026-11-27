"use client"

import { useCallback, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Calendar, Copy, FolderKanban, Image, Mic, PenLine, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { useShallow } from "zustand/react/shallow"
import { cleanVoiceoverText } from "@/api/ttsService"
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { IosSegmentedControl } from "@/components/shared/ios-segmented-control"
import { vaultItemSchema, type VaultItemFormValues } from "@/features/vault/schema"
import { PlannerPage } from "@/features/planner/page"

const PLATFORMS: { value: "facebook" | "tiktok" | "youtube" | "instagram"; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
]

type PlatformFilter = "all" | "facebook" | "tiktok" | "youtube" | "instagram"
type TagFilter = "all" | "promo" | "video_script" | "caption"

function matchesTagFilter(item: SavedVaultItem, filter: TagFilter): boolean {
  if (filter === "all") return true
  const tagsLower = item.tags.map((tag) => tag.toLowerCase())
  const haystack = `${item.title} ${item.content} ${tagsLower.join(" ")}`.toLowerCase()

  if (filter === "promo") {
    return (
      tagsLower.some((tag) =>
        ["promo", "flashsale", "sale", "discount", "specialoffer", "offer"].includes(tag)
      ) || /flash\s*sale|promo|discount|%\s*off|လျှော့ဈေး/i.test(haystack)
    )
  }

  if (filter === "video_script") {
    return (
      tagsLower.some((tag) =>
        ["video-script", "videoscript", "video", "reel", "reels", "script", "tiktok", "shorts"].includes(tag)
      ) || /video\s*script|\[visual|voiceover|hook\s*:/i.test(haystack)
    )
  }

  if (filter === "caption") {
    return (
      tagsLower.some((tag) =>
        ["caption", "post_caption", "post", "newarrival", "review", "collection", "launch"].includes(tag)
      ) || !matchesTagFilter(item, "video_script")
    )
  }

  return true
}

function getTodayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function VaultPage() {
  const { language, setActivePageKey } = useUIStore(
    useShallow((state) => ({
      language: state.language,
      setActivePageKey: state.setActivePageKey,
    }))
  )
  const STATUS_LABEL: Record<string, string> = {
    idea: t(language, "vault.statusIdea"),
    draft: t(language, "vault.statusDraft"),
    scheduled: t(language, "vault.statusScheduled"),
    posted: t(language, "vault.statusPosted"),
  }
  const { savedVault, saveToVault, updateVaultItem, deleteVaultItem, setDraftInput, setVoiceoverDraftScript, setPosterDraft } =
    useContentStore(
      useShallow((state) => ({
        savedVault: state.savedVault,
        saveToVault: state.saveToVault,
        updateVaultItem: state.updateVaultItem,
        deleteVaultItem: state.deleteVaultItem,
        setDraftInput: state.setDraftInput,
        setVoiceoverDraftScript: state.setVoiceoverDraftScript,
        setPosterDraft: state.setPosterDraft,
      }))
    )

  const [search, setSearch] = useState("")
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all")
  const [tagFilter, setTagFilter] = useState<TagFilter>("all")
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
    const matchesTag = matchesTagFilter(item, tagFilter)
    return matchesSearch && matchesPlatform && matchesTag
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
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t(language, "generator.copySuccess"))
      } catch {
        toast.error(t(language, "generator.copyError"))
      }
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

  const handleUseInGenerator = useCallback(
    (item: SavedVaultItem) => {
      const validPlatform = PLATFORMS.some((p) => p.value === item.platform)
        ? (item.platform as "facebook" | "tiktok" | "youtube" | "instagram")
        : "instagram"
      const isVideo = matchesTagFilter(item, "video_script")
      const isPromo = matchesTagFilter(item, "promo")
      const topicText = item.content.trim()
        ? item.content.trim().toLowerCase().startsWith(item.title.trim().toLowerCase())
          ? item.content.trim()
          : `${item.title.trim()}\n\n${item.content.trim()}`
        : item.title.trim()

      setDraftInput({
        topic: topicText,
        platform: validPlatform,
        contentType: isVideo ? "video_script" : "post_caption",
        salesAngle: isPromo ? "promo_showcase" : undefined,
      })
      setActivePageKey("text")
      toast.success(
        language === "my"
          ? "ပို့စ်ရေးရန် ထဲသို့ ထည့်သွင်းပြီးပါပြီ"
          : "Loaded into Script & Caption Writer"
      )
    },
    [language, setActivePageKey, setDraftInput]
  )

  const handleSendToVoiceBooth = useCallback(
    (item: SavedVaultItem) => {
      const sourceText = item.content.trim() || item.title.trim()
      if (!sourceText) return
      setVoiceoverDraftScript(cleanVoiceoverText(sourceText))
      setActivePageKey("voiceover")
      toast.success(
        language === "my"
          ? "အသံသွင်းခန်းသို့ ပို့ပြီးပါပြီ"
          : "Sent to Recording Booth"
      )
    },
    [language, setActivePageKey, setVoiceoverDraftScript]
  )

  const handleSendToPhotoStudio = useCallback(
    (item: SavedVaultItem) => {
      const sourceText = item.content.trim() || item.title.trim()
      if (!sourceText) return
      const lines = sourceText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      setPosterDraft({
        headline: (item.title.trim() || lines[0] || "").slice(0, 60),
        spec1: (lines[0] ?? "").slice(0, 40),
        spec2: (lines[1] ?? "").slice(0, 40),
        spec3: "",
        caption: sourceText,
      })
      setActivePageKey("photo-studio")
      toast.success(
        language === "my"
          ? "ဓာတ်ပုံစတူဒီယိုသို့ ပို့ပြီးပါပြီ"
          : "Sent to Photo Studio"
      )
    },
    [language, setActivePageKey, setPosterDraft]
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

  const handleAddStarterPreset = useCallback(
    (presetKey: "flash_sale" | "new_arrival" | "customer_review") => {
      const isMy = language === "my"
      const presets = {
        flash_sale: {
          title: t(language, "presets.flashSale"),
          platform: "facebook",
          content: isMy
            ? "⚡ ဒီနေ့တစ်ရက်တည်း 30% Off Flash Sale!\nလူကြိုက်များတဲ့ Best Seller ပစ္စည်းတွေကို အထူးလျှော့ဈေးနဲ့ မှာယူနိုင်ပါပြီ။ Stock ကုန်ခင် Inbox မှာ အမြန်ဆုံး မှာယူလိုက်ပါ!"
            : "⚡ 24-Hour Flash Sale! Get 30% off our best-selling items today only. Limited stock — DM us now to order!",
          tags: ["flashsale", "promo", "specialoffer"],
        },
        new_arrival: {
          title: t(language, "presets.newArrival"),
          platform: "instagram",
          content: isMy
            ? "✨ ပစ္စည်းသစ် ရောက်ရှိပါပြီ!\nဒီဇိုင်းသစ်၊ အရည်အသွေးမြင့် Collection အသစ်ကို အခုပဲ မှာယူနိုင်ပါပြီ။ အသေးစိတ်သိလိုပါက Comment သို့မဟုတ် Inbox မှာ မေးမြန်းနိုင်ပါတယ်။"
            : "✨ New Arrival Showcase! Our latest collection is finally here — crafted for everyday comfort and style. Tap the link or DM to grab yours!",
          tags: ["newarrival", "collection", "launch"],
        },
        customer_review: {
          title: t(language, "presets.customerReview"),
          platform: "facebook",
          content: isMy
            ? "⭐ ဝယ်ယူအားပေးသူ Customer များ၏ အမှန်တကယ် သုံးသပ်ချက်!\n\"အရည်အသွေးအရမ်းကောင်းပြီး ပို့ဆောင်မှုလည်း မြန်ဆန်ပါတယ်\" — ယုံကြည်စိတ်ချစွာ အားပေးကြတဲ့အတွက် ကျေးဇူးတင်ပါတယ်။"
            : "⭐ Real Customer Review: \"Super fast delivery and amazing quality!\" Thank you for trusting our shop — ready to order yours?",
          tags: ["review", "testimonial", "bestseller"],
        },
      } as const
      const p = presets[presetKey]
      saveToVault({
        title: p.title,
        platform: p.platform,
        content: p.content,
        tags: [...p.tags],
      })
      toast.success(t(language, "vault.saveSuccess"))
    },
    [language, saveToVault]
  )

  const emptyState = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <CardTitle className="text-xl">{t(language, "vault.title")}</CardTitle>
          <CardDescription>{t(language, "vault.emptySubtitle")}</CardDescription>
        </div>
        <Button onClick={openCreateDialog} className="min-h-[44px] rounded-xl font-medium">
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          {t(language, "vault.newIdea")}
        </Button>
      </div>
      <Card className="border-border/60 border-dashed bg-card/70">
        <CardContent className="py-12 px-6 flex flex-col items-center justify-center text-center gap-4">
          <div className="h-14 w-14 rounded-2xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-[#F0EDE8] dark:bg-[#27272A] flex items-center justify-center text-foreground">
            <FolderKanban className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base font-semibold text-foreground leading-relaxed">
              {t(language, "vault.emptyTitle")}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(language, "vault.emptyPresetHint")}
            </p>
          </div>
          <div className="w-full max-w-md space-y-2 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t(language, "presets.title")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { key: "flash_sale" as const, label: t(language, "presets.flashSale") },
                { key: "new_arrival" as const, label: t(language, "presets.newArrival") },
                { key: "customer_review" as const, label: t(language, "presets.customerReview") },
              ].map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handleAddStarterPreset(preset.key)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/80 hover:bg-accent/60 hover:border-blue-500/30 px-3 py-2.5 text-xs font-medium transition-all cursor-pointer"
                >
                  <PenLine className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="truncate">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
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
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">
          <Input
            placeholder={t(language, "vault.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-[280px]"
          />
          <Button onClick={openCreateDialog} className="min-h-[44px] rounded-xl font-medium">
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            {t(language, "vault.newIdea")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <IosSegmentedControl
          ariaLabel={t(language, "vault.filterPlatform")}
          value={platformFilter}
          onChange={(value) => setPlatformFilter(value as PlatformFilter)}
          options={[
            { value: "all", label: t(language, "vault.filterPlatform") },
            ...PLATFORMS.map((p) => ({ value: p.value, label: p.label })),
          ]}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "all", label: language === "my" ? "အားလုံး" : "All" },
              { id: "promo", label: language === "my" ? "ပရိုမိုးရှင်း" : "Promo" },
              { id: "video_script", label: language === "my" ? "ဗီဒီယို Script" : "Video Script" },
              { id: "caption", label: language === "my" ? "Caption" : "Caption" },
            ] as { id: TagFilter; label: string }[]
          ).map((pill) => {
            const active = tagFilter === pill.id
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setTagFilter(pill.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {pill.label}
              </button>
            )
          })}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{t(language, "vault.noMatching")}</CardTitle>
            <CardDescription>{t(language, "vault.noMatchingDesc")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <Card key={item.id} className="border border-border/60 rounded-2xl p-4 flex flex-col justify-between min-w-0">
              <CardHeader>
                <div className="flex flex-col gap-3 mb-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-relaxed break-words">{item.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{STATUS_LABEL[item.status]}</Badge>
                      <span className="text-xs text-muted-foreground leading-relaxed capitalize">
                        {item.platform}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full">
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
                        className="h-8 flex-1 min-w-0 px-2 text-xs"
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
                <Button
                  size="sm"
                  onClick={() => handleUseInGenerator(item)}
                >
                  <PenLine className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  {language === "my" ? "စာရေးစက်တွင်သုံးမည်" : "Use in Post Writer"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendToVoiceBooth(item)}
                >
                  <Mic className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  {language === "my" ? "🎙️ အသံသွင်းမည်" : "🎙️ Record"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendToPhotoStudio(item)}
                >
                  <Image className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  {language === "my" ? "🖼️ ပိုစတာဆွဲမည်" : "🖼️ Poster"}
                </Button>
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

export function VaultAndCalendarPage() {
  const language = useUIStore(useShallow((state) => state.language))
  const [subTab, setSubTab] = useState<"vault" | "calendar">("vault")

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={t(language, "page.vault")}
        className="inline-flex w-full sm:w-auto items-center rounded-xl border border-border/60 bg-muted/40 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "vault"}
          onClick={() => setSubTab("vault")}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all cursor-pointer font-myanmar ${
            subTab === "vault"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FolderKanban className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t(language, "nav.mobile.vault")}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "calendar"}
          onClick={() => setSubTab("calendar")}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all cursor-pointer font-myanmar ${
            subTab === "calendar"
              ? "bg-[#1C1917] dark:bg-[#F5F5F4] text-[#FAF8F5] dark:text-[#18181B]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t(language, "nav.mobile.planner")}</span>
        </button>
      </div>

      {subTab === "vault" ? <VaultPage /> : <PlannerPage />}
    </div>
  )
}