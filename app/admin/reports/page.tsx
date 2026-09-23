"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Flag,
  LoaderCircle,
  LogIn,
  MessageCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { WaymarkLogo } from "../../components/waymark-logo";

type InboxReport = {
  id: string;
  targetType: string;
  targetId: string;
  reporterEmail: string;
  reason: string;
  status: string;
  createdAt: string | number | Date;
  snippet: string;
  authorEmail: string | null;
  contentMissing?: boolean;
};

type LoadState = "loading" | "ready" | "forbidden" | "signed_out" | "error";

function typeLabel(type: string) {
  if (type === "post") return "Post";
  if (type === "comment") return "Comment";
  if (type === "message") return "DM";
  return type;
}

function formatWhen(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Melbourne",
  }).format(date);
}

export default function AdminReportsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [reports, setReports] = useState<InboxReport[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const me = await fetch("/api/me");
      if (me.status === 401) {
        setState("signed_out");
        setReports([]);
        return;
      }
      const response = await fetch("/api/admin/reports");
      if (response.status === 403) {
        setState("forbidden");
        setReports([]);
        return;
      }
      if (!response.ok) {
        setState("error");
        setError("Could not load open reports.");
        return;
      }
      const payload = (await response.json()) as { reports?: InboxReport[] };
      setReports(payload.reports || []);
      setState("ready");
    } catch {
      setState("error");
      setError("Network error while loading reports.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function triage(reportId: string, action: "resolve" | "dismiss") {
    setBusyId(reportId);
    setError("");
    try {
      const response = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId, action }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not update that report.");
        return;
      }
      setReports((current) => current.filter((item) => item.id !== reportId));
      setToast(action === "resolve" ? "Report resolved." : "Report dismissed.");
    } catch {
      setError("Network error while updating the report.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="admin-reports-screen">
      <header className="admin-reports-header">
        <div className="admin-reports-brand">
          <WaymarkLogo className="admin-reports-logo" />
          <div>
            <span className="eyebrow">Safety</span>
            <h1>Moderation inbox</h1>
            <p>Open community reports for posts, comments, and DMs.</p>
          </div>
        </div>
        <div className="admin-reports-meta">
          <span className="admin-reports-count">
            <ShieldCheck size={16} />
            {state === "ready" ? `${reports.length} open` : "—"}
          </span>
          <button type="button" className="admin-reports-refresh" onClick={() => void load()} disabled={state === "loading"}>
            Refresh
          </button>
        </div>
      </header>

      {toast ? <div className="admin-reports-toast" role="status">{toast}</div> : null}
      {error ? <div className="admin-reports-error" role="alert">{error}</div> : null}

      {state === "loading" ? (
        <section className="admin-reports-empty">
          <LoaderCircle className="spin" size={22} />
          <p>Loading open reports…</p>
        </section>
      ) : null}

      {state === "signed_out" ? (
        <section className="admin-reports-empty">
          <LogIn size={22} />
          <h2>Sign in required</h2>
          <p>Moderator access uses your Waymark account email allowlist.</p>
          <a className="admin-reports-cta" href="/login?return_to=/admin/reports">
            Sign in
          </a>
        </section>
      ) : null}

      {state === "forbidden" ? (
        <section className="admin-reports-empty">
          <ShieldCheck size={22} />
          <h2>Moderator access required</h2>
          <p>Your account is signed in, but it is not on the Waymark admin allowlist.</p>
          <a className="admin-reports-cta secondary" href="/">
            Back to Waymark
          </a>
        </section>
      ) : null}

      {state === "error" ? (
        <section className="admin-reports-empty">
          <Flag size={22} />
          <h2>Could not load inbox</h2>
          <p>{error || "Try again in a moment."}</p>
          <button type="button" className="admin-reports-cta" onClick={() => void load()}>
            Retry
          </button>
        </section>
      ) : null}

      {state === "ready" && reports.length === 0 ? (
        <section className="admin-reports-empty">
          <CheckCircle2 size={22} />
          <h2>Inbox clear</h2>
          <p>No open content reports right now. New reports from posts, comments, and DMs land here.</p>
        </section>
      ) : null}

      {state === "ready" && reports.length > 0 ? (
        <ul className="admin-reports-list">
          {reports.map((report) => (
            <li key={report.id} className="admin-report-card">
              <div className="admin-report-top">
                <span className={`admin-report-type type-${report.targetType}`}>
                  {report.targetType === "message" ? <MessageCircle size={14} /> : <Flag size={14} />}
                  {typeLabel(report.targetType)}
                </span>
                <time dateTime={String(report.createdAt)}>{formatWhen(report.createdAt)}</time>
              </div>
              <p className="admin-report-snippet">
                {report.snippet || (report.contentMissing ? "Content no longer available." : "No preview available.")}
              </p>
              <dl className="admin-report-meta">
                <div>
                  <dt>Reason</dt>
                  <dd>{report.reason}</dd>
                </div>
                <div>
                  <dt>Reporter</dt>
                  <dd>{report.reporterEmail}</dd>
                </div>
                <div>
                  <dt>Author</dt>
                  <dd>{report.authorEmail || "Unknown"}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd className="mono">{report.targetId}</dd>
                </div>
              </dl>
              <div className="admin-report-actions">
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => void triage(report.id, "resolve")}
                >
                  <CheckCircle2 size={16} />
                  Resolve
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busyId === report.id}
                  onClick={() => void triage(report.id, "dismiss")}
                >
                  <XCircle size={16} />
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
