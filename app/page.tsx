"use client";

import { useState, useRef, useEffect, useCallback } from "react";

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

interface HistoryEntry {
  id:        string;
  date:      string;       // ISO string
  thumbUrl:  string;       // first image data URL (stored compressed)
  breed:     string;
  weightMid: number;
  priceMin:  number;
  priceMax:  number;
  result:    AnalysisResult;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FREE_LIMIT    = 3;
const DB_NAME       = "cowlytics_db";
const DB_VERSION    = 2;           // bumped: adds "premium" store
const STORE_USAGE   = "usage";
const STORE_HISTORY = "history";
const STORE_PREM    = "premium";

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

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_USAGE))
        db.createObjectStore(STORE_USAGE);
      if (!db.objectStoreNames.contains(STORE_HISTORY))
        db.createObjectStore(STORE_HISTORY, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_PREM))
        db.createObjectStore(STORE_PREM);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error("DB blocked"));
  });
}

// Safe openDB: if VersionError (old DB at lower version), delete and recreate
async function openDBSafe(): Promise<IDBDatabase> {
  try {
    return await openDB();
  } catch (err) {
    const name = (err as any)?.name ?? "";
    const msg  = err instanceof Error ? err.message : String(err);
    if (name === "VersionError" || msg.includes("ersion")) {
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

async function getUsageCount(): Promise<number> {
  const db  = await openDBSafe();
  return new Promise((resolve) => {
    const tx  = db.transaction(STORE_USAGE, "readonly");
    const req = tx.objectStore(STORE_USAGE).get("count");
    req.onsuccess = () => resolve(req.result ?? 0);
    req.onerror   = () => resolve(0);
  });
}

async function incrementUsage(): Promise<number> {
  const db    = await openDBSafe();
  const count = await getUsageCount();
  const next  = count + 1;
  return new Promise((resolve) => {
    const tx  = db.transaction(STORE_USAGE, "readwrite");
    tx.objectStore(STORE_USAGE).put(next, "count");
    tx.oncomplete = () => resolve(next);
    tx.onerror    = () => resolve(next);
  });
}

async function resetUsage(): Promise<void> {
  const db = await openDBSafe();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_USAGE, "readwrite");
    tx.objectStore(STORE_USAGE).put(0, "count");
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
  });
}

async function saveHistory(entry: HistoryEntry): Promise<void> {
  const db = await openDBSafe();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_HISTORY, "readwrite");
    tx.objectStore(STORE_HISTORY).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
  });
}

async function getHistory(): Promise<HistoryEntry[]> {
  const db = await openDBSafe();
  return new Promise((resolve) => {
    const tx  = db.transaction(STORE_HISTORY, "readonly");
    const req = tx.objectStore(STORE_HISTORY).getAll();
    req.onsuccess = () => {
      const all = (req.result as HistoryEntry[]).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      resolve(all);
    };
    req.onerror = () => resolve([]);
  });
}

async function clearHistory(): Promise<void> {
  const db = await openDBSafe();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_HISTORY, "readwrite");
    tx.objectStore(STORE_HISTORY).clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
  });
}

// ── Premium license check ──────────────────────────────────────────────
async function getPremiumStatus(): Promise<{ active: boolean; type?: string; expiresOn?: string }> {
  try {
    const db = await openDBSafe();
    const license: { key: string; expiresOn: string; type: string } | undefined = await new Promise((resolve) => {
      const tx  = db.transaction(STORE_PREM, "readonly");
      const req = tx.objectStore(STORE_PREM).get("license");
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => resolve(undefined);
    });
    if (!license) return { active: false };
    // Check expiry locally (month-level)
    if (license.expiresOn !== "lifetime") {
      const now     = new Date();
      const nowYM   = parseInt(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`, 10);
      const expYM   = parseInt(license.expiresOn.replace("-", ""), 10);
      if (nowYM > expYM) return { active: false };
    }
    return { active: true, type: license.type, expiresOn: license.expiresOn };
  } catch {
    return { active: false };
  }
}

// Compress image data URL to thumbnail (~80px wide, JPEG quality 0.5)
function compressThumb(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale  = 80 / img.width;
      canvas.width  = 80;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.5));
    };
    img.onerror = () => resolve(dataUrl.slice(0, 200)); // fallback
    img.src = dataUrl;
  });
}

// ─── File helpers ─────────────────────────────────────────────────────────────

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

// ─── Facebook Share Card Canvas ───────────────────────────────────────────────
// Draws a branded 1200×630 card and triggers download

// Helper: load an image from a URL/dataUrl into HTMLImageElement
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function downloadShareCard(result: AnalysisResult, cattleDataUrl: string): Promise<void> {
  const W = 1200, H = 630;
  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── Background ────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#050A0E");
  bg.addColorStop(1, "#0A1A12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle green glow top-right
  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, 600);
  glow.addColorStop(0, "rgba(16,185,129,0.12)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── LEFT PANEL — cattle photo (contain-fit, full animal) ──────────
  const panelX = 36, panelY = 36;
  const panelW = 530, panelH = H - 72;

  // Card bg
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 18);
  ctx.fill();

  try {
    const cowImg = await loadImage(cattleDataUrl);
    // CONTAIN: whole animal fits, no cropping
    const scale = Math.min((panelW - 20) / cowImg.width, (panelH - 20) / cowImg.height);
    const dw = cowImg.width  * scale;
    const dh = cowImg.height * scale;
    const dx = panelX + (panelW - dw) / 2;
    const dy = panelY + (panelH - dh) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 18);
    ctx.clip();
    ctx.drawImage(cowImg, dx, dy, dw, dh);
    ctx.restore();
  } catch { /* dark panel fallback */ }

  // Panel border
  ctx.strokeStyle = "rgba(16,185,129,0.3)";
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 18);
  ctx.stroke();

  // ── RIGHT PANEL ───────────────────────────────────────────────────
  const rx = 598;
  const rw = W - rx - 36;
  let   ry = 42;

  // ── HEADER: logo.png (compact icon, 48px tall) ────────────────────
  let logoLoaded = false;
  try {
    const logoImg = await loadImage("/logo.png");
    const lh      = 48;
    const lw      = (logoImg.width / logoImg.height) * lh;
    ctx.drawImage(logoImg, rx, ry, lw, lh);
    logoLoaded = true;
    ry += lh + 8;
  } catch { /* fallback below */ }

  if (!logoLoaded) {
    ctx.font      = "bold 28px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = "#10B981";
    ctx.textAlign = "left";
    ctx.fillText("🐄 Cowlytics", rx, ry + 24);
    ry += 36;
  }

  // Tagline
  ctx.font      = "12px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#3D5060";
  ctx.textAlign = "left";
  ctx.fillText("Qurbani Cattle AI Analyzer · cowlytics.com", rx, ry);
  ry += 18;

  // Divider
  ctx.fillStyle = "rgba(16,185,129,0.2)";
  ctx.fillRect(rx, ry, rw, 1);
  ry += 16;

  // ── Breed + Premium ───────────────────────────────────────────────
  const breedText = BREED_LABELS[result.breed] ?? result.breed;
  ctx.font      = "bold 20px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#B0C4CF";
  ctx.textAlign = "left";
  ctx.fillText(breedText, rx, ry);
  if (result.appearance === "premium") {
    const bw = ctx.measureText(breedText).width;
    ctx.font      = "bold 14px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = "#FBBF24";
    ctx.fillText("  ⭐ Premium", rx + bw, ry);
  }
  ry += 16;

  // Body condition
  ctx.font      = "13px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#10B981";
  ctx.fillText(`● ${result.body_condition}`, rx, ry);
  ry += 20;

  // ── Weight hero ───────────────────────────────────────────────────
  ctx.font = "bold 58px 'Segoe UI', Arial, sans-serif";
  const wGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
  wGrad.addColorStop(0, "#FFFFFF");
  wGrad.addColorStop(1, "#10B981");
  ctx.fillStyle = wGrad;
  ctx.fillText(result.estimated_weight, rx, ry + 50);
  ry += 60;

  ctx.font      = "13px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#4B6070";
  ctx.fillText("আনুমানিক ওজন", rx, ry);
  ry += 20;

  // Divider
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(rx, ry, rw, 1);
  ry += 14;

  // ── Meat ──────────────────────────────────────────────────────────
  ctx.font      = "bold 24px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#F59E0B";
  ctx.fillText(`🥩  ~${Math.round(result.meat_yield_kg)} কেজি মাংস`, rx, ry);
  ry += 18;
  ctx.font      = "11px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#3D5060";
  ctx.fillText(`হাড়-চর্বি বাদে · Dressing ${Math.round(result.dressing_rate * 100)}%`, rx, ry);
  ry += 18;

  // Divider
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(rx, ry, rw, 1);
  ry += 14;

  // ── Price ─────────────────────────────────────────────────────────
  const pMin    = (result.estimate_b?.price_range_min ?? result.price_min).toLocaleString();
  const pMax    = (result.estimate_b?.price_range_max ?? result.price_max).toLocaleString();
  const priceStr = `৳${pMin} – ৳${pMax}`;
  ctx.font      = "bold 28px 'Segoe UI', Arial, sans-serif";
  // shrink if too wide
  if (ctx.measureText(priceStr).width > rw) ctx.font = "bold 22px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#10B981";
  ctx.fillText(priceStr, rx, ry);
  ry += 16;
  ctx.font      = "11px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#3D5060";
  ctx.fillText("কোরবানি হাটের ন্যায্য মূল্য সীমা", rx, ry);
  ry += 22;

  // ── Confidence — text only (no bar) ──────────────────────────────
  const confColor = result.confidence_score >= 80 ? "#22c55e"
    : result.confidence_score >= 70 ? "#f59e0b" : "#ef4444";
  ctx.font      = "bold 14px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = confColor;
  ctx.fillText(`AI নির্ভরযোগ্যতা: ${result.confidence}`, rx, ry);
  ry += 22;

  // ── Thin confidence bar (contained to rw) ────────────────────────
  const barH = 5;
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath(); ctx.roundRect(rx, ry, rw, barH, 3); ctx.fill();
  ctx.fillStyle = confColor;
  ctx.beginPath(); ctx.roundRect(rx, ry, rw * (result.confidence_score / 100), barH, 3); ctx.fill();
  ry += barH + 16;

  // ── Disclaimer (right panel, above watermark) ─────────────────────
  ctx.font      = "10px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = "#2A3A44";
  ctx.fillText("* AI অনুমান ভিত্তিক। চূড়ান্ত সিদ্ধান্তে বিশেষজ্ঞের পরামর্শ নিন।", rx, H - 56);

  // ── Bottom watermark: cowly.png (right side, 100px tall) ──────────
  try {
    const cowlyImg = await loadImage("/cowly.png");
    const wh       = 100;
    const ww       = (cowlyImg.width / cowlyImg.height) * wh;
    ctx.globalAlpha = 0.75;
    ctx.drawImage(cowlyImg, W - ww - 30, H - wh - 20, ww, wh);
    ctx.globalAlpha = 1;
  } catch {
    // fallback text watermark
    ctx.font      = "bold 12px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = "rgba(16,185,129,0.35)";
    ctx.textAlign = "right";
    ctx.fillText("cowlytics.com", W - 28, H - 24);
    ctx.textAlign = "left";
  }

  // ── Download ──────────────────────────────────────────────────────
  const link    = document.createElement("a");
  link.download = `cowlytics-${Date.now()}.jpg`;
  link.href     = canvas.toDataURL("image/jpeg", 0.93);
  link.click();
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const [images, setImages]             = useState<{ dataUrl: string; base64: string }[]>([]);
  const [loading, setLoading]           = useState(false);
  const [result, setResult]             = useState<AnalysisResult | null>(null);
  const [sellerWeight, setSellerWeight] = useState("");
  const [sellerPrice, setSellerPrice]   = useState("");
  const [dragOver, setDragOver]         = useState(false);
  const [activeTab, setActiveTab]       = useState<"qurbani" | "market">("qurbani");

  // Usage / paywall
  const [usageCount, setUsageCount]     = useState(0);
  const [showPaywall, setShowPaywall]   = useState(false);
  const [isPremium, setIsPremium]       = useState(false);

  // History
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory]   = useState(false);

  // Share
  const [shareLoading, setShareLoading] = useState(false);

  const fileInputRef    = useRef<HTMLInputElement>(null);  // camera
  const galleryInputRef = useRef<HTMLInputElement>(null);  // gallery/multiple

  // Load usage count, premium status & history on mount
  useEffect(() => {
    getUsageCount().then(setUsageCount).catch(() => {});
    getHistory().then(setHistory).catch(() => {});
    getPremiumStatus().then(s => setIsPremium(s.active)).catch(() => {});
  }, []);

  const refreshHistory = useCallback(async () => {
    const h = await getHistory().catch(() => [] as HistoryEntry[]);
    setHistory(h);
  }, []);

  // Add images
  const addFiles = async (files: FileList | File[]) => {
    const arr   = Array.from(files).filter(f => f.type.startsWith("image/"));
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
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const handleAnalyze = async () => {
    if (!images.length) return;

    // Premium users bypass the free limit
    const premStatus = await getPremiumStatus().catch(() => ({ active: false }));
    if (!premStatus.active) {
      const currentCount = await getUsageCount().catch(() => 0);
      if (currentCount >= FREE_LIMIT) {
        setShowPaywall(true);
        return;
      }
    }

    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch("/api/analyze", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          images:                images.map(i => i.base64),
          seller_claimed_weight: sellerWeight ? Number(sellerWeight) : undefined,
          seller_claimed_price:  sellerPrice  ? Number(sellerPrice)  : undefined,
        }),
      });
      const data: AnalysisResult = await res.json();
      setResult(data);

      if (!data.error) {
        // Increment usage
        const newCount = await incrementUsage();
        setUsageCount(newCount);

        // Save to history
        const thumb = await compressThumb(images[0].dataUrl).catch(() => "");
        const entry: HistoryEntry = {
          id:        `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          date:      new Date().toISOString(),
          thumbUrl:  thumb,
          breed:     data.breed,
          weightMid: data.weight_mid,
          priceMin:  data.estimate_b?.price_range_min ?? data.price_min,
          priceMax:  data.estimate_b?.price_range_max ?? data.price_max,
          result:    data,
        };
        await saveHistory(entry).catch(() => {});
        await refreshHistory();
      }
    } catch {
      setResult({ error: "বিশ্লেষণ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।" } as AnalysisResult);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!result || !images[0]) return;
    setShareLoading(true);
    try {
      // Step 1: Download the share card image
      await downloadShareCard(result, images[0].dataUrl);

      // Step 2: Small delay so download starts, then open Facebook share dialog
      await new Promise(r => setTimeout(r, 800));

      // Build a descriptive share text
      const breed     = BREED_LABELS[result.breed] ?? result.breed;
      const priceMin  = (result.estimate_b?.price_range_min ?? result.price_min).toLocaleString();
      const priceMax  = (result.estimate_b?.price_range_max ?? result.price_max).toLocaleString();
      const meatKg    = Math.round(result.meat_yield_kg);
      const shareText = `🐄 Cowlytics AI বিশ্লেষণ\n\nজাত: ${breed}\nওজন: ${result.estimated_weight}\nমাংস: ~${meatKg} কেজি\nমূল্য: ৳${priceMin} – ৳${priceMax}\n\nগরু কিনুন বুঝে-শুনে 👇`;
      const shareUrl  = "https://cowlytics.com"; // আপনার real URL

      // Facebook sharer — opens in popup
      const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
      window.open(fbUrl, "_blank", "width=600,height=500,scrollbars=yes");

    } catch {
      alert("শেয়ার কার্ড তৈরি হয়নি। আবার চেষ্টা করুন।");
    } finally {
      setShareLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setImages([]);
    setSellerWeight("");
    setSellerPrice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ─── Derived UI state ────────────────────────────────────────────────────────
  const score          = result?.confidence_score ?? 0;
  const confidenceColor = score >= 80 ? "#22c55e" : score >= 70 ? "#f59e0b" : "#ef4444";
  const fraudColor     =
    result?.fraud_risk === "HIGH"   ? "#ef4444"
    : result?.fraud_risk === "MEDIUM" ? "#f59e0b"
    : "#22c55e";

  const canAnalyze = images.length > 0 && !loading;
  const canAddMore = images.length < MAX_IMAGES;
  const multiImage = images.length > 1;
  // Premium users have no limit
  const usageLeft  = isPremium ? Infinity : Math.max(0, FREE_LIMIT - usageCount);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <main style={{ minHeight: "100vh", background: "#050A0E", color: "#E8EDF2", fontFamily: "'Segoe UI', system-ui, sans-serif", overflowX: "hidden" }}>

      {/* Ambient glow */}
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(16,185,129,0.12) 0%, transparent 60%)", pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 480, margin: "0 auto", padding: "0 16px 80px" }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <div style={{ textAlign: "center", padding: "36px 0 20px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 50, padding: "6px 16px", marginBottom: 14 }}>
            <span style={{ fontSize: 16 }}>🐄</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#10B981", textTransform: "uppercase" }}>AI Powered</span>
          </div>
          <div style={{marginBottom: "-50px"}}>
             <img src="logo.png" style={{ width: "100%", height: "100%", display: "block" }} />
          </div>         
          <h1 style={{ fontSize: 36, fontWeight: 800, margin: "0 0 2px", letterSpacing: "-0.02em", background: "linear-gradient(135deg, #E8EDF2 0%, #10B981 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Cowlytics
          </h1>
          <p style={{ color: "#4B6070", fontSize: 11, margin: "0 0 6px", letterSpacing: "0.04em" }}>গরু কিনুন বুঝে-শুনে</p>
          <p style={{ color: "#6B7E8A", fontSize: 13, marginTop: 0 }}>গরুর ছবি আপলোড করুন — AI বিশ্লেষণ দেখুন!</p>

          {/* History button */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12 }}>
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(true)}
                style={{ fontSize: 12, fontWeight: 600, color: "#10B981", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}
              >
                📋 পূর্ববর্তী বিশ্লেষণ ({history.length})
              </button>
            )}
          </div>
        </div>

        {/* ── Usage indicator ──────────────────────────────────── */}
        <div style={{ background: isPremium ? "rgba(167,139,250,0.08)" : usageLeft === 0 ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.06)", border: `1px solid ${isPremium ? "rgba(167,139,250,0.3)" : usageLeft === 0 ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.2)"}`, borderRadius: 12, padding: "10px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: isPremium ? "#A78BFA" : usageLeft === 0 ? "#ef4444" : "#10B981", margin: 0 }}>
                {isPremium
                  ? "♾️ Premium — সীমাহীন বিশ্লেষণ"
                  : usageLeft === 0
                    ? "🔒 ফ্রি লিমিট শেষ"
                    : `🆓 ${usageLeft}টি বিনামূল্যে বিশ্লেষণ বাকি`}
              </p>
              <p style={{ fontSize: 11, color: "#6B7E8A", margin: "2px 0 0" }}>
                {isPremium
                  ? <><a href="/unlock" style={{ color: "#A78BFA", textDecoration: "none" }}>Key পরিচালনা করুন</a></>
                  : usageLeft === 0
                    ? "Key দিয়ে আনলক করুন অথবা নতুন ব্রাউজার"
                    : `মোট ${FREE_LIMIT}টির মধ্যে ${usageCount}টি ব্যবহার হয়েছে`}
              </p>
            </div>
            {/* Right side */}
            {isPremium && <span style={{ fontSize: 20 }}>♾️</span>}
            {!isPremium && usageLeft === 0 && (
              <a
                href="/unlock"
                style={{ flexShrink: 0, marginLeft: 12, padding: "7px 14px", borderRadius: 20, background: "linear-gradient(135deg,#7C3AED,#6D28D9)", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", boxShadow: "0 2px 10px rgba(124,58,237,0.4)" }}
              >
                🔑 আনলক করুন
              </a>
            )}
            {!isPremium && usageLeft > 0 && (
              <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                {Array.from({ length: FREE_LIMIT }).map((_, i) => (
                  <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < usageCount ? "#10B981" : "rgba(255,255,255,0.12)" }} />
                ))}
              </div>
            )}
          </div>
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
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{ border: `2px dashed ${dragOver ? "#10B981" : "rgba(255,255,255,0.12)"}`, borderRadius: 20, padding: "32px 24px 24px", textAlign: "center", transition: "all 0.2s", background: dragOver ? "rgba(16,185,129,0.05)" : "rgba(255,255,255,0.02)", marginBottom: 14 }}
          >
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26 }}>📷</div>
            <p style={{ color: "#E8EDF2", fontWeight: 600, fontSize: 15, margin: "0 0 6px" }}>গরুর ছবি আপলোড করুন</p>
            <p style={{ color: "#6B7E8A", fontSize: 12, margin: "0 0 18px" }}>ক্যামেরা দিয়ে তুলুন অথবা গ্যালারি থেকে বেছে নিন</p>

            {/* Two buttons: Camera + Gallery */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: "12px 8px", borderRadius: 12, border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.1)", color: "#10B981", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                <span style={{ fontSize: 20 }}>📸</span> ক্যামেরা
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                style={{ padding: "12px 8px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#A0ADB5", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                <span style={{ fontSize: 20 }}>🖼️</span> গ্যালারি
              </button>
            </div>

            <span style={{ fontSize: 11, color: "#10B981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 20, padding: "3px 10px" }}>
              সর্বোচ্চ {MAX_IMAGES}টি ছবি
            </span>
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#E8EDF2", fontWeight: 600 }}>{images.length}টি ছবি নির্বাচিত</span>
                {multiImage && (
                  <span style={{ fontSize: 10, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981", borderRadius: 20, padding: "2px 8px" }}>✓ Multi-angle</span>
                )}
              </div>
              <span style={{ fontSize: 11, color: "#6B7E8A" }}>{images.length}/{MAX_IMAGES}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: images.length === 1 ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 10 }}>
              {images.map((img, idx) => (
                <div key={idx} style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", aspectRatio: images.length === 1 ? "16/9" : "4/3" }}>
                  <img src={img.dataUrl} alt={`ছবি ${idx + 1}`} style={{ width: "100%", height: "100%", display: "block" }} />
                  <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(0,0,0,0.65)", borderRadius: 6, padding: "2px 7px", fontSize: 10, color: "#E8EDF2" }}>
                    {ANGLE_TIPS[idx]?.icon} {ANGLE_TIPS[idx]?.label ?? `ছবি ${idx + 1}`}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                    style={{ position: "absolute", top: 6, right: 6, background: "rgba(239,68,68,0.85)", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", color: "#fff", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
              {canAddMore && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  style={{ border: `2px dashed ${dragOver ? "#10B981" : "rgba(255,255,255,0.15)"}`, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", aspectRatio: images.length === 0 ? "16/9" : "4/3", background: dragOver ? "rgba(16,185,129,0.05)" : "rgba(255,255,255,0.02)", transition: "all 0.2s", gap: 8, minHeight: 90, padding: 10 }}
                >
                  <p style={{ fontSize: 11, color: "#6B7E8A", margin: 0, textAlign: "center", lineHeight: 1.3 }}>
                    আরও ছবি<br /><span style={{ color: "#10B981", fontSize: 10 }}>ভালো result পাবেন</span>
                  </p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.1)", color: "#10B981", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                    >📸 ক্যামেরা</button>
                    <button
                      onClick={() => galleryInputRef.current?.click()}
                      style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#A0ADB5", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                    >🖼️ গ্যালারি</button>
                  </div>
                </div>
              )}
            </div>

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

        {/* Hidden file inputs — two separate: camera (no multiple) + gallery (multiple) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={handleFileInput}
        />
        <input
          ref={galleryInputRef}
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
            disabled={usageLeft === 0}
            style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", cursor: usageLeft === 0 ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 700, marginBottom: 16, transition: "all 0.2s", background: usageLeft === 0 ? "rgba(239,68,68,0.2)" : multiImage ? "linear-gradient(135deg, #10B981, #059669)" : "rgba(16,185,129,0.7)", color: usageLeft === 0 ? "#ef4444" : "#fff", boxShadow: multiImage && usageLeft > 0 ? "0 4px 20px rgba(16,185,129,0.3)" : "none", opacity: usageLeft === 0 ? 0.7 : 1 }}
          >
            {usageLeft === 0
              ? "🔒 ফ্রি লিমিট শেষ — আনলক করুন"
              : multiImage
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

            {(result.image_count ?? 1) > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "8px 14px" }}>
                <span style={{ fontSize: 14 }}>📸</span>
                <p style={{ fontSize: 12, color: "#10B981", margin: 0 }}>{result.image_count}টি ছবি বিশ্লেষণ করে উন্নত ফলাফল তৈরি হয়েছে</p>
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
                    <span style={{ fontSize: 11, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", color: "#10B981", borderRadius: 20, padding: "2px 9px" }}>{result.body_condition}</span>
                    {result.coat_color && result.coat_color !== "Unknown" && result.coat_color !== "unknown" && (
                      <span style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#A0ADB5", borderRadius: 20, padding: "2px 9px" }}>{result.coat_color}</span>
                    )}
                    {result.hump_quality && result.hump_quality !== "small" && (
                      <span style={{ fontSize: 11, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#A78BFA", borderRadius: 20, padding: "2px 9px" }}>🔺 {result.hump_quality === "prominent" ? "বড় কুঁজ" : "মাঝারি কুঁজ"}</span>
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
              <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4, marginTop: 12, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${result.confidence_score}%`, background: confidenceColor, borderRadius: 4, transition: "width 1s ease" }} />
              </div>
            </div>

            {/* Weight + Meat */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 16 }}>
                <span style={{ fontSize: 22 }}>⚖️</span>
                <p style={{ fontSize: 10, color: "#6B7E8A", margin: "9px 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>আনুমানিক ওজন</p>
                <p style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px", color: "#E8EDF2" }}>{result.estimated_weight}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", color: "#10B981", borderRadius: 20, padding: "2px 8px" }}>
                    {result.weight_category.split(" ")[0]}
                  </span>
                  {result.appearance === "premium" && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "#FBBF24", borderRadius: 20, padding: "2px 8px" }}>⭐ Premium</span>
                  )}
                  {result.hump_quality === "prominent" && (
                    <span style={{ fontSize: 10, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#A78BFA", borderRadius: 20, padding: "2px 8px" }}>কুঁজ ভালো</span>
                  )}
                </div>
              </div>
              <MeatCard meatKg={Math.round(result.meat_yield_kg)} dressingRate={result.dressing_rate} />
            </div>

            {/* Price tabs */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                {([["qurbani", "🕌 কোরবানি হাট"], ["market", "📊 বাজার মূল্য"]] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setActiveTab(key)} style={{ padding: "12px 8px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.2s", background: activeTab === key ? "rgba(16,185,129,0.15)" : "transparent", color: activeTab === key ? "#10B981" : "#6B7E8A", borderBottom: `2px solid ${activeTab === key ? "#10B981" : "transparent"}` }}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ padding: "16px 18px" }}>
                {activeTab === "qurbani" && result.estimate_b ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: "#6B7E8A" }}>ন্যায্য মূল্য সীমা</span>
                      <span style={{ fontSize: 17, fontWeight: 700, color: "#E8EDF2" }}>৳{result.estimate_b.price_range_min.toLocaleString()} – ৳{result.estimate_b.price_range_max.toLocaleString()}</span>
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
                      <span style={{ fontSize: 17, fontWeight: 700, color: "#E8EDF2" }}>৳{result.price_min.toLocaleString()} – ৳{result.price_max.toLocaleString()}</span>
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
                শুরু করুন <span style={{ color: "#10B981", fontWeight: 600 }}>৳{(result.estimate_b?.price_range_min ?? result.price_min).toLocaleString()}</span> থেকে।
                সর্বোচ্চ <span style={{ color: "#E8EDF2", fontWeight: 600 }}>৳{(result.estimate_b?.price_range_max ?? result.price_max).toLocaleString()}</span> পর্যন্ত দিতে পারেন।
                প্রতি কেজি মাংসের প্রকৃত খরচ <span style={{ color: "#F59E0B", fontWeight: 600 }}>৳{result.cost_per_kg_meat}</span>।
              </p>
            </div>

            <p style={{ fontSize: 10, color: "#3D4D57", textAlign: "center", margin: "2px 0 0", lineHeight: 1.5 }}>
              * AI বিশ্লেষণ অনুমান ভিত্তিক। চূড়ান্ত সিদ্ধান্তে বিশেষজ্ঞের পরামর্শ নিন।
            </p>

            {/* ── Action buttons ───────────────────────────────── */}

            {/* Facebook Share — 2-step card */}
            <div style={{ background: "rgba(24,119,242,0.06)", border: "1px solid rgba(24,119,242,0.25)", borderRadius: 16, padding: "14px 16px" }}>
              <p style={{ fontSize: 11, color: "#4A90F5", fontWeight: 700, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>📤 Facebook শেয়ার</p>
              <p style={{ fontSize: 11, color: "#6B7E8A", margin: "0 0 12px", lineHeight: 1.5 }}>
                ① কার্ড ডাউনলোড হবে → ② Facebook খুলবে → ③ ছবি attach করে post করুন
              </p>
              <button
                onClick={handleShare}
                disabled={shareLoading}
                style={{
                  width: "100%", padding: "13px", borderRadius: 12,
                  border: "none",
                  cursor: shareLoading ? "wait" : "pointer",
                  fontSize: 15, fontWeight: 700,
                  background: shareLoading
                    ? "rgba(24,119,242,0.3)"
                    : "linear-gradient(135deg, #1877F2, #0a5dc2)",
                  color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: shareLoading ? "none" : "0 4px 16px rgba(24,119,242,0.35)",
                  transition: "all 0.2s",
                }}
              >
                {shareLoading ? (
                  <>
                    <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    কার্ড তৈরি হচ্ছে...
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    Facebook-এ শেয়ার করুন
                  </>
                )}
              </button>
            </div>

            {/* Refresh / New Analysis button */}
            <button
              onClick={handleReset}
              style={{ width: "100%", padding: "13px", borderRadius: 14, border: "1px solid rgba(16,185,129,0.3)", cursor: "pointer", fontSize: 14, fontWeight: 700, background: "rgba(16,185,129,0.08)", color: "#10B981", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <span style={{ fontSize: 18 }}>🔄</span> নতুন গরু বিশ্লেষণ করুন
            </button>

            {/* Branding footer */}
            <div style={{ textAlign: "center", paddingTop: 8 }}>
              <p style={{ fontSize: 11, color: "#3D4D57", margin: 0 }}>
                Powered by <span style={{ color: "#10B981", fontWeight: 700 }}>Cowlytics</span> · cowlytics.com
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {result?.error && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 16, padding: 20, textAlign: "center" }}>
            <p style={{ color: "#ef4444", margin: 0 }}>{result.error}</p>
          </div>
        )}

      </div>

      {/* ── Paywall Modal ──────────────────────────────────────── */}
      {showPaywall && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 0 0 0" }}
          onClick={() => setShowPaywall(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#0D1F18", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "24px 24px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 480 }}
          >
            {/* Handle */}
            <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, margin: "0 auto 20px" }} />

            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🔒</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#E8EDF2", margin: "0 0 8px" }}>ফ্রি লিমিট শেষ</h2>
              <p style={{ fontSize: 14, color: "#6B7E8A", margin: 0, lineHeight: 1.6 }}>
                আপনি {FREE_LIMIT}টি বিনামূল্যে বিশ্লেষণ ব্যবহার করেছেন।<br />
                আরও বিশ্লেষণের জন্য প্রিমিয়াম নিন।
              </p>
            </div>

            {/* Features */}
            <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#10B981", margin: "0 0 12px" }}>🐄 প্রিমিয়াম সুবিধা</p>
              {[
                "✅ সীমাহীন বিশ্লেষণ",
                "✅ ইতিহাস সংরক্ষণ (unlimited)",
                "✅ উন্নত breed detection",
                "✅ বিশেষজ্ঞ মূল্যায়ন রিপোর্ট",
                "✅ Facebook শেয়ার কার্ড (ব্র্যান্ডেড)",
              ].map((f) => (
                <p key={f} style={{ fontSize: 13, color: "#A0ADB5", margin: "6px 0 0", lineHeight: 1.4 }}>{f}</p>
              ))}
            </div>

            {/* Key-based unlock — PRIMARY for manual admin flow */}
            <a
              href="/unlock"
              style={{ display: "block", width: "100%", padding: "15px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700, background: "linear-gradient(135deg, #7C3AED, #6D28D9)", color: "#fff", textAlign: "center", textDecoration: "none", boxShadow: "0 4px 20px rgba(124,58,237,0.35)", boxSizing: "border-box" }}
            >
              🔑 License Key দিয়ে আনলক করুন
            </a>

            {/* Payment link */}
            <a
              href="https://cowlytics.com/premium"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", width: "100%", marginTop: 10, padding: "13px", borderRadius: 14, border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.08)", color: "#10B981", textAlign: "center", textDecoration: "none", fontSize: 14, fontWeight: 700, boxSizing: "border-box" }}
            >
              🚀 প্রিমিয়াম নিন — মাত্র ৳৯৯/মাস
            </a>

            {/* Dev reset (remove in production) */}
            {process.env.NODE_ENV !== "production" && (
              <button
                onClick={async () => { await resetUsage(); setUsageCount(0); setShowPaywall(false); }}
                style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#3D4D57", fontSize: 12, cursor: "pointer" }}
              >
                [DEV] Usage রিসেট করুন
              </button>
            )}

            <button
              onClick={() => setShowPaywall(false)}
              style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 10, border: "none", background: "transparent", color: "#6B7E8A", fontSize: 13, cursor: "pointer" }}
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}

      {/* ── History Drawer ─────────────────────────────────────── */}
      {showHistory && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowHistory(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#0B1820", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "24px 24px 0 0", padding: "20px 0 40px", width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto" }}
          >
            {/* Handle */}
            <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, margin: "0 auto 16px" }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 12px" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#E8EDF2", margin: 0 }}>📋 বিশ্লেষণ ইতিহাস</h3>
              <button
                onClick={async () => { await clearHistory(); setHistory([]); }}
                style={{ fontSize: 12, color: "#ef4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 20, padding: "4px 10px", cursor: "pointer" }}
              >
                সব মুছুন
              </button>
            </div>

            {history.length === 0 ? (
              <p style={{ textAlign: "center", color: "#6B7E8A", fontSize: 13, padding: "20px" }}>কোনো বিশ্লেষণ নেই</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => { setResult(entry.result); setShowHistory(false); window.scrollTo({ top: 0 }); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", cursor: "pointer", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.15s" }}
                  >
                    {/* Thumb */}
                    {entry.thumbUrl ? (
                      <img src={entry.thumbUrl} alt="thumb" style={{ width: 54, height: 54, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 54, height: 54, borderRadius: 10, background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🐄</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#E8EDF2", margin: "0 0 2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {BREED_LABELS[entry.breed] ?? entry.breed}
                      </p>
                      <p style={{ fontSize: 12, color: "#6B7E8A", margin: "0 0 2px" }}>{entry.weightMid} কেজি · ৳{entry.priceMin.toLocaleString()}–{entry.priceMax.toLocaleString()}</p>
                      <p style={{ fontSize: 10, color: "#3D4D57", margin: 0 }}>
                        {new Date(entry.date).toLocaleDateString("bn-BD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span style={{ fontSize: 18, color: "#3D4D57" }}>›</span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowHistory(false)}
              style={{ display: "block", width: "calc(100% - 40px)", margin: "16px 20px 0", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#6B7E8A", fontSize: 14, cursor: "pointer" }}
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}

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
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)", color: "#F59E0B", borderRadius: 20, padding: "2px 8px" }}>
          Dressing {dressingPct}%
        </span>
        <span style={{ fontSize: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#6B7E8A", borderRadius: 20, padding: "2px 8px" }}>
          হাড় বাদে
        </span>
      </div>
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