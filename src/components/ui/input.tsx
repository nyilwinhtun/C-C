"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="text"
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-[12px] border-[0.5px] border-[#18181B]/15 dark:border-[#FAF8F5]/15 bg-[#F3EFE8]/70 dark:bg-[#27272A] px-3 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181B]/30 dark:focus-visible:ring-[#FAF8F5]/40 focus-visible:bg-[#FAF8F5] dark:focus-visible:bg-[#18181B] disabled:cursor-not-allowed disabled:opacity-50 transition-all",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
