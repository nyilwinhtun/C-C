"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn, triggerHaptic } from "@/lib/utils"

interface SheetProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean
  onOpenChange: (open: boolean) => void
  side?: "left" | "right" | "bottom"
}

const Sheet = React.forwardRef<HTMLDivElement, SheetProps>(
  ({ open, onOpenChange, side = "left", className, style, onTouchStart, onTouchMove, onTouchEnd, ...props }, ref) => {
    const handleClose = () => onOpenChange(false)
    const [dragY, setDragY] = React.useState(0)
    const [isDragging, setIsDragging] = React.useState(false)
    const touchStartYRef = React.useRef<number | null>(null)
    const canDragRef = React.useRef(false)

    React.useEffect(() => {
      if (!open) {
        setDragY(0)
        setIsDragging(false)
        touchStartYRef.current = null
        canDragRef.current = false
      }
    }, [open])

    const handleSheetTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
      onTouchStart?.(e)
      if (side !== "bottom" || !open) return
      const target = e.target as HTMLElement | null
      const scrollable = target?.closest("[data-sheet-scroll], .overflow-y-auto") as HTMLElement | null
      const atTop = !scrollable || scrollable.scrollTop <= 0
      canDragRef.current = atTop
      touchStartYRef.current = e.touches[0]?.clientY ?? null
    }

    const handleSheetTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
      onTouchMove?.(e)
      if (side !== "bottom" || !open || !canDragRef.current || touchStartYRef.current === null) return
      const currentY = e.touches[0]?.clientY ?? touchStartYRef.current
      const deltaY = currentY - touchStartYRef.current
      if (deltaY > 6) {
        setIsDragging(true)
        setDragY(deltaY)
      } else if (deltaY <= 0 && isDragging) {
        setDragY(0)
      }
    }

    const handleSheetTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
      onTouchEnd?.(e)
      if (side !== "bottom" || !open) return
      if (isDragging && dragY > 85) {
        triggerHaptic(8)
        setDragY(0)
        setIsDragging(false)
        touchStartYRef.current = null
        canDragRef.current = false
        handleClose()
        return
      }
      setDragY(0)
      setIsDragging(false)
      touchStartYRef.current = null
      canDragRef.current = false
    }

    const dragStyle: React.CSSProperties | undefined =
      side === "bottom" && open && dragY > 0
        ? { ...style, transform: `translateY(${dragY}px)` }
        : style

    return (
      <>
        {open && (
          <div
            className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm transition-opacity duration-200"
            onClick={handleClose}
            aria-hidden="true"
          />
        )}
        <div
          ref={ref}
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
          style={dragStyle}
          className={cn(
            "fixed z-50 flex flex-col bg-white/92 dark:bg-[#1C1C1E]/95 ios-glass text-foreground shadow-2xl transform",
            isDragging
              ? "transition-none"
              : "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            side === "bottom"
              ? cn(
                  "inset-x-0 bottom-0 max-h-[88vh] w-full rounded-t-3xl border-t-[0.5px] border-[rgba(60,60,67,0.14)] dark:border-[rgba(84,84,88,0.42)] pb-[max(1rem,env(safe-area-inset-bottom))]",
                  open ? "translate-y-0" : "translate-y-full pointer-events-none"
                )
              : side === "left"
              ? cn(
                  "inset-y-0 left-0 h-full w-full max-w-[82vw] border-r-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)]",
                  open ? "translate-x-0" : "-translate-x-full pointer-events-none"
                )
              : cn(
                  "inset-y-0 right-0 h-full w-full max-w-[82vw] border-l-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)]",
                  open ? "translate-x-0" : "translate-x-full pointer-events-none"
                ),
            className
          )}
          role="dialog"
          aria-modal="true"
          aria-hidden={!open}
          {...props}
        />
      </>
    )
  }
)
Sheet.displayName = "Sheet"

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {}
const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex-1 flex flex-col p-4 border-b-[0.5px] border-[rgba(60,60,67,0.12)] dark:border-[rgba(84,84,88,0.36)]", className)}
      {...props}
    />
  )
)
SheetContent.displayName = "SheetContent"

interface SheetHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}
const SheetHeader = React.forwardRef<HTMLDivElement, SheetHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-between", className)}
      {...props}
    />
  )
)
SheetHeader.displayName = "SheetHeader"

const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn("text-lg font-semibold tracking-tight", className)} {...props} />
))
SheetTitle.displayName = "SheetTitle"

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
SheetDescription.displayName = "SheetDescription"

const SheetClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "rounded-full w-7 h-7 flex items-center justify-center bg-neutral-200/70 dark:bg-neutral-700/70 text-muted-foreground transition-all hover:text-foreground active:scale-95 focus:outline-none focus:ring-2 focus:ring-ring",
      className
    )}
    {...props}
  >
    <X className="h-3.5 w-3.5" strokeWidth={2} />
  </button>
))
SheetClose.displayName = "SheetClose"

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose }
