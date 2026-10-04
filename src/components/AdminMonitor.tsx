/**
 * AdminMonitor — Development-only admin dashboard for leaderboard oversight.
 *
 * Access is gated by two localStorage keys:
 *   localStorage.setItem('asteroids_admin', 'true')
 *   localStorage.setItem('asteroids_admin_key', '<ADMIN_SECRET_KEY env value>')
 *
 * Features:
 *  - Real-time submission log with severity-highlighted flags
 *  - Score detail view (session token, level, time played)
 *  - One-click score removal (via Edge Function admin-delete endpoint)
 *  - Export suspicious submissions as CSV
 */

import { useState, useEffect, useCallback, Fragment } from "react";

interface Score {
  id: string;
  initials: string;
  score: number;
  level: number | null;
  time_played_seconds: number | null;
  source: string | null;
  created_at: string;
}

interface Flag {
  id: string;
  score_id: string;
  flag_type: string;
  severity: string;
  reasoning: string | null;
  admin_override: boolean;
  created_at: string;
}

interface AuditLog {
  score_id: string;
  session_token: string | null;
  submission_method: string | null;
  created_at: string;
}

interface RejectedSubmission {
  id: string;
  created_at: string;
  initials: string | null;
  score: number | null;
  level: number | null;
  code: string | null;
  message: string | null;
  detail: Record<string, unknown> | null;
  approved: boolean;
  session_token: string | null;
  origin: string | null;
  user_agent: string | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUBMIT_URL = `${SUPABASE_URL}/functions/v1/submit`;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const severityColor: Record<string, string> = {
  low: "#90EE90",
  medium: "#FFD700",
  high: "#FF4444",
};

export function AdminMonitor() {
  const [adminKey, setAdminKey] = useState<string>(() =>
    localStorage.getItem("asteroids_admin_key") || ""
  );
  const [keyInput, setKeyInput] = useState("");
  const [scores, setScores] = useState<Score[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [rejected, setRejected] = useState<RejectedSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [selectedScore, setSelectedScore] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(true);
  const [expandedRejected, setExpandedRejected] = useState<string | null>(null);

  const fetchData = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SUBMIT_URL}/admin-data`, {
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "x-admin-key": key,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setError(body.error || "Failed to fetch data");
        setLoading(false);
        return;
      }
      const { scores: s, flags: f, auditLogs: a, rejected: r } = await res.json();
      setScores(s || []);
      setFlags(f || []);
      setAuditLogs(a || []);
      setRejected(r || []);
      localStorage.setItem("asteroids_admin_key", key);
      setAdminKey(key);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount if a key was previously saved in localStorage.
  // Intentionally runs once only; subsequent fetches are triggered manually or via the REFRESH button.
  useEffect(() => {
    const savedKey = localStorage.getItem("asteroids_admin_key");
    if (savedKey) fetchData(savedKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteScore = async (scoreId: string) => {
    if (!confirm("Remove this score from the leaderboard?")) return;
    try {
      const res = await fetch(`${SUBMIT_URL}/admin-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ scoreId }),
      });
      if (!res.ok) {
        alert("Failed to delete score");
        return;
      }
      setScores((prev) => prev.filter((s) => s.id !== scoreId));
      setFlags((prev) => prev.filter((f) => f.score_id !== scoreId));
      setAuditLogs((prev) => prev.filter((a) => a.score_id !== scoreId));
      if (selectedScore === scoreId) setSelectedScore(null);
    } catch (e) {
      alert(String(e));
    }
  };

  const approveRejected = async (rejectedId: string) => {
    if (!confirm("Approve this score onto the leaderboard?")) return;
    try {
      const res = await fetch(`${SUBMIT_URL}/admin-approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ rejectedId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        alert(body.error || "Failed to approve score");
        return;
      }
      await fetchData(adminKey);
    } catch (e) {
      alert(String(e));
    }
  };

  const exportCSV = () => {
    const flaggedScoreIds = new Set(flags.map((f) => f.score_id));
    const rows = scores
      .filter((s) => filter === "all" || flaggedScoreIds.has(s.id))
      .map((s) => {
        const scoreFlags = flags.filter((f) => f.score_id === s.id);
        return [
          s.initials,
          s.score,
          s.level ?? "",
          s.time_played_seconds ?? "",
          s.source ?? "",
          new Date(s.created_at).toISOString(),
          scoreFlags.map((f) => f.flag_type).join("|"),
          scoreFlags.map((f) => f.severity).join("|"),
        ].join(",");
      });
    const csv = ["initials,score,level,time_s,source,created_at,flags,severities", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leaderboard-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const flaggedScoreIds = new Set(flags.map((f) => f.score_id));
  const displayScores = filter === "all" ? scores : scores.filter((s) => flaggedScoreIds.has(s.id));

  const getScoreFlags = (scoreId: string) => flags.filter((f) => f.score_id === scoreId);
  const getAudit = (scoreId: string) => auditLogs.find((a) => a.score_id === scoreId);
  const getMaxSeverity = (scoreId: string): string | null => {
    const sf = getScoreFlags(scoreId);
    if (sf.some((f) => f.severity === "high")) return "high";
    if (sf.some((f) => f.severity === "medium")) return "medium";
    if (sf.length > 0) return "low";
    return null;
  };

  if (!adminKey) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.92)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          color: "#fff",
          fontFamily: "monospace",
        }}
      >
        <div style={{ fontSize: 20, marginBottom: 16, color: "#FFD700" }}>⚡ ADMIN MONITOR</div>
        {error && <div style={{ color: "#FF4444", marginBottom: 12 }}>{error}</div>}
        <input
          type="password"
          placeholder="Admin key"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchData(keyInput)}
          style={{
            background: "transparent",
            border: "1px solid #FFD700",
            color: "#fff",
            padding: "6px 12px",
            fontFamily: "monospace",
            fontSize: 16,
            marginBottom: 8,
          }}
          autoFocus
        />
        <button
          onClick={() => fetchData(keyInput)}
          style={{
            background: "#FFD700",
            color: "#000",
            border: "none",
            padding: "6px 18px",
            fontFamily: "monospace",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          AUTHENTICATE
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.95)",
        color: "#fff",
        fontFamily: "monospace",
        fontSize: 13,
        overflowY: "auto",
        zIndex: 9999,
        padding: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <span style={{ fontSize: 18, color: "#FFD700" }}>⚡ ADMIN MONITOR</span>
        <span style={{ color: "#888" }}>
          {scores.length} scores · {flags.length} flags
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setFilter(filter === "all" ? "flagged" : "all"); }}
          style={btnStyle(filter === "flagged" ? "#FFD700" : "#555")}
        >
          {filter === "flagged" ? "SHOW ALL" : "FLAGGED ONLY"}
        </button>
        <button onClick={exportCSV} style={btnStyle("#555")}>
          EXPORT CSV
        </button>
        <button onClick={() => fetchData(adminKey)} style={btnStyle("#555")}>
          ↻ REFRESH
        </button>
        <button
          onClick={() => {
            localStorage.removeItem("asteroids_admin_key");
            setAdminKey("");
          }}
          style={btnStyle("#555")}
        >
          LOGOUT
        </button>
      </div>

      {error && (
        <div style={{ color: "#FF4444", marginBottom: 12, padding: "6px 12px", border: "1px solid #FF4444" }}>
          {error}
        </div>
      )}

      {loading && <div style={{ color: "#888" }}>Loading…</div>}

      {/* Rejected submissions */}
      {!loading && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: "#FF4444", fontSize: 13 }}>
              REJECTED SUBMISSIONS ({rejected.length})
            </span>
            <button
              onClick={() => setShowRejected(!showRejected)}
              style={btnStyle("#555", 11)}
            >
              {showRejected ? "[-]" : "[+]"}
            </button>
          </div>
          {showRejected && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #333", color: "#888" }}>
                  <th style={th}>TIME</th>
                  <th style={th}>INITIALS</th>
                  <th style={th}>SCORE</th>
                  <th style={th}>LEVEL</th>
                  <th style={th}>CODE</th>
                  <th style={th}>MESSAGE</th>
                  <th style={th}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rejected
                  .slice()
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((r) => {
                    const isExpanded = expandedRejected === r.id;
                    const canApprove = r.initials !== null && r.score !== null && !r.approved;
                    return (
                      <Fragment key={r.id}>
                        <tr
                          style={{
                            background: isExpanded ? "#222" : "transparent",
                            borderBottom: "1px solid #1a1a1a",
                            cursor: "pointer",
                            opacity: r.approved ? 0.5 : 1,
                          }}
                          onClick={() => setExpandedRejected(isExpanded ? null : r.id)}
                        >
                          <td style={td}>{new Date(r.created_at).toLocaleString()}</td>
                          <td style={td}>{r.initials ?? "—"}</td>
                          <td style={td}>{r.score !== null ? r.score.toLocaleString() : "—"}</td>
                          <td style={td}>{r.level ?? "—"}</td>
                          <td style={td}>
                            {r.code && (
                              <span
                                style={{
                                  background: severityColor.high + "33",
                                  color: severityColor.high,
                                  border: `1px solid ${severityColor.high}55`,
                                  borderRadius: 3,
                                  padding: "1px 5px",
                                  fontSize: 11,
                                }}
                              >
                                {r.code}
                              </span>
                            )}
                          </td>
                          <td style={td}>{r.message ?? "—"}</td>
                          <td style={td}>
                            {r.approved ? (
                              <span style={{ color: "#90EE90", fontSize: 11 }}>APPROVED</span>
                            ) : canApprove ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  approveRejected(r.id);
                                }}
                                style={btnStyle("#90EE90", 11)}
                              >
                                APPROVE
                              </button>
                            ) : null}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} style={{ padding: "8px 16px", background: "#111", borderBottom: "1px solid #333" }}>
                              <pre
                                style={{
                                  margin: 0,
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  fontSize: 11,
                                  color: "#aaa",
                                }}
                              >
                                {JSON.stringify(r.detail ?? {}, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                {rejected.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ ...td, color: "#888", textAlign: "center" }}>
                      No rejected submissions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Score list */}
      {!loading && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333", color: "#888" }}>
              <th style={th}>INITIALS</th>
              <th style={th}>SCORE</th>
              <th style={th}>LEVEL</th>
              <th style={th}>TIME (s)</th>
              <th style={th}>SUBMITTED</th>
              <th style={th}>FLAGS</th>
              <th style={th}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {displayScores.map((s) => {
              const severity = getMaxSeverity(s.id);
              const rowColor = severity ? severityColor[severity] + "18" : "transparent";
              const isSelected = selectedScore === s.id;
              return (
                <Fragment key={s.id}>
                  <tr
                    key={s.id}
                    style={{
                      background: isSelected ? "#222" : rowColor,
                      borderBottom: "1px solid #1a1a1a",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedScore(isSelected ? null : s.id)}
                  >
                    <td style={td}>
                      {severity && (
                        <span
                          style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: severityColor[severity],
                            marginRight: 6,
                          }}
                        />
                      )}
                      {s.initials}
                    </td>
                    <td style={td}>{s.score.toLocaleString()}</td>
                    <td style={td}>{s.level ?? "—"}</td>
                    <td style={td}>{s.time_played_seconds ?? "—"}</td>
                    <td style={td}>{new Date(s.created_at).toLocaleString()}</td>
                    <td style={td}>
                      {getScoreFlags(s.id).map((f) => (
                        <span
                          key={f.id}
                          style={{
                            background: severityColor[f.severity] + "33",
                            color: severityColor[f.severity],
                            border: `1px solid ${severityColor[f.severity]}55`,
                            borderRadius: 3,
                            padding: "1px 5px",
                            marginRight: 4,
                            fontSize: 11,
                          }}
                        >
                          {f.flag_type}
                        </span>
                      ))}
                    </td>
                    <td style={td}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteScore(s.id);
                        }}
                        style={btnStyle("#FF4444", 11)}
                      >
                        REMOVE
                      </button>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isSelected && (
                    <tr key={`${s.id}-detail`}>
                      <td colSpan={7} style={{ padding: "8px 16px", background: "#111", borderBottom: "1px solid #333" }}>
                        <div style={{ display: "flex", gap: 32 }}>
                          <div>
                            <div style={{ color: "#888", fontSize: 11 }}>SOURCE</div>
                            <div>{s.source ?? "—"}</div>
                          </div>
                          {(() => {
                            const a = getAudit(s.id);
                            return a ? (
                              <>
                                <div>
                                  <div style={{ color: "#888", fontSize: 11 }}>SUBMISSION METHOD</div>
                                  <div>{a.submission_method ?? "—"}</div>
                                </div>
                                <div>
                                  <div style={{ color: "#888", fontSize: 11 }}>SESSION TOKEN</div>
                                  <div style={{ color: "#888", fontSize: 11 }}>
                                    {a.session_token ? "[redacted]" : "none"}
                                  </div>
                                </div>
                              </>
                            ) : null;
                          })()}
                          {getScoreFlags(s.id).map((f) => (
                            <div key={f.id}>
                              <div style={{ color: severityColor[f.severity], fontSize: 11 }}>
                                [{f.severity.toUpperCase()}] {f.flag_type}
                              </div>
                              <div style={{ color: "#aaa" }}>{f.reasoning}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {!loading && displayScores.length === 0 && (
        <div style={{ color: "#888", marginTop: 32, textAlign: "center" }}>
          No {filter === "flagged" ? "flagged " : ""}scores found.
        </div>
      )}
    </div>
  );
}

// Helpers
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 8px",
  fontWeight: "normal",
  fontSize: 11,
};

const td: React.CSSProperties = {
  padding: "5px 8px",
};

function btnStyle(bg: string, fontSize = 12): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${bg}`,
    color: bg,
    padding: "3px 10px",
    fontFamily: "monospace",
    fontSize,
    cursor: "pointer",
  };
}

export default AdminMonitor;
