"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";

type Mode = "login" | "register";

const demoAccounts = [
  { name: "Alice", email: "alice@example.com" },
  { name: "Rahul", email: "rahul@example.com" },
  { name: "Priya", email: "priya@example.com" },
];

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function selectMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setEmailError("");
    setPasswordError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const nextEmailError = validEmail(email) ? "" : "Enter a valid email address.";
    const nextPasswordError =
      password.length >= 8 ? "" : "Password must be at least 8 characters.";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError || (mode === "register" && !name.trim())) {
      if (mode === "register" && !name.trim()) {
        setError("Enter your name to create an account.");
      }
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<AuthResponse>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(
          mode === "register"
            ? { name: name.trim(), email: email.trim(), password }
            : { email: email.trim(), password },
        ),
      });
      router.replace("/");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We couldn’t sign you in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemoAccount(account: (typeof demoAccounts)[number]) {
    setMode("login");
    setName(account.name);
    setEmail(account.email);
    setPassword("Test@1234");
    setError("");
    setEmailError("");
    setPasswordError("");
  }

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <a className="brand auth-brand" href="/" aria-label="Taskmate home">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <span>taskmate</span>
        </a>
        <div className="auth-heading">
          <p className="eyebrow">YOUR DAY, IN GOOD HANDS</p>
          <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p>Plan, organize, and get things done through conversation.</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button
            aria-selected={mode === "login"}
            className={mode === "login" ? "auth-tab selected" : "auth-tab"}
            onClick={() => selectMode("login")}
            role="tab"
            type="button"
          >
            Log in
          </button>
          <button
            aria-selected={mode === "register"}
            className={mode === "register" ? "auth-tab selected" : "auth-tab"}
            onClick={() => selectMode("register")}
            role="tab"
            type="button"
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {mode === "register" && (
            <div className="form-field">
              <label htmlFor="name">Your name</label>
              <input
                autoComplete="name"
                id="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Alex Morgan"
                required
                value={name}
              />
            </div>
          )}
          <div className="form-field">
            <label htmlFor="email">Email address</label>
            <input
              autoComplete="email"
              aria-describedby={emailError ? "email-error" : undefined}
              aria-invalid={Boolean(emailError)}
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            {emailError && <span className="field-error" id="email-error">{emailError}</span>}
          </div>
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              aria-describedby={passwordError ? "password-error" : undefined}
              aria-invalid={Boolean(passwordError)}
              id="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              required
              type="password"
              value={password}
            />
            {passwordError && (
              <span className="field-error" id="password-error">{passwordError}</span>
            )}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" disabled={submitting} type="submit">
            {submitting
              ? "Please wait…"
              : mode === "login"
                ? "Log in"
                : "Create account"}
            {!submitting && <span aria-hidden="true">→</span>}
          </button>
        </form>

        <div className="demo-box">
          <div className="demo-heading">
            <span className="demo-icon" aria-hidden="true">✧</span>
            <span>Demo accounts</span>
            <span className="demo-password">Password: Test@1234</span>
          </div>
          <div className="demo-buttons">
            {demoAccounts.map((account) => (
              <button
                className="demo-button"
                key={account.email}
                onClick={() => fillDemoAccount(account)}
                type="button"
              >
                {account.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="auth-footer">A calmer way to keep everything moving.</p>
    </main>
  );
}
