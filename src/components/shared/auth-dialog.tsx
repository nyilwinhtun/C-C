"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { useUIStore } from "@/store/useUIStore";
import { t } from "@/locales/translations";

export function AuthDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const language = useUIStore((state) => state.language);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success(t(language, "auth.signInSuccess"));
        onOpenChange(false);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast.success(t(language, "auth.signUpSuccess"));
        onOpenChange(false);
      }
    } catch (err: any) {
      setError(err.message || t(language, "auth.error"));
      toast.error(err.message || t(language, "auth.error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{mode === "signin" ? t(language, "auth.title") : t(language, "auth.signUpTitle")}</DialogTitle>
        <DialogDescription>{mode === "signin" ? t(language, "auth.signInDesc") : t(language, "auth.signUpDesc")}</DialogDescription>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="auth-email">{t(language, "auth.email")}</Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={false}
            />
          </div>

          <div>
            <Label htmlFor="auth-password">{t(language, "auth.password")}</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="alert alert-error">{error}</div>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? t(language, "auth.createAccount") : t(language, "auth.signIn")}
            </Button>
            <Button type="submit" >{mode === "signin" ? t(language, "auth.signIn") : t(language, "auth.signUp")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
