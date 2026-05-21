"use client";

import { useState, useRef } from "react";

interface AnalysisResult {
  estimated_weight: string;
  weight_min: number;
  weight_max: number;
  meat_yield: string;
  meat_yield_kg: number;
  price_range: string;
  price_min: number;
  price_max: number;
  price_per_kg_live: number;
  cost_per_kg_meat: number;
  confidence: string;
  breed: string;
  body_condition: string;
  fraud_risk?: string;
  fraud_warning?: string;
  seller_claimed_weight?: number;
  seller_claimed_price?: number;
  value_verdict?: string;
  dressing_rate: number;
  weight_category: string;
  error?: string;
}

export default function Home() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [sellerWeight, setSellerWeight] = useState("");
  const [sellerPrice, setSellerPrice] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(",")[1];
      setPreview(reader.result as string);
      setLoading(true);
      setResult(null);

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: base64,
            seller_claimed_weight: sellerWeight ? Number(sellerWeight) : undefined,
            seller_claimed_price: sellerPrice ? Number(sellerPrice) : undefined,
          }),
        });
        const data = await res.json();
        setResult(data);
      } catch {
        setResult({ error: "বিশ্লেষণ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।" } as any);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const confidenceNum = result
    ? parseInt(result.confidence?.replace("%", "") || "0")
    : 0;

  const confidenceColor =
    confidenceNum >= 75 ? "#22c55e" : confidenceNum >= 55 ? "#f59e0b" : "#ef4444";

  const fraudColor =
    result?.fraud_risk === "HIGH"
      ? "#ef4444"
      : result?.fraud_risk === "MEDIUM"
      ? "#f59e0b"
      : "#22c55e";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050A0E",
        color: "#E8EDF2",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        overflowX: "hidden",
      }}
    >
      {/* Ambient BG */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(16,185,129,0.12) 0%, transparent 60%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 480,
          margin: "0 auto",
          padding: "0 16px 80px",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", padding: "36px 0 28px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: 50,
              padding: "6px 18px",
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 18 }}>🐄</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.15em",
                color: "#10B981",
                textTransform: "uppercase",
              }}
            >
              AI Powered
            </span>
          </div>

          <h1
            style={{
              fontSize: 36,
              fontWeight: 800,
              margin: 0,
              letterSpacing: "-0.02em",
              background: "linear-gradient(135deg, #E8EDF2 0%, #10B981 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Cowlytics
          </h1>
          <p
            style={{
              color: "#6B7E8A",
              fontSize: 14,
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            গরুর ছবি আপলোড করুন — AI বিশ্লেষণ পান
          </p>
        </div>

        {/* Seller Claim Inputs */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: "16px",
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: "#6B7E8A",
              marginBottom: 12,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            বিক্রেতার দাবি (ঐচ্ছিক)
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label
                style={{ fontSize: 12, color: "#6B7E8A", display: "block", marginBottom: 6 }}
              >
                দাবিকৃত ওজন (কেজি)
              </label>
              <input
                type="number"
                placeholder="যেমন: ৪৫০"
                value={sellerWeight}
                onChange={(e) => setSellerWeight(e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: "#E8EDF2",
                  fontSize: 14,
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label
                style={{ fontSize: 12, color: "#6B7E8A", display: "block", marginBottom: 6 }}
              >
                চাওয়া দাম (টাকা)
              </label>
              <input
                type="number"
                placeholder="যেমন: ২৫০০০০"
                value={sellerPrice}
                onChange={(e) => setSellerPrice(e.target.value)}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: "#E8EDF2",
                  fontSize: 14,
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>
          </div>
        </div>

        {/* Upload Box */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "#10B981" : "rgba(255,255,255,0.12)"}`,
            borderRadius: 20,
            padding: preview ? 0 : "48px 24px",
            textAlign: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
            background: dragOver ? "rgba(16,185,129,0.05)" : "rgba(255,255,255,0.02)",
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFile}
          />

          {preview ? (
            <div style={{ position: "relative" }}>
              <img
                src={preview}
                alt="preview"
                style={{ width: "100%", display: "block", maxHeight: 320, objectFit: "cover" }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  right: 12,
                  background: "rgba(0,0,0,0.7)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: 12,
                  color: "#E8EDF2",
                }}
              >
                ছবি পরিবর্তন করুন
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "rgba(16,185,129,0.1)",
                  border: "1px solid rgba(16,185,129,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: 28,
                }}
              >
                📷
              </div>
              <p style={{ color: "#E8EDF2", fontWeight: 600, fontSize: 16, margin: "0 0 8px" }}>
                গরুর ছবি আপলোড করুন
              </p>
              <p style={{ color: "#6B7E8A", fontSize: 13, margin: 0 }}>
                ক্লিক করুন অথবা টেনে এনে ছাড়ুন
              </p>
            </>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div
            style={{
              background: "rgba(16,185,129,0.05)",
              border: "1px solid rgba(16,185,129,0.2)",
              borderRadius: 16,
              padding: "28px 24px",
              textAlign: "center",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                border: "3px solid rgba(16,185,129,0.2)",
                borderTopColor: "#10B981",
                borderRadius: "50%",
                margin: "0 auto 16px",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: "#10B981", fontWeight: 600, margin: "0 0 6px", fontSize: 16 }}>
              AI বিশ্লেষণ চলছে...
            </p>
            <p style={{ color: "#6B7E8A", fontSize: 13, margin: 0 }}>
              গরুর ওজন, মাংস ও দাম হিসাব করা হচ্ছে
            </p>
          </div>
        )}

        {/* Result */}
        {result && !result.error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Header Card */}
            <div
              style={{
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.25)",
                borderRadius: 20,
                padding: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div>
                  <p style={{ fontSize: 12, color: "#6B7E8A", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    AI রিপোর্ট
                  </p>
                  <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#E8EDF2" }}>
                    {result.breed}
                  </p>
                  <p style={{ fontSize: 13, color: "#10B981", margin: "2px 0 0" }}>
                    {result.body_condition} • {result.weight_category}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: "#6B7E8A", margin: "0 0 4px" }}>নির্ভরযোগ্যতা</p>
                  <p style={{ fontSize: 28, fontWeight: 800, margin: 0, color: confidenceColor }}>
                    {result.confidence}
                  </p>
                </div>
              </div>

              {/* Confidence Bar */}
              <div
                style={{
                  height: 4,
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 4,
                  marginTop: 14,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${confidenceNum}%`,
                    background: confidenceColor,
                    borderRadius: 4,
                    transition: "width 1s ease",
                  }}
                />
              </div>
            </div>

            {/* Weight + Meat Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <MetricCard
                icon="⚖️"
                label="আনুমানিক ওজন"
                value={result.estimated_weight}
                sub={`${result.weight_min}–${result.weight_max} কেজি`}
                accent="#10B981"
              />
              <MetricCard
                icon="🥩"
                label="মাংস পাবেন"
                value={`${Math.round(result.meat_yield_kg)} কেজি`}
                sub={`Dressing ${Math.round(result.dressing_rate * 100)}%`}
                accent="#F59E0B"
              />
            </div>

            {/* Price Card */}
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: "18px 20px",
              }}
            >
              <p style={{ fontSize: 12, color: "#6B7E8A", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                মূল্য বিশ্লেষণ
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: "#6B7E8A" }}>ন্যায্য মূল্য সীমা</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#E8EDF2" }}>
                  ৳{result.price_min.toLocaleString()} – ৳{result.price_max.toLocaleString()}
                </span>
              </div>
              <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "10px 0" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <p style={{ fontSize: 11, color: "#6B7E8A", margin: "0 0 3px" }}>লাইভ ওজন রেট</p>
                  <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#E8EDF2" }}>
                    ৳{result.price_per_kg_live}/কেজি
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: "#6B7E8A", margin: "0 0 3px" }}>প্রতি কেজি মাংসের দাম</p>
                  <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#F59E0B" }}>
                    ৳{Math.round(result.cost_per_kg_meat)}/কেজি
                  </p>
                </div>
              </div>
              {result.value_verdict && (
                <>
                  <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "10px 0" }} />
                  <p style={{ fontSize: 13, color: "#10B981", margin: 0, fontStyle: "italic" }}>
                    💡 {result.value_verdict}
                  </p>
                </>
              )}
            </div>

            {/* Fraud Check */}
            {result.fraud_risk && (
              <div
                style={{
                  background:
                    result.fraud_risk === "HIGH"
                      ? "rgba(239,68,68,0.08)"
                      : result.fraud_risk === "MEDIUM"
                      ? "rgba(245,158,11,0.08)"
                      : "rgba(34,197,94,0.08)",
                  border: `1px solid ${
                    result.fraud_risk === "HIGH"
                      ? "rgba(239,68,68,0.3)"
                      : result.fraud_risk === "MEDIUM"
                      ? "rgba(245,158,11,0.3)"
                      : "rgba(34,197,94,0.3)"
                  }`,
                  borderRadius: 16,
                  padding: "16px 20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>
                    {result.fraud_risk === "HIGH" ? "🚨" : result.fraud_risk === "MEDIUM" ? "⚠️" : "✅"}
                  </span>
                  <div>
                    <p
                      style={{
                        fontSize: 12,
                        color: "#6B7E8A",
                        margin: "0 0 2px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      প্রতারণা যাচাই
                    </p>
                    <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: fraudColor }}>
                      {result.fraud_risk === "HIGH"
                        ? "সতর্কতা: সম্ভাব্য প্রতারণা"
                        : result.fraud_risk === "MEDIUM"
                        ? "সামান্য সন্দেহজনক"
                        : "দাবি যৌক্তিক মনে হচ্ছে"}
                    </p>
                  </div>
                </div>
                {result.fraud_warning && (
                  <p style={{ fontSize: 13, color: "#A0ADB5", margin: "8px 0 0", lineHeight: 1.5 }}>
                    {result.fraud_warning}
                  </p>
                )}
              </div>
            )}

            {/* Seller vs AI Comparison */}
            {result.seller_claimed_weight && (
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16,
                  padding: "18px 20px",
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: "#6B7E8A",
                    margin: "0 0 12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  বিক্রেতা vs AI তুলনা
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <CompareRow
                    label="ওজন দাবি"
                    seller={`${result.seller_claimed_weight} কেজি`}
                    ai={result.estimated_weight}
                  />
                  {result.seller_claimed_price && (
                    <CompareRow
                      label="দাম দাবি"
                      seller={`৳${result.seller_claimed_price.toLocaleString()}`}
                      ai={`৳${result.price_min.toLocaleString()}–${result.price_max.toLocaleString()}`}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Bargaining Tip */}
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16,
                padding: "16px 20px",
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  color: "#6B7E8A",
                  margin: "0 0 8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                দর কষাকষির পরামর্শ
              </p>
              <p style={{ fontSize: 13, color: "#A0ADB5", margin: 0, lineHeight: 1.6 }}>
                এই গরুর জন্য{" "}
                <span style={{ color: "#10B981", fontWeight: 600 }}>
                  ৳{result.price_min.toLocaleString()}
                </span>{" "}
                থেকে শুরু করুন। সর্বোচ্চ{" "}
                <span style={{ color: "#E8EDF2", fontWeight: 600 }}>
                  ৳{result.price_max.toLocaleString()}
                </span>{" "}
                পর্যন্ত দিতে পারেন। প্রতি কেজি মাংসের হিসেবে{" "}
                <span style={{ color: "#F59E0B", fontWeight: 600 }}>
                  ৳{Math.round(result.cost_per_kg_meat)}
                </span>{" "}
                পড়বে।
              </p>
            </div>

            {/* Disclaimer */}
            <p style={{ fontSize: 11, color: "#3D4D57", textAlign: "center", margin: "4px 0 0", lineHeight: 1.5 }}>
              * AI বিশ্লেষণ অনুমান ভিত্তিক। চূড়ান্ত সিদ্ধান্তে বিশেষজ্ঞের পরামর্শ নিন।
            </p>
          </div>
        )}

        {result?.error && (
          <div
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 16,
              padding: "20px",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#ef4444", margin: 0 }}>{result.error}</p>
          </div>
        )}
      </div>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: "16px",
      }}
    >
      <span style={{ fontSize: 24 }}>{icon}</span>
      <p style={{ fontSize: 11, color: "#6B7E8A", margin: "10px 0 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </p>
      <p style={{ fontSize: 18, fontWeight: 700, margin: "0 0 3px", color: "#E8EDF2" }}>
        {value}
      </p>
      <p style={{ fontSize: 12, color: accent, margin: 0 }}>{sub}</p>
    </div>
  );
}

function CompareRow({
  label,
  seller,
  ai,
}: {
  label: string;
  seller: string;
  ai: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr 1fr",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
      }}
    >
      <span style={{ color: "#6B7E8A" }}>{label}</span>
      <div
        style={{
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 8,
          padding: "6px 10px",
          textAlign: "center",
          color: "#ef4444",
          fontWeight: 600,
        }}
      >
        {seller}
      </div>
      <div
        style={{
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.2)",
          borderRadius: 8,
          padding: "6px 10px",
          textAlign: "center",
          color: "#10B981",
          fontWeight: 600,
        }}
      >
        {ai}
      </div>
    </div>
  );
}