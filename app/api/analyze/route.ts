import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CALIBRATED MARKET DATA (from 8 real BD cattle, verified prices)
// ═══════════════════════════════════════════════════════════════════════════════

// Live rate ৳/kg — online platform premium prices
// NOTE: Only the 5 breeds the active Gemini prompt can output are listed here.
// Other breed strings (Sahiwal Cross, Brahman Cross, etc.) were part of an older
// prompt and are no longer emitted. Fallback: ?? MARKET_RATES["Local Cross"].
const MARKET_RATES: Record<string, { min: number; max: number }> = {
  "Local":               { min: 490, max: 515 },
  "Local Cross":         { min: 490, max: 540 },
  "Local Large Cross":   { min: 490, max: 540 }, // Calibrated: 490/kg (RMF 774) to 540/kg (RMF 741/733)
  "Friesian Cross":      { min: 480, max: 510 },
  "Premium Cross":       { min: 525, max: 545 },
};

// Meat yield as % of live weight (dressing rates)
const DRESSING_RATES: Record<string, number> = {
  "Local":               0.40,
  "Local Cross":         0.43,
  "Local Large Cross":   0.44,
  "Friesian Cross":      0.40,
  "Premium Cross":       0.46,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — QURBANI MARKET PRICING ENGINE (2026 BD market formula)
// ═══════════════════════════════════════════════════════════════════════════════

// Tiered base price per kg (live weight) — Qurbani market 2026
function getQurbaniBasePricePerKg(weightKg: number): number {
  if (weightKg <= 150) return 540;
  if (weightKg <= 250) return 500;
  return 470;
}

// Breed multiplier — maps our AI breed to Qurbani market breed category
// Mirkadim/Deshi = Local (premium taste, compact, emotional value)
// Sahiwal/Premium = Premium Cross
// Friesian = lowest per-kg (dairy breed)
const QURBANI_BREED_MULTIPLIER: Record<string, number> = {
  "Local":               1.15, // Deshi — highest premium for Qurbani
  "Local Cross":         1.08, // Mid-range cross
  "Local Large Cross":   1.05, // Large but mixed — moderate premium
  "Friesian Cross":      1.00, // Standard — dairy breed, less Qurbani demand
  "Premium Cross":       1.10, // Sahiwal/Brahman — good beef + aesthetics
};

// Color & beauty multiplier — detected by Gemini from image
// "premium" = solid black / solid red / beautiful hump & horns
// "standard" = mixed/spotted/ordinary
const QURBANI_BEAUTY_MULTIPLIER: Record<string, number> = {
  "premium":  1.10, // Solid jet black, solid dark red, beautiful hump+horns
  "standard": 1.00, // Mixed color, spotted, regular
};

// Health/fitness multiplier — from body_condition
const QURBANI_HEALTH_MULTIPLIER: Record<string, number> = {
  "Excellent Heavy": 1.05,
  "Good Muscular":   1.05,
  "Moderate":        1.00,
  "Thin":            0.95,
};

// Eid premium — transport, haat hasil, seasonal demand surge
function getEidPremium(weightKg: number): number {
  if (weightKg <= 150) return 5000;
  if (weightKg <= 250) return 8000;
  return 12000;
}

interface QurbaniEstimate {
  base_price_per_kg:     number;
  base_value:            number;
  breed_multiplier:      number;
  beauty_multiplier:     number;
  health_multiplier:     number;
  subtotal_price:        number;
  eid_premium:           number;
  final_price:           number;
  price_range_min:       number;
  price_range_max:       number;
  appearance_detected:   string;
  explanation_bn:        string;
}

function calcQurbaniEstimate(
  weightMid:     number,
  breed:         string,
  bodyCondition: string,
  appearance:    string  // "premium" | "standard" — from Gemini
): QurbaniEstimate {
  const basePricePerKg  = getQurbaniBasePricePerKg(weightMid);
  const baseValue       = weightMid * basePricePerKg;
  const breedMult       = QURBANI_BREED_MULTIPLIER[breed]       ?? 1.05;
  const beautyMult      = QURBANI_BEAUTY_MULTIPLIER[appearance]  ?? 1.00;
  const healthMult      = QURBANI_HEALTH_MULTIPLIER[bodyCondition] ?? 1.00;
  const subtotal        = baseValue * breedMult * beautyMult * healthMult;
  const eidPremium      = getEidPremium(weightMid);
  const rawFinal        = subtotal + eidPremium;

  // Round to nearest 500
  const finalPrice    = Math.round(rawFinal / 500) * 500;
  const priceRangeMin = Math.round(finalPrice * 0.95 / 500) * 500;
  const priceRangeMax = Math.round(finalPrice * 1.05 / 500) * 500;

  // Build Bengali explanation
  const breedLabel: Record<string, string> = {
    "Local":             "দেশি জাত",
    "Local Cross":       "লোকাল ক্রস",
    "Local Large Cross": "বড় লোকাল ক্রস",
    "Friesian Cross":    "ফ্রিজিয়ান ক্রস",
    "Premium Cross":     "প্রিমিয়াম ক্রস",
  };
  const appearanceLabel = appearance === "premium"
    ? "সুন্দর রঙ ও কুঁজ থাকায় সৌন্দর্য প্রিমিয়াম যোগ হয়েছে"
    : "সাধারণ রঙ ও গড়নের কারণে সৌন্দর্য প্রিমিয়াম নেই";

  const explanation_bn =
    `${breedLabel[breed] ?? breed} জাতের গরু, ওজন আনুমানিক ${weightMid} কেজি। ` +
    `${appearanceLabel}। ঈদের হাটের পরিবহন ও হাসিল খরচ ৳${eidPremium.toLocaleString()} যোগ করে মোট অনুমান দাঁড়িয়েছে।`;

  return {
    base_price_per_kg:   basePricePerKg,
    base_value:          Math.round(baseValue),
    breed_multiplier:    breedMult,
    beauty_multiplier:   beautyMult,
    health_multiplier:   healthMult,
    subtotal_price:      Math.round(subtotal),
    eid_premium:         eidPremium,
    final_price:         finalPrice,
    price_range_min:     priceRangeMin,
    price_range_max:     priceRangeMax,
    appearance_detected: appearance,
    explanation_bn,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — AI WEIGHT CALIBRATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// ── Single combined correction factor (pre-computed, NOT compounded) ─────────
// The improved Gemini prompt (with 8 real reference cattle) is now much more
// accurate. We apply ONE modest correction — NOT breed × size multiplied.
//
// Key insight: old code did breedFactor × sizeFactor = e.g. 1.15 × 1.20 = 1.38
// That was designed for the OLD inaccurate prompt. New prompt gives ~380-420
// for RMF 774 (actual 390kg), so we only need ~1.05x, not 1.38x.
//
// Per-breed correction with new prompt:
//   Local / Local Cross / Local Large Cross / Premium: ~5-10% under → 1.05-1.10
//   Friesian Cross: still ~20-25% under (dairy body illusion) → 1.20-1.25
//
// BOUNDARY NOTE: There is an intentional step at rawMid=480 where the factor
// jumps from 0.96 → 1.02. This reflects real calibration data: cattle that
// Gemini estimates at 480+ kg are actually in the 570-620 kg range (verified),
// while cattle estimated at 350-479 kg tend to be slightly overestimated.
// A smooth interpolation would lose this distinction.
//
// SMALL CATTLE NOTE (calibrated from real data — 260 kg compact dark Local Cross):
// Gemini's "dark coat +15-20%" rule causes it to overshoot compact small cattle.
// Real example: actual 260 kg → Gemini raw ~300 kg mid → need ×0.90-0.93 to correct.
// We apply a graduated downward nudge for rawMid < 350 (non-Friesian only).
function getCombinedFactor(breed: string, rawMid: number): number {
  // Friesian Cross: Gemini massively underestimates dairy body frames.
  // RMF 198 (620kg Friesian): Gemini says 360-420 → need ×1.55
  if (breed === "Friesian Cross") {
    if (rawMid >= 380) return 1.55; // Large Friesian (600-700kg actual)
    if (rawMid >= 280) return 1.40; // Medium Friesian (400-500kg actual)
    return 1.25;                    // Small Friesian
  }
  // Non-Friesian: improved prompt tends to OVERSHOOT slightly for large cattle.
  // RMF 774 (390kg): Gemini says 380-450 → need ×0.96 to correct down
  // RMF 775 (440kg): Gemini says 420-490 → need ×0.96
  // RMF 741 (570kg): Gemini says 500-560 → need ×1.00 (already accurate)
  // RMF 733 (600kg): Gemini says 520-580 → need ×1.02
  if (rawMid >= 480) return 1.02; // Very large (570-620kg range) — slight upward
  if (rawMid >= 350) return 0.96; // Large (370-480kg) — prompt overshoots, correct down
  // Small/compact cattle: dark coat inflation rule causes Gemini to overshoot.
  // Real verified: actual 260 kg → Gemini raw ~300 kg → ×0.90 gives ~270 kg (good bracket)
  if (rawMid >= 250) return 0.93; // Medium-small (250-349kg raw) — modest downward fix
  return 0.90;                    // Very small (<250kg raw) — stronger downward fix
}

function calibrateWeight(
  rawMin: number,
  rawMax: number,
  breed: string,
  sellerClaim: number | undefined
): { min: number; max: number; mid: number; note: string; calibrationFactor: number } {
  const rawMid = (rawMin + rawMax) / 2;
  const factor = getCombinedFactor(breed, rawMid);

  let calMin = Math.round((rawMin * factor) / 10) * 10;
  let calMax = Math.round((rawMax * factor) / 10) * 10;

  // Minimum 60kg range
  if (calMax - calMin < 60) {
    const mid = Math.round((calMin + calMax) / 2 / 10) * 10;
    calMin = mid - 30;
    calMax = mid + 30;
  }

  let note = "";
  let finalMin = calMin;
  let finalMax = calMax;

  // Seller claim blending (AI 65%, seller 35%) if within 35% overage
  if (sellerClaim && sellerClaim > calMax) {
    const overageRatio = sellerClaim / calMax;
    if (overageRatio <= 1.35) {
      const calMid     = (calMin + calMax) / 2;
      const blendedMid = Math.round((calMid * 0.65 + sellerClaim * 0.35) / 10) * 10;
      const halfRange  = Math.round((calMax - calMin) / 2 / 10) * 10;
      finalMin = blendedMid - halfRange;
      finalMax = blendedMid + halfRange;
      note = "বিক্রেতার দাবি বিবেচনায় সংশোধিত অনুমান";
    } else {
      note = "বিক্রেতার দাবি AI অনুমানের চেয়ে অনেক বেশি — সতর্ক থাকুন";
    }
  }

  // Clamp mid to [finalMin, finalMax] to prevent drift from rounding
  const rawComputedMid = Math.round((finalMin + finalMax) / 2 / 5) * 5;
  const mid = Math.max(finalMin, Math.min(finalMax, rawComputedMid));

  return {
    min: finalMin,
    max: finalMax,
    mid,
    note,
    calibrationFactor: Math.round(factor * 100) / 100,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — BACKEND CONFIDENCE CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════

interface ConfidenceResult {
  score: number;
  label: string;
  band: "LOW" | "MEDIUM" | "HIGH";
}

function calculateConfidence(
  rawMin: number,
  rawMax: number,
  calibrated: { min: number; max: number; calibrationFactor: number },
  breed: string,
  sellerClaim: number | undefined
): ConfidenceResult {
  let score = 80;

  // Tight range = Gemini was confident
  const rawRange = rawMax - rawMin;
  if (rawRange <= 40)      score += 5;
  else if (rawRange <= 60) score += 0;
  else if (rawRange <= 80) score -= 5;
  else                     score -= 10;

  // Small calibration factor = AI was already close to truth
  const f = calibrated.calibrationFactor;
  if (f <= 1.10)      score += 8;
  else if (f <= 1.20) score += 3;
  else if (f <= 1.30) score -= 3;
  else if (f <= 1.40) score -= 8;
  else                score -= 14;

  // Seller claim alignment
  if (sellerClaim !== undefined) {
    const calMid = (calibrated.min + calibrated.max) / 2;
    const diff   = Math.abs(sellerClaim - calMid) / calMid;
    if (diff <= 0.08)      score += 6;
    else if (diff <= 0.15) score += 2;
    else if (diff <= 0.25) score -= 2;
    else                   score -= 8;
  }

  // Breed identification difficulty
  const breedPenalty: Record<string, number> = {
    "Local":               0,
    "Local Cross":         -2,
    "Local Large Cross":   -3,
    "Friesian Cross":      -6,
    "Premium Cross":       -4,
  };
  score += breedPenalty[breed] ?? -3;

  score = Math.max(62, Math.min(92, score));
  const band: "LOW" | "MEDIUM" | "HIGH" =
    score >= 82 ? "HIGH" : score >= 72 ? "MEDIUM" : "LOW";

  return { score, label: `${score}%`, band };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getWeightCategory(kg: number): string {
  if (kg < 280) return "Small (ছোট)";
  if (kg < 380) return "Medium (মাঝারি)";
  if (kg < 500) return "Large (বড়)";
  return "Exceptional (অসাধারণ)";
}

// FIX: Fraud check now takes BOTH price baselines — live-rate and Qurbani market.
// We use the higher of the two so a fair Qurbani-season seller price doesn't
// falsely trigger a MEDIUM or HIGH fraud warning.
function calcFraudRisk(
  sellerWeight:    number | undefined,
  calibratedMax:   number,
  sellerPrice:     number | undefined,
  liveRatePriceMax: number,
  qurbaniPriceMax:  number
): { risk: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN"; warning: string } {
  if (!sellerWeight) return { risk: "UNKNOWN", warning: "" };

  const wRatio = sellerWeight / calibratedMax;

  // Use the more generous price ceiling — Qurbani or live-rate, whichever is higher
  const effectivePriceMax = Math.max(liveRatePriceMax, qurbaniPriceMax);
  const pRatio = sellerPrice ? sellerPrice / effectivePriceMax : 1;

  if (wRatio > 1.35 || pRatio > 1.45) {
    return {
      risk: "HIGH",
      warning: `বিক্রেতা ${sellerWeight} কেজি দাবি করছেন, কিন্তু AI সর্বোচ্চ ${calibratedMax} কেজি অনুমান করছে। সম্ভাব্য ${Math.round((wRatio - 1) * 100)}% বেশি দাবি। সতর্ক থাকুন!`,
    };
  }
  if (wRatio > 1.18 || pRatio > 1.25) {
    return {
      risk: "MEDIUM",
      warning: `দাবিকৃত ওজন AI অনুমানের চেয়ে কিছুটা বেশি। দর কষাকষি করে কিনুন।`,
    };
  }
  return { risk: "LOW", warning: `বিক্রেতার দাবি AI অনুমানের সাথে সামঞ্জস্যপূর্ণ।` };
}

function getValueVerdict(costPerKgMeat: number, breed: string, weightCategory: string): string {
  // Friesian: dairy breed has lower dressing rate; judge value differently
  if (breed === "Friesian Cross" && costPerKgMeat < 1150)
    return "Friesian Cross — মাংসের অনুপাত কম, কিন্তু প্রতি কেজির দাম ঠিক আছে।";

  // Local/desi cattle: emotionally premium for Qurbani, small size = higher cost/kg is expected
  if (breed === "Local")
    return "দেশি গরু — কোরবানিতে স্বাদ ও ঐতিহ্যের কারণে প্রিমিয়াম মূল্য স্বাভাবিক।";

  // Small non-Local cattle where cost/kg is high
  if (weightCategory.startsWith("Small") && costPerKgMeat > 1300)
    return "ছোট গরুতে প্রতি কেজি মাংসের খরচ বেশি — কিন্তু স্বাদ ভালো ও একা কেনা সুবিধাজনক।";

  if (costPerKgMeat < 1100) return "প্রতি কেজি মাংসের হিসেবে এটি চমৎকার মূল্য।";
  if (costPerKgMeat < 1250) return "মূল্য বাজার গড়ের মধ্যে আছে।";
  if (costPerKgMeat < 1400) return "মূল্য কিছুটা বেশি — দর কষুন।";
  return "প্রতি কেজি মাংসের খরচ বাজার গড়ের চেয়ে বেশি — ভালোভাবে দর কষাকষি করুন।";
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — GEMINI PROMPT
// Detects: breed, weight, body condition, coat color, hump quality, appearance
// ═══════════════════════════════════════════════════════════════════════════════

const GEMINI_PROMPT = `You are an expert Bangladeshi cattle evaluator with 20 years of experience at qurbani markets. Analyze the cattle image and return structured data.

=== BREED IDENTIFICATION ===
Identify breed as exactly ONE of:
1. "Local" — small desi/zebu, short stature, thin legs. Typically 150–260 kg.
2. "Local Cross" — desi + cross, medium hump, reddish/brown/grey coat. Typically 220–400 kg.
3. "Local Large Cross" — larger desi cross, well-built, muscular, broad chest. Typically 350–580 kg.
4. "Friesian Cross" — black-and-white OR mostly black with white patches, long body, no prominent hump, dairy shape. These are LARGE 400–700 kg animals.
5. "Premium Cross" — Brahman/Sahiwal, prominent hump, heavy muscling, thick neck. Typically 350–600 kg.

=== WEIGHT ESTIMATION ===
Visually assess: body length, chest depth, belly girth, leg thickness, muscle mass.

CRITICAL:
- Dark cattle (black/dark grey) with LARGE frame (big chest, thick legs, wide belly) — estimate 8-12% heavier than you think
- Dark cattle with COMPACT/SMALL frame — apply NO dark coat adjustment. Judge purely on body size.
- Friesian cattle are MUCH heavier than their side profile suggests — minimum 420 kg if visually large
- Animal next to adult human and looks large → 380 kg+
- Do NOT blindly inflate for dark coat. Only inflate if body mass clearly justifies it.
- Range must span 40-80 kg minimum.

REFERENCE WEIGHTS (real BD cattle):
176 kg (small desi) | 235 kg (avg desi) | 260 kg (compact dark Local Cross — do NOT inflate for dark coat) |
295 kg (medium cross) | 390 kg (large cross) | 440 kg (big cross) |
570 kg (very large) | 600 kg (exceptional) | 620 kg (Friesian — looks lighter than it is)

=== BODY CONDITION ===
Choose exactly ONE:
"Thin" | "Moderate" | "Good Muscular" | "Excellent Heavy"

=== APPEARANCE (for Qurbani premium) ===
appearance_category: Assess coat color, hump size, and horn shape.
Choose exactly ONE:
- "premium" — Solid jet black OR solid dark red/maroon OR pure white; AND has a beautiful prominent hump; AND clean shiny coat without skin disease. Even one of these (solid color OR excellent hump) qualifies.
- "standard" — Mixed color, spotted/patchy, small or no hump, ordinary appearance.

=== OUTPUT FORMAT ===
Return ONLY valid JSON — no markdown, no explanation:
{
  "estimated_weight": "380-440 kg",
  "weight_min": 380,
  "weight_max": 440,
  "body_condition": "Good Muscular",
  "breed": "Local Cross",
  "appearance_category": "premium",
  "coat_color": "solid black",
  "hump_quality": "prominent",
  "visual_confidence": "high"
}

visual_confidence: exactly "low", "medium", or "high"
breed: exactly one of the 5 listed above
appearance_category: exactly "premium" or "standard"
hump_quality: "prominent", "moderate", or "small"`;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — API HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { image, seller_claimed_weight, seller_claimed_price } = body as {
      image: string;
      seller_claimed_weight?: number;
      seller_claimed_price?: number;
    };

    if (!image) {
      return NextResponse.json({ error: "ছবি পাওয়া যায়নি।" }, { status: 400 });
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "API key কনফিগার করা নেই।" }, { status: 500 });
    }

    // ── Step 1: Gemini visual analysis ────────────────────────────────────────
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: GEMINI_PROMPT },
              { inline_data: { mime_type: "image/jpeg", data: image } },
            ],
          }],
          generationConfig: { temperature: 0.10, maxOutputTokens: 400 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error("Gemini API error status:", geminiRes.status, errBody);
      return NextResponse.json(
        { error: `AI Error ${geminiRes.status}: ${errBody}` },
        { status: 502 }
      );
    }

    const geminiData = await geminiRes.json();
    const rawText    = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const cleaned    = rawText.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    let ai: {
      estimated_weight?:    string;
      weight_min?:          number;
      weight_max?:          number;
      body_condition?:      string;
      breed?:               string;
      appearance_category?: string;
      coat_color?:          string;
      hump_quality?:        string;
      visual_confidence?:   string;
    } = {};

    try {
      ai = JSON.parse(cleaned);
    } catch {
      console.error("Gemini JSON parse failed:", rawText);
      return NextResponse.json(
        { error: "AI বিশ্লেষণ পার্স করা যায়নি। ছবিটি স্পষ্ট কিনা দেখুন।" },
        { status: 422 }
      );
    }

    // ── Step 2: Validate AI output ────────────────────────────────────────────
    const validBreeds = ["Local", "Local Cross", "Local Large Cross", "Friesian Cross", "Premium Cross"];
    const breed: string = validBreeds.includes(ai.breed ?? "") ? (ai.breed as string) : "Local Cross";

    // weight_min floor: 100 kg. weight_max must be at least rawMin + 40 kg.
    const rawMin: number = Math.max(100, ai.weight_min ?? 250);
    const rawMax: number = Math.max(rawMin + 40, ai.weight_max ?? rawMin + 60);

    const validConditions = ["Thin", "Moderate", "Good Muscular", "Excellent Heavy"];
    const bodyCondition: string = validConditions.includes(ai.body_condition ?? "")
      ? (ai.body_condition as string)
      : "Moderate";

    const appearance: string = ai.appearance_category === "premium" ? "premium" : "standard";

    // ── Step 3: Calibrate weight ──────────────────────────────────────────────
    const calibrated = calibrateWeight(rawMin, rawMax, breed, seller_claimed_weight);
    const { min: weightMin, max: weightMax, mid: weightMid } = calibrated;

    // ── Step 4: Calibrated market estimate (live rate model) ──────────────────
    const rate           = MARKET_RATES[breed] ?? MARKET_RATES["Local Cross"];
    const dressing       = DRESSING_RATES[breed] ?? 0.42;
    const meatYieldKg    = parseFloat((weightMid * dressing).toFixed(1));
    const priceMin       = Math.round((weightMid * rate.min) / 1000) * 1000;
    const priceMax       = Math.round((weightMid * rate.max) / 1000) * 1000;
    const avgPrice       = (priceMin + priceMax) / 2;
    const pricePerKgLive = Math.round(avgPrice / weightMid);
    const costPerKgMeat  = Math.round(avgPrice / meatYieldKg);
    const weightCategory = getWeightCategory(weightMid);
    const valueVerdict   = getValueVerdict(costPerKgMeat, breed, weightCategory);

    // ── Step 5: Qurbani market estimate (multiplier model) ────────────────────
    const qurbani = calcQurbaniEstimate(weightMid, breed, bodyCondition, appearance);

    // ── Step 6: Backend confidence ────────────────────────────────────────────
    const confidence = calculateConfidence(rawMin, rawMax, calibrated, breed, seller_claimed_weight);

    // ── Step 7: Fraud detection ───────────────────────────────────────────────
    // FIX: Pass both price ceilings so Qurbani-season pricing doesn't false-alarm.
    const { risk: fraudRisk, warning: fraudWarning } = calcFraudRisk(
      seller_claimed_weight,
      weightMax,
      seller_claimed_price,
      priceMax,                   // live-rate ceiling
      qurbani.price_range_max     // Qurbani-market ceiling
    );

    // ── Response ──────────────────────────────────────────────────────────────
    return NextResponse.json({
      // ── Weight ──────────────────────────────────────────────────────────────
      estimated_weight:  `${weightMin}–${weightMax} কেজি`,
      weight_min:        weightMin,
      weight_max:        weightMax,
      weight_mid:        weightMid,
      weight_note:       calibrated.note || undefined,
      weight_category:   weightCategory,

      // ── AI Classification ────────────────────────────────────────────────────
      breed,
      body_condition:    bodyCondition,
      coat_color:        ai.coat_color ?? "Unknown",
      hump_quality:      ai.hump_quality ?? "moderate",
      appearance,

      // ── Confidence ───────────────────────────────────────────────────────────
      confidence:        confidence.label,
      confidence_score:  confidence.score,
      confidence_band:   confidence.band,

      // ── Top-level fields — backward compatible with existing page.tsx ─────────
      meat_yield:        `${meatYieldKg} কেজি`,
      meat_yield_kg:     meatYieldKg,
      dressing_rate:     dressing,
      price_range:       `৳${priceMin.toLocaleString()} – ৳${priceMax.toLocaleString()}`,
      price_min:         priceMin,
      price_max:         priceMax,
      price_per_kg_live: pricePerKgLive,
      cost_per_kg_meat:  costPerKgMeat,
      value_verdict:     valueVerdict,

      // ── Estimate A: Calibrated Live Rate Model (our real data) ──────────────
      estimate_a: {
        label:             "ক্যালিব্রেটেড বাজার মূল্য (Real Data)",
        meat_yield:        `${meatYieldKg} কেজি`,
        meat_yield_kg:     meatYieldKg,
        dressing_rate:     dressing,
        price_range:       `৳${priceMin.toLocaleString()} – ৳${priceMax.toLocaleString()}`,
        price_min:         priceMin,
        price_max:         priceMax,
        price_per_kg_live: pricePerKgLive,
        cost_per_kg_meat:  costPerKgMeat,
        value_verdict:     valueVerdict,
      },

      // ── Estimate B: Qurbani Market Formula (2026 seasonal pricing) ──────────
      estimate_b: {
        label:               "কোরবানির হাটের বাজার মূল্য (২০২৬)",
        base_price_per_kg:   qurbani.base_price_per_kg,
        base_value:          qurbani.base_value,
        breed_multiplier:    qurbani.breed_multiplier,
        beauty_multiplier:   qurbani.beauty_multiplier,
        health_multiplier:   qurbani.health_multiplier,
        subtotal_price:      qurbani.subtotal_price,
        eid_premium:         qurbani.eid_premium,
        final_price:         qurbani.final_price,
        price_range_min:     qurbani.price_range_min,
        price_range_max:     qurbani.price_range_max,
        price_range:         `৳${qurbani.price_range_min.toLocaleString()} – ৳${qurbani.price_range_max.toLocaleString()}`,
        appearance_detected: qurbani.appearance_detected,
        explanation_bn:      qurbani.explanation_bn,
      },

      // ── Fraud Detection ──────────────────────────────────────────────────────
      fraud_risk:            fraudRisk !== "UNKNOWN" ? fraudRisk : undefined,
      fraud_warning:         fraudWarning || undefined,
      seller_claimed_weight: seller_claimed_weight ?? undefined,
      seller_claimed_price:  seller_claimed_price ?? undefined,

      // ── Debug (strip or gate behind NODE_ENV check before production) ────────
      ...(process.env.NODE_ENV !== "production" && {
        _debug: {
          ai_raw_min:         rawMin,
          ai_raw_max:         rawMax,
          ai_visual_conf:     ai.visual_confidence,
          calibration_factor: calibrated.calibrationFactor,
          calibration_note:   `Raw: ${rawMin}-${rawMax}kg → Calibrated: ${weightMin}-${weightMax}kg (×${calibrated.calibrationFactor})`,
          qurbani_formula:    `Base ৳${qurbani.base_price_per_kg}/kg × ${qurbani.breed_multiplier} (breed) × ${qurbani.beauty_multiplier} (beauty) × ${qurbani.health_multiplier} (health) + ৳${qurbani.eid_premium} Eid = ৳${qurbani.final_price}`,
        },
      }),
    });

  } catch (err) {
    console.error("Cowlytics route error:", err);
    return NextResponse.json(
      { error: "সার্ভার সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।" },
      { status: 500 }
    );
  }
}