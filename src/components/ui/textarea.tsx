"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[80px] w-full rounded-[14px] border-[0.5px] border-[#18181B]/15 dark:border-[#FAF8F5]/15 bg-[#F3EFE8]/70 dark:bg-[#27272A] px-3.5 py-2.5 text-sm leading-[1.75] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181B]/30 dark:focus-visible:ring-[#FAF8F5]/40 focus-visible:bg-[#FAF8F5] dark:focus-visible:bg-[#18181B] disabled:cursor-not-allowed disabled:opacity-50 transition-all",
          className
        )}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
