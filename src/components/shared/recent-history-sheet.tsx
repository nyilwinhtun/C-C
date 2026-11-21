"use client"

import { Trash2 } from "lucide-react"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export interface RecentHistoryEntry {
  id: string
  title: string
  meta?: string
  preview?: string
}

interface RecentHistorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  emptyText: string
  items: RecentHistoryEntry[]
  onSelect: (id: string) => void
  onDelete?: (id: string) => void
  deleteLabel?: string
}

export function RecentHistorySheet({
  open,
  onOpenChange,
  title,
  description,
  emptyText,
  items,
  onSelect,
  onDelete,
  deleteLabel,
}: RecentHistorySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="bottom">
      <SheetHeader>
        <div>
          <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
          <SheetDescription className="text-xs">{description}</SheetDescription>
        </div>
        <SheetClose onClick={() => onOpenChange(false)} />
      </SheetHeader>
      <SheetContent className="max-h-[70vh] space-y-2 overflow-y-auto border-b-0 px-5 py-4 pb-8">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground font-myanmar">{emptyText}</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-stretch gap-2 rounded-xl border border-[#18181B]/10 dark:border-[#FAF8F5]/10 bg-[#FAF8F5] dark:bg-[#27272A]/60"
            >
              <button
                type="button"
                onClick={() => {
                  onSelect(item.id)
                  onOpenChange(false)
                }}
                className="min-w-0 flex-1 cursor-pointer px-3 py-2.5 text-left"
              >
                <p className="truncate text-[13px] font-medium text-foreground font-myanmar">
                  {item.title}
                </p>
                {item.preview && (
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground font-myanmar">
                    {item.preview}
                  </p>
                )}
                {item.meta && (
                  <p className="mt-1 text-[10px] text-muted-foreground/80">{item.meta}</p>
                )}
              </button>
              {onDelete && (
                <button
                  type="button"
                  aria-label={deleteLabel}
                  onClick={() => onDelete(item.id)}
                  className="shrink-0 cursor-pointer px-3 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </SheetContent>
    </Sheet>
  )
}
