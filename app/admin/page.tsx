"use client";

import { useState } from "react";

type LicenseType = "M" | "Y" | "L";

interface GeneratedKey {
  key:         string;
  type:        LicenseType;
  expiryLabel: string;
  expiresOn:   string;
}

const TYPE_INFO: Record<LicenseType, { label: string; emoji: string; duration: string; color: string }> = {
  M: { label: "মাসিক",   emoji: "📅", duration: "১ মাস",    color: "#F59E0B" },
  Y: { label: "বার্ষিক", emoji: "📆", duration: "১ বছর",    color: "#10B981" },
  L: { label: "আজীবন",  emoji: "♾️",  duration: "সীমাহীন", color: "#A78BFA" },
};

export default function AdminPage() {
  // ── Auth state ──────────────────────────────────────────────────────
  const [password, setPassword]   = useState("");
  const [authed, setAuthed]       = useState(false);
  const [authError, setAuthError] = useState(false);

  // ── Generate state ──────────────────────────────────────────────────
  const [selType, setSelType]     = useState<LicenseType>("M");
  const [count, setCount]         = useState(1);
  const [loading, setLoading]     = useState(false);
  const [keys, setKeys]           = useState<GeneratedKey[]>([]);
  const [error, setError]         = useState("");
  const [copied, setCopied]       = useState<string | null>(null);

  // ── Login ───────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(false);
    // Verify password by calling generate API with count:1
    // /api/admin/generate-key → correct path under app/api/admin/generate-key/route.ts
    try {
      const res = await fetch("/api/admin/generate-key", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body:    JSON.stringify({ type: "M", count: 1 }),
      });
      if (res.status === 200) {
        // Password correct — pre-load first key batch
        const data = await res.json();
        if (data.keys?.length) setKeys(data.keys);
        setAuthed(true);
      } else if (res.status === 401) {
        setAuthError(true);  // Wrong password
        setPassword("");     // Clear field
      } else if (res.status === 404) {
        // Route not found — likely wrong path in project structure
        alert("API route not found. Check: app/api/admin/generate-key/route.ts exists.");
        setAuthError(true);
      } else {
        setAuthError(true);
      }
    } catch {
      setAuthError(true);
    }
  };

  // ── Generate ────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/admin/generate-key", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body:    JSON.stringify({ type: selType, count }),
      });
      const data = await res.json() as { keys?: GeneratedKey[]; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "সার্ভার সমস্যা");
        if (res.status === 401) setAuthed(false);
      } else {
        setKeys(prev => [...(data.keys ?? []), ...prev]);
      }
    } catch {
      setError("সংযোগ সমস্যা। আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  };

  // ── Copy helpers ────────────────────────────────────────────────────
  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const copyAll = () => {
    const text = keys.map(k =>
      `${k.key}  (${TYPE_INFO[k.type]?.label ?? k.type}, ${k.expiryLabel})`
    ).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied("__all__");
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const whatsappText = (k: GeneratedKey) =>
    `🐄 *Cowlytics Premium Key*\n\nআপনার license key:\n*${k.key}*\n\nধরন: ${TYPE_INFO[k.type]?.label}\nমেয়াদ: ${k.expiryLabel}\n\nActivate করুন:\nhttps://cowly.net.bd/unlock`;

  // ── Login Screen ────────────────────────────────────────────────────
  if (!authed) {
    return (
      <main style={S.page}>
        <GlowBg />
        <div style={{ ...S.container, maxWidth: 380 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🔐</div>
            <h1 style={S.title}>Admin Panel</h1>
            <p style={{ color: "#6B7E8A", fontSize: 13, margin: "6px 0 0" }}>Cowlytics Key Generator</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={S.label}>Admin Password</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setAuthError(false); }}
                placeholder="পাসওয়ার্ড দিন"
                autoFocus
                style={{
                  ...S.input,
                  border: `1px solid ${authError ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.12)"}`,
                }}
              />
              {authError && (
                <p style={{ fontSize: 12, color: "#ef4444", margin: "6px 0 0" }}>❌ পাসওয়ার্ড ভুল</p>
              )}
            </div>
            <button type="submit" style={{ ...S.btn, background: "linear-gradient(135deg,#10B981,#059669)", marginTop: 4 }}>
              প্রবেশ করুন
            </button>
          </form>

          <p style={{ fontSize: 11, color: "#3D4D57", textAlign: "center", marginTop: 24, lineHeight: 1.6 }}>
            এই পেজটি শুধু Admin-এর জন্য।<br />
            ADMIN_PASSWORD Vercel env-এ সেট করুন।
          </p>
        </div>
      </main>
    );
  }

  // ── Main Admin UI ───────────────────────────────────────────────────
  return (
    <main style={S.page}>
      <GlowBg />
      <div style={S.container}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>🐄</span>
              <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "#E8EDF2" }}>Cowlytics Admin</h1>
            </div>
            <p style={{ fontSize: 12, color: "#6B7E8A", margin: 0 }}>License Key Generator</p>
          </div>
          <button
            onClick={() => { setAuthed(false); setPassword(""); setKeys([]); }}
            style={{ fontSize: 12, color: "#6B7E8A", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}
          >
            লগআউট
          </button>
        </div>

        {/* Type selector */}
        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>License ধরন</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {(Object.keys(TYPE_INFO) as LicenseType[]).map((t) => {
              const info    = TYPE_INFO[t];
              const active  = selType === t;
              return (
                <button
                  key={t}
                  onClick={() => setSelType(t)}
                  style={{
                    padding:      "14px 8px",
                    borderRadius: 14,
                    border:       `1px solid ${active ? info.color + "60" : "rgba(255,255,255,0.08)"}`,
                    background:   active ? `${info.color}15` : "rgba(255,255,255,0.03)",
                    cursor:       "pointer",
                    textAlign:    "center",
                    transition:   "all 0.2s",
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{info.emoji}</div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: active ? info.color : "#6B7E8A", margin: "0 0 2px" }}>{info.label}</p>
                  <p style={{ fontSize: 10, color: "#4B6070", margin: 0 }}>{info.duration}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Count selector */}
        <div style={{ marginBottom: 20 }}>
          <label style={S.label}>কতটি Key (সর্বোচ্চ ৫০)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setCount(c => Math.max(1, c - 1))}
              style={{ ...S.counterBtn, opacity: count <= 1 ? 0.3 : 1 }}
            >−</button>
            <div style={{ flex: 1, textAlign: "center", fontSize: 28, fontWeight: 800, color: "#E8EDF2" }}>
              {count}
            </div>
            <button
              onClick={() => setCount(c => Math.min(50, c + 1))}
              style={{ ...S.counterBtn, opacity: count >= 50 ? 0.3 : 1 }}
            >+</button>
          </div>
          {/* Quick count buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
            {[1, 5, 10, 20].map(n => (
              <button
                key={n}
                onClick={() => setCount(n)}
                style={{
                  padding:      "4px 14px",
                  borderRadius: 20,
                  border:       `1px solid ${count === n ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.1)"}`,
                  background:   count === n ? "rgba(16,185,129,0.1)" : "transparent",
                  color:        count === n ? "#10B981" : "#6B7E8A",
                  fontSize:     12,
                  cursor:       "pointer",
                }}
              >
                {n}টি
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 14, padding: "12px 16px", marginBottom: 18 }}>
          <p style={{ fontSize: 13, color: "#A0ADB5", margin: 0 }}>
            <span style={{ color: "#10B981", fontWeight: 700 }}>{count}টি</span>{" "}
            <span style={{ color: TYPE_INFO[selType].color, fontWeight: 700 }}>{TYPE_INFO[selType].label}</span>{" "}
            key তৈরি হবে — মেয়াদ <span style={{ color: "#E8EDF2" }}>{TYPE_INFO[selType].duration}</span>
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
            <p style={{ fontSize: 13, color: "#ef4444", margin: 0 }}>⚠️ {error}</p>
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            ...S.btn,
            background: loading ? "rgba(16,185,129,0.3)" : "linear-gradient(135deg,#10B981,#059669)",
            marginBottom: 28,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {loading ? (
            <>
              <Spinner />
              তৈরি হচ্ছে...
            </>
          ) : (
            `🔑 ${count}টি Key তৈরি করুন`
          )}
        </button>

        {/* Generated keys list */}
        {keys.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#E8EDF2", margin: 0 }}>
                {keys.length}টি Key তৈরি হয়েছে
              </p>
              <button onClick={copyAll} style={S.smallBtn}>
                {copied === "__all__" ? "✅ কপি হয়েছে" : "📋 সব কপি"}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {keys.map((k, i) => {
                const info = TYPE_INFO[k.type];
                return (
                  <div
                    key={k.key + i}
                    style={{
                      background:   "rgba(255,255,255,0.03)",
                      border:       `1px solid ${info.color}30`,
                      borderRadius: 14,
                      padding:      "14px 16px",
                    }}
                  >
                    {/* Key display */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <p style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#E8EDF2", margin: 0, letterSpacing: "0.05em" }}>
                        {k.key}
                      </p>
                      <button
                        onClick={() => copyKey(k.key)}
                        style={{
                          ...S.smallBtn,
                          background:   copied === k.key ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.06)",
                          borderColor:  copied === k.key ? "rgba(16,185,129,0.3)"  : "rgba(255,255,255,0.1)",
                          color:        copied === k.key ? "#10B981" : "#6B7E8A",
                          flexShrink:   0,
                          marginLeft:   10,
                        }}
                      >
                        {copied === k.key ? "✅" : "📋"}
                      </button>
                    </div>

                    {/* Meta */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 12 }}>
                      <Tag color={info.color} text={`${info.emoji} ${info.label}`} />
                      <Tag color="#6B7E8A" text={`⏳ ${k.expiryLabel}`} />
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {/* WhatsApp */}
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(whatsappText(k))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display:      "flex",
                          alignItems:   "center",
                          justifyContent: "center",
                          gap:          6,
                          padding:      "9px 12px",
                          borderRadius: 10,
                          background:   "rgba(37,211,102,0.1)",
                          border:       "1px solid rgba(37,211,102,0.25)",
                          color:        "#25D366",
                          fontSize:     12,
                          fontWeight:   700,
                          textDecoration: "none",
                          cursor:       "pointer",
                        }}
                      >
                        <span style={{ fontSize: 16 }}>💬</span> WhatsApp
                      </a>

                      {/* SMS (generic sms: link) */}
                      <a
                        href={`sms:?body=${encodeURIComponent(`Cowlytics Premium Key: ${k.key}\nActivate: https://cowlytics.com/unlock`)}`}
                        style={{
                          display:      "flex",
                          alignItems:   "center",
                          justifyContent: "center",
                          gap:          6,
                          padding:      "9px 12px",
                          borderRadius: 10,
                          background:   "rgba(59,130,246,0.1)",
                          border:       "1px solid rgba(59,130,246,0.25)",
                          color:        "#60A5FA",
                          fontSize:     12,
                          fontWeight:   700,
                          textDecoration: "none",
                          cursor:       "pointer",
                        }}
                      >
                        <span style={{ fontSize: 16 }}>📱</span> SMS
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Clear list */}
            <button
              onClick={() => setKeys([])}
              style={{ ...S.ghostBtn, marginTop: 16 }}
            >
              🗑️ তালিকা পরিষ্কার করুন
            </button>
          </div>
        )}

        {/* Setup instructions */}
        <div style={{ marginTop: 36, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "16px 18px" }}>
          <p style={{ fontSize: 11, color: "#6B7E8A", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            ⚙️ Vercel Env Setup
          </p>
          {[
            { key: "LICENSE_SECRET", desc: "দীর্ঘ random string (32+ chars) — key sign করতে ব্যবহার হয়" },
            { key: "ADMIN_PASSWORD", desc: "এই admin পেজের password" },
          ].map(({ key: k, desc }) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <p style={{ fontFamily: "monospace", fontSize: 12, color: "#10B981", margin: "0 0 2px", background: "rgba(16,185,129,0.08)", display: "inline-block", padding: "2px 8px", borderRadius: 6 }}>{k}</p>
              <p style={{ fontSize: 11, color: "#4B6070", margin: "3px 0 0" }}>{desc}</p>
            </div>
          ))}
          <p style={{ fontSize: 11, color: "#3D4D57", margin: "10px 0 0", lineHeight: 1.6 }}>
            Vercel Dashboard → Project → Settings → Environment Variables
          </p>
        </div>

        <p style={{ fontSize: 10, color: "#2A3A44", textAlign: "center", marginTop: 20 }}>
          /admin — শুধু Admin-এর জন্য · Cowlytics
        </p>
      </div>
    </main>
  );
}

// ─── Tiny sub-components ──────────────────────────────────────────────────────

function GlowBg() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(16,185,129,0.10) 0%, transparent 60%)", pointerEvents: "none", zIndex: 0 }} />
  );
}

function Tag({ color, text }: { color: string; text: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: `${color}18`, border: `1px solid ${color}40`, color, borderRadius: 20, padding: "2px 9px" }}>
      {text}
    </span>
  );
}

function Spinner() {
  return (
    <>
      <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.25)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight:   "100vh",
    background:  "#050A0E",
    color:       "#E8EDF2",
    fontFamily:  "'Segoe UI', system-ui, sans-serif",
    overflowX:   "hidden",
  } as React.CSSProperties,

  container: {
    position: "relative" as const,
    zIndex:   1,
    maxWidth: 480,
    margin:   "0 auto",
    padding:  "36px 20px 80px",
  } as React.CSSProperties,

  title: {
    fontSize:   28,
    fontWeight: 800,
    margin:     0,
    background: "linear-gradient(135deg, #E8EDF2 0%, #10B981 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor:  "transparent",
  } as React.CSSProperties,

  label: {
    fontSize:      11,
    color:         "#6B7E8A",
    display:       "block",
    marginBottom:  8,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  } as React.CSSProperties,

  input: {
    width:        "100%",
    boxSizing:    "border-box",
    background:   "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding:      "13px 16px",
    color:        "#E8EDF2",
    fontSize:     15,
    outline:      "none",
  } as React.CSSProperties,

  btn: {
    width:        "100%",
    padding:      "15px",
    borderRadius: 14,
    border:       "none",
    cursor:       "pointer",
    fontSize:     15,
    fontWeight:   700,
    color:        "#fff",
    boxShadow:    "0 4px 20px rgba(16,185,129,0.25)",
    boxSizing:    "border-box" as const,
  } as React.CSSProperties,

  smallBtn: {
    fontSize:     12,
    fontWeight:   600,
    padding:      "5px 12px",
    borderRadius: 20,
    border:       "1px solid rgba(255,255,255,0.1)",
    background:   "rgba(255,255,255,0.06)",
    color:        "#6B7E8A",
    cursor:       "pointer",
    whiteSpace:   "nowrap",
  } as React.CSSProperties,

  ghostBtn: {
    width:        "100%",
    padding:      "11px",
    borderRadius: 12,
    border:       "1px solid rgba(239,68,68,0.2)",
    background:   "rgba(239,68,68,0.05)",
    color:        "#ef4444",
    fontSize:     13,
    cursor:       "pointer",
  } as React.CSSProperties,

  counterBtn: {
    width:        48,
    height:       48,
    borderRadius: 12,
    border:       "1px solid rgba(255,255,255,0.1)",
    background:   "rgba(255,255,255,0.05)",
    color:        "#E8EDF2",
    fontSize:     24,
    cursor:       "pointer",
    display:      "flex",
    alignItems:   "center",
    justifyContent: "center",
    flexShrink:   0,
  } as React.CSSProperties,
};