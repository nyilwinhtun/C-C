"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/45 backdrop-blur-sm transition-opacity duration-200",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 sm:inset-auto sm:left-[50%] sm:top-[50%] z-50 grid w-full sm:max-w-lg gap-4 border-[0.5px] border-[rgba(60,60,67,0.16)] dark:border-[rgba(84,84,88,0.42)] bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-2xl p-5 sm:p-6 pt-3 sm:pt-6 pb-safe shadow-2xl rounded-t-[28px] sm:rounded-[24px] max-h-[90dvh] overflow-y-auto animate-ios-sheet",
        className
      )}
      {...props}
    >
      {/* iOS Bottom Sheet Drag Handle Pill */}
      <div className="sm:hidden flex justify-center pb-1" aria-hidden="true">
        <div className="w-9 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
      </div>
      {children}
      <DialogPrimitive.Close
        className="absolute right-4 top-4 rounded-full w-7 h-7 flex items-center justify-center bg-neutral-200/70 dark:bg-neutral-700/70 text-muted-foreground hover:text-foreground transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogClose = DialogPrimitive.Close

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold tracking-tight", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
}
