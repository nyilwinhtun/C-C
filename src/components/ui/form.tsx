"use client"

import { type UseFormReturn, FormProvider, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

export interface FormProps<T extends z.ZodTypeAny> {
  schema?: T
  defaultValues: z.infer<T>
  onSubmit: (values: z.infer<T>) => void
  children: React.ReactNode
}

export function Form<T extends z.ZodTypeAny>({
  schema,
  defaultValues,
  onSubmit,
  children,
}: FormProps<T>) {
  const resolver = schema
    ? (zodResolver as (s: unknown) => unknown)(schema)
    : undefined

  const config = {
    resolver,
    defaultValues,
  } as never

  const methods = useForm(config) as unknown as unknown as UseFormReturn<
    Record<string, unknown>
  >

  return (
    <FormProvider {...(methods as unknown as UseFormReturn<Record<string, unknown>>)}>
      <form
        onSubmit={
          methods.handleSubmit(
            onSubmit as unknown as (values: Record<string, unknown>) => void
          )
        }
      >
        {children}
      </form>
    </FormProvider>
  )
}