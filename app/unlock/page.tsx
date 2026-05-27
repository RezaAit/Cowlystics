"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

const DB_NAME    = "cowlytics_db";
const DB_VERSION = 2;
const STORE_PREM = "premium";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("usage"))
        db.createObjectStore("usage");
      if (!db.objectStoreNames.contains("history"))
        db.createObjectStore("history", { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_PREM))
        db.createObjectStore(STORE_PREM);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error("DB blocked"));
  });
}

async function openDBSafe(): Promise<IDBDatabase> {
  try {
    return await openDB();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ersion") || (err as any)?.name === "VersionError") {
      await new Promise<void>((res, rej) => {
        const del = indexedDB.deleteDatabase(DB_NAME);
        del.onsuccess = () => res();
        del.onerror   = () => rej(del.error);
      });
      return await openDB();
    }
    throw err;
  }
}

async function savePremium(key: string, expiresOn: string, type: string, mobile: string): Promise<void> {
  const db = await openDBSafe();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PREM, "readwrite");
    tx.objectStore(STORE_PREM).put({ key, expiresOn, type, mobile, activatedAt: new Date().toISOString() }, "license");
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
  });
}

async function getPremium(): Promise<{ key: string; expiresOn: string; type: string; mobile: string; activatedAt: string } | null> {
  const db = await openDBSafe();
  return new Promise((resolve) => {
    const tx  = db.transaction(STORE_PREM, "readonly");
    const req = tx.objectStore(STORE_PREM).get("license");
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => resolve(null);
  });
}

async function clearPremium(): Promise<void> {
  const db = await openDBSafe();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PREM, "readwrite");
    tx.objectStore(STORE_PREM).delete("license");
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKey(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let body = clean.startsWith("COWL") ? clean.slice(4) : clean;
  const groups: string[] = [];
  for (let i = 0; i < body.length && groups.length < 3; i += 4) {
    groups.push(body.slice(i, i + 4));
  }
  return "COWL-" + groups.join("-");
}

function isValidMobile(m: string): boolean {
  // Accept BD numbers: 01XXXXXXXXX (11 digits) or +8801XXXXXXXXX
  return /^(?:\+?88)?01[3-9]\d{8}$/.test(m.replace(/\s/g, ""));
}

const TYPE_LABELS: Record<string, string> = { M: "মাসিক", Y: "বার্ষিক", L: "আজীবন" };

// ─── Component ────────────────────────────────────────────────────────────────

export default function UnlockPage() {
  const [keyInput, setKeyInput]     = useState("COWL-");
  const [mobile, setMobile]         = useState("");
  const [status, setStatus]         = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg]     = useState("");
  const [existing, setExisting]     = useState<{ key: string; expiresOn: string; type: string; mobile: string; activatedAt: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getPremium().then(setExisting).catch(() => {});
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatKey(e.target.value);
    if (formatted.length <= 19) setKeyInput(formatted);
  };

  const handleActivate = async () => {
    const clean = keyInput.replace(/-/g, "").toUpperCase();
    if (clean.length < 16) {
      setErrorMsg("সম্পূর্ণ key লিখুন (COWL-XXXX-XXXX-XXXX)");
      setStatus("error");
      return;
    }
    if (!mobile.trim() || !isValidMobile(mobile)) {
      setErrorMsg("সঠিক মোবাইল নম্বর লিখুন (যেমন 01XXXXXXXXX)");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/verify-key", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ key: keyInput, mobile: mobile.trim() }),
      });

      if (res.status === 404) {
        setStatus("error");
        setErrorMsg("API route পাওয়া যায়নি।");
        return;
      }
      if (res.status === 500) {
        setStatus("error");
        setErrorMsg("Server সমস্যা। .env.local-এ LICENSE_SECRET সেট আছে কিনা দেখুন।");
        return;
      }

      const data = await res.json() as {
        valid: boolean; type?: string; expiresOn?: string; expiryLabel?: string; reason?: string;
      };

      if (data.valid && data.type && data.expiresOn) {
        await savePremium(keyInput, data.expiresOn, data.type, mobile.trim());
        setExisting({ key: keyInput, expiresOn: data.expiresOn, type: data.type, mobile: mobile.trim(), activatedAt: new Date().toISOString() });
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMsg(
          data.reason === "expired"
            ? "এই key-এর মেয়াদ শেষ হয়ে গেছে। নতুন key নিন।"
            : "Key সঠিক নয়। আবার চেক করুন।"
        );
      }
    } catch (err) {
      setStatus("error");
      const msg = (err instanceof Error ? err.message : "");
      if (msg.includes("blocked")) {
        setErrorMsg("অন্য ট্যাব খোলা আছে। সব ট্যাব বন্ধ করে আবার চেষ্টা করুন।");
      } else if (navigator.onLine) {
        setErrorMsg("Server-এ পৌঁছানো যাচ্ছে না।");
      } else {
        setErrorMsg("Internet connection নেই।");
      }
    }
  };

  const handleRevoke = async () => {
    await clearPremium();
    setExisting(null);
    setStatus("idle");
    setKeyInput("COWL-");
    setMobile("");
  };

  const canSubmit = keyInput.replace(/-/g, "").length >= 16 && isValidMobile(mobile) && status !== "loading";

  // ── Already activated view ─────────────────────────────────────────
  if (existing && status !== "success") {
    const isLifetime = existing.expiresOn === "lifetime";
    const isExpired  = !isLifetime && (() => {
      const now   = new Date();
      const nowYM = parseInt(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`, 10);
      const expYM = parseInt(existing.expiresOn.replace("-", ""), 10);
      return nowYM > expYM;
    })();

    return (
      <main style={styles.page}>
        <GlowBg />
        <div style={styles.container}>
          <LogoHeader />
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>{isExpired ? "⏰" : "✅"}</div>
            <h1 style={{ ...styles.title, fontSize: 26 }}>
              {isExpired ? "মেয়াদ শেষ" : "Premium সক্রিয়"}
            </h1>
            {!isExpired && (
              <p style={{ color: "#10B981", fontSize: 14, margin: "4px 0 0" }}>
                আপনার Cowlytics Premium চালু আছে
              </p>
            )}
          </div>
          <div style={styles.infoCard}>
            <InfoRow label="ধরন"       value={TYPE_LABELS[existing.type] ?? existing.type} />
            <InfoRow label="মেয়াদ"     value={isLifetime ? "আজীবন" : existing.expiresOn} accent={isExpired ? "#ef4444" : "#10B981"} />
            <InfoRow label="মোবাইল"    value={existing.mobile ?? "—"} />
            <InfoRow label="সক্রিয়"    value={new Date(existing.activatedAt).toLocaleDateString("bn-BD")} />
            <div style={{ marginTop: 12, padding: "10px 0 0", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <p style={{ fontSize: 11, color: "#4B6070", margin: 0, wordBreak: "break-all" }}>
                🔑 {existing.key}
              </p>
            </div>
          </div>
          {isExpired && (
            <p style={{ fontSize: 13, color: "#ef4444", textAlign: "center", margin: "16px 0" }}>
              আপনার key মেয়াদোত্তীর্ণ। নতুন key সক্রিয় করুন।
            </p>
          )}
          <a href="/" style={{ ...styles.btn, background: "linear-gradient(135deg,#10B981,#059669)", textDecoration: "none", display: "block", textAlign: "center", marginTop: 20, marginBottom: 10 }}>
            🐄 বিশ্লেষণে ফিরে যান
          </a>
          <button onClick={handleRevoke} style={styles.ghostBtn}>
            🗑️ Key সরিয়ে দিন
          </button>
          <AitFooter />
        </div>
      </main>
    );
  }

  // ── Success view ───────────────────────────────────────────────────
  if (status === "success" && existing) {
    return (
      <main style={styles.page}>
        <GlowBg />
        <div style={styles.container}>
          <LogoHeader />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 72, marginBottom: 16, animation: "pop 0.4s ease" }}>🎉</div>
            <style>{`@keyframes pop{0%{transform:scale(0.5)}60%{transform:scale(1.2)}100%{transform:scale(1)}}`}</style>
            <h1 style={{ ...styles.title, fontSize: 28, marginBottom: 8 }}>Premium সক্রিয় হয়েছে!</h1>
            <p style={{ color: "#10B981", fontSize: 15, margin: "0 0 24px" }}>এখন থেকে সীমাহীন বিশ্লেষণ করুন</p>
            <div style={{ ...styles.infoCard, marginBottom: 24 }}>
              <InfoRow label="ধরন"     value={TYPE_LABELS[existing.type] ?? existing.type} />
              <InfoRow label="মেয়াদ"   value={existing.expiresOn === "lifetime" ? "আজীবন" : existing.expiresOn} accent="#10B981" />
              <InfoRow label="মোবাইল"  value={existing.mobile ?? "—"} />
            </div>
            <a href="/" style={{ ...styles.btn, background: "linear-gradient(135deg,#10B981,#059669)", textDecoration: "none", display: "block", textAlign: "center" }}>
              🐄 বিশ্লেষণ শুরু করুন
            </a>
          </div>
          <AitFooter />
        </div>
      </main>
    );
  }

  // ── Main unlock form ───────────────────────────────────────────────
  return (
    <main style={styles.page}>
      <GlowBg />
      <div style={styles.container}>
        <LogoHeader />

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 50, padding: "5px 14px", marginBottom: 14 }}>
            <span style={{ fontSize: 14 }}>🔑</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#10B981", letterSpacing: "0.15em" }}>LICENSE KEY</span>
          </div>
          <h1 style={styles.title}>Premium আনলক করুন</h1>
          <p style={{ color: "#6B7E8A", fontSize: 13, margin: "6px 0 0", lineHeight: 1.6 }}>
            যোগাযোগ করুন <strong style={{ color: "#10B981" }}>01517145678</strong><br />
            Key দিয়ে সীমাহীন বিশ্লেষণ করুন
          </p>
        </div>

        {/* Mobile input */}
        <div style={{ marginBottom: 16 }}>
          <label style={styles.label}>মোবাইল নম্বর</label>
          <input
            type="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="01XXXXXXXXX"
            inputMode="tel"
            style={{
              ...styles.input,
              border: `1px solid ${status === "error" && !isValidMobile(mobile) && mobile ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.12)"}`,
            }}
          />
        </div>

        {/* Key input */}
        <div style={{ marginBottom: 20 }}>
          <label style={styles.label}>License Key</label>
          <input
            ref={inputRef}
            type="text"
            value={keyInput}
            onChange={handleInput}
            placeholder="COWL-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            spellCheck={false}
            style={{
              ...styles.input,
              fontSize: 20,
              fontFamily: "monospace",
              letterSpacing: "0.08em",
              textAlign: "center",
              border: `1px solid ${status === "error" ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.12)"}`,
            }}
          />
          {/* Progress dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
            {[0, 1, 2].map((i) => {
              const groups = keyInput.split("-").slice(1);
              const filled = groups[i]?.length === 4;
              return (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: filled ? "#10B981" : "rgba(255,255,255,0.12)", transition: "background 0.2s" }} />
              );
            })}
          </div>
        </div>

        {/* Error */}
        {status === "error" && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "11px 16px", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <p style={{ fontSize: 13, color: "#ef4444", margin: 0, lineHeight: 1.5 }}>{errorMsg}</p>
          </div>
        )}

        {/* Activate button */}
        <button
          onClick={handleActivate}
          disabled={!canSubmit}
          style={{
            ...styles.btn,
            background: status === "loading" ? "rgba(16,185,129,0.3)" : "linear-gradient(135deg,#10B981,#059669)",
            opacity: canSubmit ? 1 : 0.45,
            cursor: canSubmit ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {status === "loading" ? (
            <>
              <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              যাচাই হচ্ছে...
            </>
          ) : (
            "🚀 Key সক্রিয় করুন"
          )}
        </button>

        {/* How to get key */}
        <div style={{ marginTop: 28, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "16px 18px" }}>
          <p style={{ fontSize: 11, color: "#6B7E8A", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>কীভাবে Key পাবেন?</p>
          {[
            { icon: "💬", text: "WhatsApp বা SMS করুন: 01517145678" },
            { icon: "💳", text: "bKash/Nagad-এ পেমেন্ট করুন" },
            { icon: "📩", text: "Key পাবেন COWL-XXXX-XXXX-XXXX ফরম্যাটে" },
            { icon: "✅", text: "এখানে Enter করুন — তৎক্ষণাৎ সক্রিয় হবে" },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
              <p style={{ fontSize: 13, color: "#A0ADB5", margin: 0, lineHeight: 1.5 }}>{text}</p>
            </div>
          ))}
          <a href="https://wa.me/8801517145678" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, padding: "11px 16px", background: "linear-gradient(135deg,#25D366,#1ebe57)", borderRadius: 12, textDecoration: "none", fontSize: 13, fontWeight: 700, color: "#fff", boxShadow: "0 4px 16px rgba(37,211,102,0.25)" }}>
            <span style={{ fontSize: 18 }}>💬</span>
            WhatsApp: 01517145678
          </a>
        </div>

        <p style={{ fontSize: 10, color: "#3D4D57", textAlign: "center", marginTop: 20, lineHeight: 1.6 }}>
          Key এই ডিভাইসের browser-এ সংরক্ষিত হয়।<br />
          অন্য ডিভাইসে ব্যবহার করতে সেখানেও activate করুন।
        </p>

        <AitFooter />
      </div>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GlowBg() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(16,185,129,0.10) 0%, transparent 60%)", pointerEvents: "none", zIndex: 0 }} />
  );
}

/** Clean header: only logo.png, max-width 512, centered */
function LogoHeader() {
  return (
    <div style={{ textAlign: "center", marginBottom: 32 }}>
      <Image
        src="/logo.png"
        alt="Cowlytics"
        width={512}
        height={120}
        style={{ maxWidth: "100%", height: "auto", objectFit: "contain" }}
        priority
        unoptimized
      />
    </div>
  );
}

function AitFooter() {
  return (
    <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 4 }}>
        <Image src="/ait.png" alt="AIT" width={60} height={20} style={{ height: 20, width: "auto", objectFit: "contain", opacity: 0.6 }} unoptimized />
        <span style={{ fontSize: 10, color: "#3D4D57", fontWeight: 600, letterSpacing: "0.05em" }}>A product of AIT</span>
      </div>
      <p style={{ fontSize: 10, color: "#2D3D47", margin: 0, lineHeight: 1.6 }}>
        Authentic Intelligent Technology<br />
        <a href="https://ait.net.bd" target="_blank" rel="noopener noreferrer" style={{ color: "#10B981", opacity: 0.6, textDecoration: "none" }}>ait.net.bd</a>
      </p>
    </div>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <span style={{ fontSize: 12, color: "#6B7E8A" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: accent ?? "#E8EDF2" }}>{value}</span>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    background: "#050A0E",
    color: "#E8EDF2",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  } as React.CSSProperties,

  container: {
    position:  "relative" as const,
    zIndex:    1,
    maxWidth:  440,
    margin:    "0 auto",
    padding:   "40px 20px 80px",
  } as React.CSSProperties,

  title: {
    fontSize:   30,
    fontWeight: 800,
    margin:     0,
    background: "linear-gradient(135deg, #E8EDF2 0%, #10B981 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  } as React.CSSProperties,

  infoCard: {
    background:   "rgba(16,185,129,0.06)",
    border:       "1px solid rgba(16,185,129,0.2)",
    borderRadius: 16,
    padding:      "16px 18px",
  } as React.CSSProperties,

  label: {
    fontSize: 11,
    color: "#6B7E8A",
    display: "block" as const,
    marginBottom: 8,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
  } as React.CSSProperties,

  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    background: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: "14px 16px",
    color: "#E8EDF2",
    fontSize: 15,
    outline: "none",
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

  ghostBtn: {
    width:        "100%",
    marginTop:    10,
    padding:      "12px",
    borderRadius: 12,
    border:       "1px solid rgba(239,68,68,0.25)",
    background:   "rgba(239,68,68,0.06)",
    color:        "#ef4444",
    fontSize:     13,
    cursor:       "pointer",
  } as React.CSSProperties,
};