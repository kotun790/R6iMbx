"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AuthFormProps = { mode: "login" | "register" };

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const formData = new FormData(event.currentTarget);
    const payload = {
      username: String(formData.get("username") ?? "").trim(),
      password: String(formData.get("password") ?? "")
    };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "We couldn't complete that request.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="auth-wrap">
        <div className="wordmark"><span className="wordmark-mark" aria-hidden="true" />Casino portal <span aria-hidden="true">/</span> account access</div>
        <section className="auth-card" aria-labelledby="auth-title">
          <p className="eyebrow">{isRegister ? "Create player account" : "Member access"}</p>
          <h1 className="page-title" id="auth-title">{isRegister ? "Start with your account." : "Welcome back."}</h1>
          <p className="lede">{isRegister ? "Choose a username and password to set up your player account." : "Sign in to continue to your account."}</p>

          <form className="form-stack" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field-label">Username</span>
              <input
                className="field-input"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="e.g. player_name"
                minLength={3}
                maxLength={24}
                pattern="[A-Za-z0-9_]+"
                title="Use letters, numbers, and underscores."
                required
              />
              {isRegister && <span className="field-hint">3–24 letters, numbers, or underscores. Usernames are case-insensitive.</span>}
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                className="field-input"
                name="password"
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                placeholder={isRegister ? "At least 8 characters" : "Enter your password"}
                minLength={isRegister ? 8 : undefined}
                maxLength={72}
                required
              />
              {isRegister && <span className="field-hint">At least 8 characters; bcrypt accepts up to 72 UTF-8 bytes.</span>}
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
            </button>
          </form>
          <p className="auth-foot">
            {isRegister ? "Already have an account? " : "New to the portal? "}
            <Link className="auth-link" href={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create an account"}</Link>
          </p>
        </section>
        <p className="page-note">Account access only. Wallet funding and game features are not part of this setup phase.</p>
      </div>
    </main>
  );
}
