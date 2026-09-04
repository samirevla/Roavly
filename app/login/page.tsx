"use client";

import { FormEvent, useMemo, useState } from "react";
import { LogIn } from "lucide-react";
import { RoavlyLogo } from "../components/roavly-logo";

type Mode = "login" | "signup";

export default function LoginPage() {
  const returnTo = useMemo(() => {
    if (typeof window === "undefined") return "/";
    const value = new URLSearchParams(window.location.search).get("return_to");
    if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
    return value;
  }, []);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        mode === "signup" ? "/api/auth/signup" : "/api/auth/login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            displayName: displayName || undefined,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error || "Could not sign in.");
        return;
      }
      window.location.href = returnTo;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="welcome-screen">
      <section className="welcome-card auth-card">
        <RoavlyLogo className="welcome-logo" />
        <span className="eyebrow">Welcome to Roavly</span>
        <h1>{mode === "signup" ? "Create your account" : "Sign in"}</h1>
        <p>
          Email and password only — no ChatGPT login required. Share outdoor
          journeys with friends on your own Roavly instance.
        </p>
        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Display name
              <input
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Alex Ridge"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            <LogIn size={19} />
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button type="button" className="linkish" onClick={() => setMode("login")}>
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button type="button" className="linkish" onClick={() => setMode("signup")}>
                Create an account
              </button>
            </>
          )}
        </p>
        <small>
          By continuing, you confirm you are at least 16 and agree to keep Roavly
          safe and positive.
        </small>
      </section>
    </main>
  );
}
