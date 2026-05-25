"use client";

import { useState, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EstimateB {
  label:               string;
  base_price_per_kg:   number;
  breed_multiplier:    number;
  beauty_multiplier:   number;
  health_multiplier:   number;
  eid_premium:         number;
  final_price:         number;
  price_range_min:     number;
  price_range_max:     number;
  price_range:         string;
  appearance_detected: string;
  explanation_bn:      string;
}

interface AnalysisResult {
  estimated_weight:       string;
  weight_min:             number;
  weight_max:             number;
  weight_mid:             number;
  weight_note?:           string;
  weight_category:        string;
  breed:                  string;
  body_condition:         string;
  coat_color:             string;
  hump_quality:           string;
  appearance:             string;
  confidence:             string;
  confidence_score:       number;
  confidence_band:        "LOW" | "MEDIUM" | "HIGH";
  meat_yield:             string;
  meat_yield_kg:          number;
  dressing_rate:          number;
  price_range:            string;
  price_min:              number;
  price_max:              number;
  price_per_kg_live:      number;
  cost_per_kg_meat:       number;
  value_verdict?:         string;
  estimate_b?:            EstimateB;
  fraud_risk?:            string;
  fraud_warning?:         string;
  seller_claimed_weight?: number;
  seller_claimed_price?:  number;
  image_count?:           number;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BREED_LABELS: Record<string, string> = {
  "Local":             "দেশি (Local)",
  "Local Cross":       "লোকাল ক্রস",
  "Local Large Cross": "বড় লোকাল ক্রস",
  "Friesian Cross":    "ফ্রিজিয়ান ক্রস",
  "Sahiwal Cross":     "সাহিওয়াল ক্রস",
  "Brahman Cross":     "ব্রাহমান ক্রস",
  "Sindhi Cross":      "সিন্ধি ক্রস",
  "Premium Cross":     "প্রিমিয়াম ক্রস",
  "Unknown Cross":     "মিশ্র জাত",
};

const ANGLE_TIPS = [
  { icon: "↔️", label: "বাম পাশ", desc: "সম্পূর্ণ শরীর দেখা যায়" },
  { icon: "↔️", label: "ডান পাশ", desc: "শরীরের দৈর্ঘ্য বোঝা যায়" },
  { icon: "⬆️", label: "সামনে",   desc: "বুকের গভীরতা বোঝা যায়" },
  { icon: "⬇️", label: "পেছনে",   desc: "হিন্দকোয়ার্টার বোঝা যায়" },
];

const MAX_IMAGES = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror   = reject;
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror   = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  // images: array of { dataUrl, base64 }
  const [images, setImages]             = useState<{ dataUrl: string; base64: string }[]>([]);
  const [loading, setLoading]           = useState(false);
  const [result, setResult]             = useState<AnalysisResult | null>(null);
  const [sellerWeight, setSellerWeight] = useState("");
  const [sellerPrice, setSellerPrice]   = useState("");
  const [dragOver, setDragOver]         = useState(false);
  const [activeTab, setActiveTab]       = useState<"qurbani" | "market">("qurbani");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add images (up to MAX_IMAGES, skip duplicates by name+size)
  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    const toAdd = arr.slice(0, MAX_IMAGES - images.length);
    if (!toAdd.length) return;

    const newImages = await Promise.all(
      toAdd.map(async (f) => ({
        dataUrl: await fileToDataUrl(f),
        base64:  await fileToBase64(f),
      }))
    );
    setImages(prev => [...prev, ...newImages].slice(0, MAX_IMAGES));
    setResult(null);
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
    setResult(null);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = ""; // allow re-selecting same file
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const handleAnalyze = async () => {
    if (!images.length) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images:                images.map(i => i.base64),
          seller_claimed_weight: sellerWeight ? Number(sellerWeight) : undefined,
          seller_claimed_price:  sellerPrice  ? Number(sellerPrice)  : undefined,
        }),
      });
      setResult(await res.json());
    } catch {
      setResult({ error: "বিশ্লেষণ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।" } as any);
    } finally {
      setLoading(false);
    }
  };

  // ─── Derived UI state ────────────────────────────────────────────────────────
  const score = result?.confidence_score ?? 0;
  const confidenceColor = score >= 80 ? "#22c55e" : score >= 70 ? "#f59e0b" : "#ef4444";
  const fraudColor =
    result?.fraud_risk === "HIGH"   ? "#ef4444"
    : result?.fraud_risk === "MEDIUM" ? "#f59e0b"
    : "#22c55e";

  const canAnalyze   = images.length > 0 && !loading;
  const canAddMore   = images.length < MAX_IMAGES;
  const multiImage   = images.length > 1;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <main style={{ minHeight: "100vh", background: "#050A0E", color: "#E8EDF2", fontFamily: "'Segoe UI', system-ui, sans-serif", overflowX: "hidden" }}>

      {/* Ambient glow */}
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(16,185,129,0.12) 0%, transparent 60%)", pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 480, margin: "0 auto", padding: "0 16px 80px" }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <div style={{ textAlign: "center", padding: "36px 0 24px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 50, padding: "6px 16px", marginBottom: 14 }}>
            <span style={{ fontSize: 16 }}>🐄</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#10B981", textTransform: "uppercase" }}>AI Powered</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", background: "linear-gradient(135deg, #E8EDF2 0%, #10B981 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Cowlytics
          </h1>
          <p style={{ color: "#6B7E8A", fontSize: 13, marginTop: 6 }}>গরুর ছবি আপলোড করুন — AI বিশ্লেষণ পান</p>
        </div>

        {/* ── Multi-image recommendation banner ───────────────── */}
        <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>📸</span>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#10B981", margin: 0 }}>
              একাধিক ছবি দিলে AI আরও নির্ভুল ফলাফল দেবে
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {ANGLE_TIPS.map(({ icon, label, desc }) => (
              <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <span style={{ fontSize: 12, marginTop: 1 }}>{icon}</span>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#E8EDF2", margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 10, color: "#6B7E8A", margin: 0 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Seller inputs ────────────────────────────────────── */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <p style={{ fontSize: 11, color: "#6B7E8A", marginBottom: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>বিক্রেতার দাবি (ঐচ্ছিক)</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "দাবিকৃত ওজন (কেজি)", placeholder: "যেমন: ৪৫০", val: sellerWeight, set: setSellerWeight },
              { label: "চাওয়া দাম (টাকা)",   placeholder: "যেমন: ২৫০০০০", val: sellerPrice,  set: setSellerPrice  },
            ].map(({ label, placeholder, val, set }) => (
              <div key={label}>
                <label style={{ fontSize: 11, color: "#6B7E8A", display: "block", marginBottom: 5 }}>{label}</label>
                <input
                  type="number"
                  placeholder={placeholder}
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 11px", color: "#E8EDF2", fontSize: 14, boxSizing: "border-box", outline: "none" }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Upload area ──────────────────────────────────────── */}
        {images.length === 0 ? (
          // Empty state — full drop zone
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `2px dashed ${dragOver ? "#10B981" : "rgba(255,255,255,0.12)"}`, borderRadius: 20, padding: "44px 24px", textAlign: "center", cursor: "pointer", transition: "all 0.2s", background: dragOver ? "rgba(16,185,129,0.05)" : "rgba(255,255,255,0.02)", marginBottom: 14 }}
          >
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26 }}>📷</div>
            <p style={{ color: "#E8EDF2", fontWeight: 600, fontSize: 15, margin: "0 0 6px" }}>গরুর ছবি আপলোড করুন</p>
            <p style={{ color: "#6B7E8A", fontSize: 12, margin: "0 0 10px" }}>ক্লিক করুন অথবা টেনে এনে ছাড়ুন</p>
            <span style={{ fontSize: 11, color: "#10B981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 20, padding: "3px 10px" }}>
              সর্বোচ্চ {MAX_IMAGES}টি ছবি
            </span>
          </div>
        ) : (
          // Preview grid with add more button
          <div style={{ marginBottom: 14 }}>
            {/* Image count badge */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#E8EDF2", fontWeight: 600 }}>
                  {images.length}টি ছবি নির্বাচিত
                </span>
                {multiImage && (
                  <span style={{ fontSize: 10, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981", borderRadius: 20, padding: "2px 8px" }}>
                    ✓ Multi-angle
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, color: "#6B7E8A" }}>{images.length}/{MAX_IMAGES}</span>
            </div>

            {/* Thumbnails */}
            <div style={{ display: "grid", gridTemplateColumns: images.length === 1 ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 10 }}>
              {images.map((img, idx) => (
                <div key={idx} style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", aspectRatio: images.length === 1 ? "16/9" : "4/3" }}>
                  <img
                    src={img.dataUrl}
                    alt={`ছবি ${idx + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  {/* Angle label */}
                  <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(0,0,0,0.65)", borderRadius: 6, padding: "2px 7px", fontSize: 10, color: "#E8EDF2" }}>
                    {ANGLE_TIPS[idx]?.icon} {ANGLE_TIPS[idx]?.label ?? `ছবি ${idx + 1}`}
                  </div>
                  {/* Remove button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                    style={{ position: "absolute", top: 6, right: 6, background: "rgba(239,68,68,0.85)", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", color: "#fff", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Add more slot */}
              {canAddMore && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  style={{ border: `2px dashed ${dragOver ? "#10B981" : "rgba(255,255,255,0.15)"}`, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", aspectRatio: images.length === 0 ? "16/9" : "4/3", background: dragOver ? "rgba(16,185,129,0.05)" : "rgba(255,255,255,0.02)", transition: "all 0.2s", gap: 6, minHeight: 90 }}
                >
                  <span style={{ fontSize: 24, opacity: 0.5 }}>+</span>
                  <p style={{ fontSize: 11, color: "#6B7E8A", margin: 0, textAlign: "center", lineHeight: 1.3 }}>
                    আরও ছবি যোগ করুন<br />
                    <span style={{ color: "#10B981", fontSize: 10 }}>ভালো result পাবেন</span>
                  </p>
                </div>
              )}
            </div>

            {/* Angle coverage indicator */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
              <p style={{ fontSize: 10, color: "#6B7E8A", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>ছবির কভারেজ</p>
              <div style={{ display: "flex", gap: 6 }}>
                {ANGLE_TIPS.map(({ icon, label }, idx) => (
                  <div key={label} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 16, opacity: idx < images.length ? 1 : 0.25 }}>{icon}</div>
                    <p style={{ fontSize: 9, margin: "3px 0 0", color: idx < images.length ? "#10B981" : "#3D4D57" }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Hidden file input — multiple */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={handleFileInput}
        />

        {/* ── Analyze button ───────────────────────────────────── */}
        {images.length > 0 && !loading && (
          <button
            onClick={handleAnalyze}
            style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 700, marginBottom: 16, transition: "all 0.2s", background: multiImage ? "linear-gradient(135deg, #10B981, #059669)" : "rgba(16,185,129,0.7)", color: "#fff", boxShadow: multiImage ? "0 4px 20px rgba(16,185,129,0.3)" : "none" }}
          >
            {multiImage
              ? `🔍 ${images.length}টি ছবি দিয়ে AI বিশ্লেষণ করুন`
              : "🔍 AI বিশ্লেষণ করুন"}
          </button>
        )}

        {/* ── Loading ──────────────────────────────────────────── */}
        {loading && (
          <div style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 16, padding: "26px 24px", textAlign: "center", marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, border: "3px solid rgba(16,185,129,0.2)", borderTopColor: "#10B981", borderRadius: "50%", margin: "0 auto 14px", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <p style={{ color: "#10B981", fontWeight: 600, margin: "0 0 5px", fontSize: 15 }}>
              {images.length > 1 ? `${images.length}টি ছবি বিশ্লেষণ হচ্ছে...` : "AI বিশ্লেষণ চলছে..."}
            </p>
            <p style={{ color: "#6B7E8A", fontSize: 12, margin: 0 }}>ওজন, মাংস ও দাম হিসাব হচ্ছে</p>
          </div>
        )}

        {/* ── Result ──────────────────────────────────────────── */}
        {result && !result.error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Multi-image badge */}
            {(result.image_count ?? 1) > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "8px 14px" }}>
                <span style={{ fontSize: 14 }}>📸</span>
                <p style={{ fontSize: 12, color: "#10B981", margin: 0 }}>
                  {result.image_count}টি ছবি বিশ্লেষণ করে উন্নত ফলাফল তৈরি হয়েছে
                </p>
              </div>
            )}

            {/* Header card */}
            <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 20, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ fontSize: 11, color: "#6B7E8A", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.08em" }}>AI রিপোর্ট</p>
                  <p style={{ fontSize: 19, fontWeight: 700, margin: 0, color: "#E8EDF2" }}>
                    {BREED_LABELS[result.breed] ?? result.breed}
                    {result.appearance === "premium" && <span style={{ marginLeft: 6, fontSize: 14 }}>⭐</span>}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                    <span style={{ fontSize: 11, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", color: "#10B981", borderRadius: 20, padding: "2px 9px" }}>
                      {result.body_condition}
                    </span>
                    {result.coat_color && result.coat_color !== "Unknown" && (
                      <span style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#A0ADB5", borderRadius: 20, padding: "2px 9px" }}>
                        {result.coat_color}
                      </span>
                    )}
                    {result.hump_quality && result.hump_quality !== "small" && (
                      <span style={{ fontSize: 11, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#A78BFA", borderRadius: 20, padding: "2px 9px" }}>
                        🔺 {result.hump_quality === "prominent" ? "বড় কুঁজ" : "মাঝারি কুঁজ"}
                      </span>
                    )}
                  </div>
                  {result.weight_note && (
                    <p style={{ fontSize: 11, color: "#F59E0B", margin: "4px 0 0", fontStyle: "italic" }}>ℹ️ {result.weight_note}</p>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 10, color: "#6B7E8A", margin: "0 0 2px" }}>নির্ভরযোগ্যতা</p>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: 0, color: confidenceColor }}>{result.confidence}</p>
                  <p style={{ fontSize: 10, color: confidenceColor, margin: "2px 0 0" }}>{result.confidence_band}</p>
                </div>
              </div>
              {/* Confidence bar */}
              <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4, marginTop: 12, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${result.confidence_score}%`, background: confidenceColor, borderRadius: 4, transition: "width 1s ease" }} />
              </div>
            </div>

            {/* Weight + Meat */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Weight card with highlight badge */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 16 }}>
                <span style={{ fontSize: 22 }}>⚖️</span>
                <p style={{ fontSize: 10, color: "#6B7E8A", margin: "9px 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>আনুমানিক ওজন</p>
                <p style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px", color: "#E8EDF2" }}>{result.estimated_weight}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {/* Category badge */}
                  <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", color: "#10B981", borderRadius: 20, padding: "2px 8px" }}>
                    {result.weight_category.split(" ")[0]}
                  </span>
                  {/* Appearance badge */}
                  {result.appearance === "premium" && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "#FBBF24", borderRadius: 20, padding: "2px 8px" }}>
                      ⭐ Premium
                    </span>
                  )}
                  {/* Hump quality badge */}
                  {result.hump_quality === "prominent" && (
                    <span style={{ fontSize: 10, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#A78BFA", borderRadius: 20, padding: "2px 8px" }}>
                      কুঁজ ভালো
                    </span>
                  )}
                </div>
              </div>
              <MeatCard meatKg={Math.round(result.meat_yield_kg)} dressingRate={result.dressing_rate} />
            </div>

            {/* Price tabs */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                {([["qurbani", "🕌 কোরবানি হাট"], ["market", "📊 বাজার মূল্য"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    style={{ padding: "12px 8px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === key ? "rgba(16,185,129,0.15)" : "transparent", color: activeTab === key ? "#10B981" : "#6B7E8A", borderBottom: `2px solid ${activeTab === key ? "#10B981" : "transparent"}` }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ padding: "16px 18px" }}>
                {activeTab === "qurbani" && result.estimate_b ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: "#6B7E8A" }}>ন্যায্য মূল্য সীমা</span>
                      <span style={{ fontSize: 17, fontWeight: 700, color: "#E8EDF2" }}>
                        ৳{result.estimate_b.price_range_min.toLocaleString()} – ৳{result.estimate_b.price_range_max.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "10px 0" }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                      <MiniStat label="ভিত্তি মূল্য"  value={`৳${result.estimate_b.base_price_per_kg}/কেজি`} />
                      <MiniStat label="ঈদ প্রিমিয়াম" value={`৳${result.estimate_b.eid_premium.toLocaleString()}`} />
                      <MiniStat label="জাত গুণক"      value={`×${result.estimate_b.breed_multiplier}`} />
                      <MiniStat label="সৌন্দর্য"       value={result.estimate_b.appearance_detected === "premium" ? "⭐ প্রিমিয়াম" : "সাধারণ"} />
                    </div>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "10px 0" }} />
                    <p style={{ fontSize: 12, color: "#6B7E8A", margin: 0, lineHeight: 1.5 }}>{result.estimate_b.explanation_bn}</p>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: "#6B7E8A" }}>ন্যায্য মূল্য সীমা</span>
                      <span style={{ fontSize: 17, fontWeight: 700, color: "#E8EDF2" }}>
                        ৳{result.price_min.toLocaleString()} – ৳{result.price_max.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "10px 0" }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <MiniStat label="লাইভ রেট"       value={`৳${result.price_per_kg_live}/কেজি`} />
                      <MiniStat label="মাংস/কেজি খরচ" value={`৳${result.cost_per_kg_meat}`} color="#F59E0B" />
                    </div>
                    {result.value_verdict && (
                      <>
                        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "10px 0" }} />
                        <p style={{ fontSize: 12, color: "#10B981", margin: 0, fontStyle: "italic" }}>💡 {result.value_verdict}</p>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Fraud check */}
            {result.fraud_risk && (
              <div style={{ background: result.fraud_risk === "HIGH" ? "rgba(239,68,68,0.08)" : result.fraud_risk === "MEDIUM" ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)", border: `1px solid ${result.fraud_risk === "HIGH" ? "rgba(239,68,68,0.3)" : result.fraud_risk === "MEDIUM" ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.3)"}`, borderRadius: 16, padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>{result.fraud_risk === "HIGH" ? "🚨" : result.fraud_risk === "MEDIUM" ? "⚠️" : "✅"}</span>
                  <div>
                    <p style={{ fontSize: 10, color: "#6B7E8A", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.08em" }}>প্রতারণা যাচাই</p>
                    <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: fraudColor }}>
                      {result.fraud_risk === "HIGH" ? "সতর্কতা: সম্ভাব্য প্রতারণা" : result.fraud_risk === "MEDIUM" ? "সামান্য সন্দেহজনক" : "দাবি যৌক্তিক মনে হচ্ছে"}
                    </p>
                  </div>
                </div>
                {result.fraud_warning && <p style={{ fontSize: 12, color: "#A0ADB5", margin: "6px 0 0", lineHeight: 1.5 }}>{result.fraud_warning}</p>}
              </div>
            )}

            {/* Seller vs AI comparison */}
            {result.seller_claimed_weight && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "16px 18px" }}>
                <p style={{ fontSize: 11, color: "#6B7E8A", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>বিক্রেতা vs AI তুলনা</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <CompareRow label="ওজন" seller={`${result.seller_claimed_weight} কেজি`} ai={result.estimated_weight} />
                  {result.seller_claimed_price && (
                    <CompareRow
                      label="দাম"
                      seller={`৳${result.seller_claimed_price.toLocaleString()}`}
                      ai={result.estimate_b
                        ? `৳${result.estimate_b.price_range_min.toLocaleString()}–${result.estimate_b.price_range_max.toLocaleString()}`
                        : `৳${result.price_min.toLocaleString()}–${result.price_max.toLocaleString()}`}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Bargaining tip */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "14px 18px" }}>
              <p style={{ fontSize: 11, color: "#6B7E8A", margin: "0 0 7px", textTransform: "uppercase", letterSpacing: "0.08em" }}>দর কষাকষির পরামর্শ</p>
              <p style={{ fontSize: 12, color: "#A0ADB5", margin: 0, lineHeight: 1.6 }}>
                শুরু করুন{" "}
                <span style={{ color: "#10B981", fontWeight: 600 }}>৳{(result.estimate_b?.price_range_min ?? result.price_min).toLocaleString()}</span>{" "}
                থেকে। সর্বোচ্চ{" "}
                <span style={{ color: "#E8EDF2", fontWeight: 600 }}>৳{(result.estimate_b?.price_range_max ?? result.price_max).toLocaleString()}</span>{" "}
                পর্যন্ত দিতে পারেন। প্রতি কেজি মাংসের প্রকৃত খরচ{" "}
                <span style={{ color: "#F59E0B", fontWeight: 600 }}>৳{result.cost_per_kg_meat}</span>।
              </p>
            </div>

            <p style={{ fontSize: 10, color: "#3D4D57", textAlign: "center", margin: "2px 0 0", lineHeight: 1.5 }}>
              * AI বিশ্লেষণ অনুমান ভিত্তিক। চূড়ান্ত সিদ্ধান্তে বিশেষজ্ঞের পরামর্শ নিন।
            </p>

            {/* Refresh / New Analysis button */}
            <button
              onClick={() => { setResult(null); setImages([]); setSellerWeight(""); setSellerPrice(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              style={{ width: "100%", marginTop: 8, padding: "13px", borderRadius: 14, border: "1px solid rgba(16,185,129,0.3)", cursor: "pointer", fontSize: 14, fontWeight: 700, background: "rgba(16,185,129,0.08)", color: "#10B981", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <span style={{ fontSize: 18 }}>🔄</span> নতুন গরু বিশ্লেষণ করুন
            </button>
          </div>
        )}

        {/* Error */}
        {result?.error && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 16, padding: 20, textAlign: "center" }}>
            <p style={{ color: "#ef4444", margin: 0 }}>{result.error}</p>
          </div>
        )}

      </div>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, sub, accent }: {
  icon: string; label: string; value: string; sub: string; accent: string;
}) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 16 }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <p style={{ fontSize: 10, color: "#6B7E8A", margin: "9px 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: 17, fontWeight: 700, margin: "0 0 3px", color: "#E8EDF2" }}>{value}</p>
      <p style={{ fontSize: 11, color: accent, margin: 0 }}>{sub}</p>
    </div>
  );
}

function MeatCard({ meatKg, dressingRate }: { meatKg: number; dressingRate: number }) {
  const dressingPct = Math.round(dressingRate * 100);
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 16 }}>
      <span style={{ fontSize: 22 }}>🥩</span>
      <p style={{ fontSize: 10, color: "#6B7E8A", margin: "9px 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>মাংস পাবেন</p>
      <p style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px", color: "#E8EDF2" }}>~{meatKg} কেজি</p>
      {/* Dressing rate tag with tooltip-style explanation */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)", color: "#F59E0B", borderRadius: 20, padding: "2px 8px" }}>
          Dressing {dressingPct}%
        </span>
        <span style={{ fontSize: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#6B7E8A", borderRadius: 20, padding: "2px 8px" }}>
          হাড় বাদে
        </span>
      </div>
      {/* Clarification note */}
      <p style={{ fontSize: 10, color: "#4B6070", margin: "7px 0 0", lineHeight: 1.5, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 7 }}>
        ⚠️ Carcass weight "50-60%" দেখলে সেটা হাড়সহ। আমরা দেখাচ্ছি <span style={{ color: "#F59E0B", fontWeight: 600 }}>হাড়-চর্বি বাদে</span> প্রকৃত খাওয়ার মাংস।
      </p>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: "#6B7E8A", margin: "0 0 2px" }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: color ?? "#E8EDF2" }}>{value}</p>
    </div>
  );
}

function CompareRow({ label, seller, ai }: { label: string; seller: string; ai: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 1fr", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ color: "#6B7E8A" }}>{label}</span>
      <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "5px 8px", textAlign: "center", color: "#ef4444", fontWeight: 600 }}>{seller}</div>
      <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: "5px 8px", textAlign: "center", color: "#10B981", fontWeight: 600 }}>{ai}</div>
    </div>
  );
}