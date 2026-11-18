"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface SheetProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean
  onOpenChange: (open: boolean) => void
  side?: "left" | "right"
}

const Sheet = React.forwardRef<HTMLDivElement, SheetProps>(
  ({ open, onOpenChange, side = "left", className, ...props }, ref) => {
    const handleClose = () => onOpenChange(false)
    return (
      <>
        {open && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
            onClick={handleClose}
            aria-hidden="true"
          />
        )}
        <div
          ref={ref}
          className={cn(
            "fixed inset-y-0 z-50 h-full w-full max-w-[82vw] flex flex-col bg-card text-foreground shadow-2xl transform transition-transform duration-250 ease-out",
            side === "left"
              ? cn("left-0 border-r border-border", open ? "translate-x-0" : "-translate-x-full pointer-events-none")
              : cn("right-0 border-l border-border", open ? "translate-x-0" : "translate-x-full pointer-events-none"),
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
      className={cn("flex-1 flex flex-col p-4 border-b border-border", className)}
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
  <h2 ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
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
      "rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
      className
    )}
    {...props}
  >
    <X className="h-4 w-4" />
  </button>
))
SheetClose.displayName = "SheetClose"

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose }