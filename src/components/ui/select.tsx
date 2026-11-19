"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-[12px] border-[0.5px] border-[rgba(60,60,67,0.14)] dark:border-[rgba(84,84,88,0.38)] bg-[#F2F2F7]/65 dark:bg-[#2C2C2E] px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/40 dark:focus-visible:ring-[#0A84FF]/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = "Select"

export interface SelectGroupProps extends React.HTMLAttributes<HTMLOptGroupElement> {}
const SelectGroup = React.forwardRef<HTMLOptGroupElement, SelectGroupProps>(
  ({ className, ...props }, ref) => (
    <optgroup ref={ref} className={cn(className)} {...props} />
  )
)
SelectGroup.displayName = "SelectGroup"

export interface SelectItemProps extends React.OptionHTMLAttributes<HTMLOptionElement> {}
const SelectItem = React.forwardRef<HTMLOptionElement, SelectItemProps>(
  ({ className, ...props }, ref) => (
    <option
      ref={ref}
      className={cn("text-sm", className)}
      {...props}
    />
  )
)
SelectItem.displayName = "SelectItem"

// Alias kept for API familiarity with shadcn/ui
export const SelectTrigger = Select
export { Select, SelectGroup, SelectItem }
