import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════
// SECTION 1 — CALIBRATED MARKET DATA
// Source: 20 real verified BD cattle (online platform, 2026 Eid)
// ═══════════════════════════════════════════════════════

const MARKET_RATES: Record<string, { min: number; max: number }> = {
  "Local":               { min: 500, max: 535 },
  "Local Cross":         { min: 490, max: 530 },
  "Local Large Cross":   { min: 490, max: 540 },
  "Friesian Cross":      { min: 480, max: 500 },
  "Sahiwal Cross":       { min: 505, max: 540 },
  "Brahman Cross":       { min: 500, max: 535 },
  "Sindhi Cross":        { min: 495, max: 530 },
  "Premium Cross":       { min: 505, max: 540 },
  "Unknown Cross":       { min: 490, max: 525 },
};

const DRESSING_RATES: Record<string, number> = {
  "Local":               0.40,
  "Local Cross":         0.43,
  "Local Large Cross":   0.44,
  "Friesian Cross":      0.40,
  "Sahiwal Cross":       0.46,
  "Brahman Cross":       0.45,
  "Sindhi Cross":        0.44,
  "Premium Cross":       0.46,
  "Unknown Cross":       0.42,
};

// ═══════════════════════════════════════════════════════
// SECTION 2 — QURBANI PRICING ENGINE
// Rate-anchored formula (৳490-545/kg real data, n=20)
// ═══════════════════════════════════════════════════════

const QURBANI_BASE_RATE: Record<string, { min: number; max: number }> = {
  "Local":               { min: 505, max: 540 },
  "Local Cross":         { min: 495, max: 530 },
  "Local Large Cross":   { min: 490, max: 535 },
  "Friesian Cross":      { min: 480, max: 500 },
  "Sahiwal Cross":       { min: 505, max: 540 },
  "Brahman Cross":       { min: 500, max: 535 },
  "Sindhi Cross":        { min: 495, max: 530 },
  "Premium Cross":       { min: 505, max: 540 },
  "Unknown Cross":       { min: 490, max: 520 },
};
const BEAUTY_ADDER: Record<string, number> = { "premium": 20, "standard": 0 };
const HEALTH_ADDER: Record<string, number> = {
  "Excellent Heavy": 10, "Good Muscular": 5, "Moderate": 0, "Thin": -15,
};
function getEidPremium(weightKg: number): number {
  if (weightKg <= 200) return 0;
  if (weightKg <= 300) return 6000;
  if (weightKg <= 400) return 10000;
  if (weightKg <= 500) return 13000;
  return 15000;
}

interface QurbaniEstimate {
  base_price_per_kg:   number;
  base_value:          number;
  breed_multiplier:    number;
  beauty_multiplier:   number;
  health_multiplier:   number;
  subtotal_price:      number;
  eid_premium:         number;
  final_price:         number;
  price_range_min:     number;
  price_range_max:     number;
  appearance_detected: string;
  explanation_bn:      string;
}

function calcQurbaniEstimate(
  weightMid:     number,
  breed:         string,
  bodyCondition: string,
  appearance:    string
): QurbaniEstimate {
  const baseRates    = QURBANI_BASE_RATE[breed] ?? QURBANI_BASE_RATE["Unknown Cross"];
  const beautyAdder  = BEAUTY_ADDER[appearance]    ?? 0;
  const healthAdder  = HEALTH_ADDER[bodyCondition] ?? 0;
  const adder        = beautyAdder + healthAdder;
  const effectiveMin = Math.min(baseRates.min + adder, 545);
  const effectiveMax = Math.min(baseRates.max + adder, 545);
  const priceMin     = Math.round((weightMid * effectiveMin) / 500) * 500;
  const priceMax     = Math.round((weightMid * effectiveMax) / 500) * 500;
  const midPrice     = (priceMin + priceMax) / 2;
  const eidPremium   = getEidPremium(weightMid);
  const finalPrice   = Math.round((midPrice + eidPremium) / 500) * 500;
  const priceRangeMin = Math.round((priceMin + eidPremium) / 500) * 500;
  const priceRangeMax = Math.round((priceMax + eidPremium) / 500) * 500;
  const breedLabel: Record<string, string> = {
    "Local": "দেশি জাত", "Local Cross": "লোকাল ক্রস",
    "Local Large Cross": "বড় লোকাল ক্রস", "Friesian Cross": "ফ্রিজিয়ান ক্রস",
    "Sahiwal Cross": "সাহিওয়াল ক্রস", "Brahman Cross": "ব্রাহমান ক্রস",
    "Sindhi Cross": "সিন্ধি ক্রস", "Premium Cross": "প্রিমিয়াম ক্রস",
    "Unknown Cross": "মিশ্র জাত",
  };
  const appearanceLabel = appearance === "premium"
    ? "সুন্দর রঙ ও কুঁজ থাকায় সৌন্দর্য প্রিমিয়াম যোগ হয়েছে"
    : "সাধারণ রঙ ও গড়নের কারণে সৌন্দর্য প্রিমিয়াম নেই";
  return {
    base_price_per_kg:   Math.round((effectiveMin + effectiveMax) / 2),
    base_value:          Math.round(midPrice),
    breed_multiplier:    baseRates.max,
    beauty_multiplier:   beautyAdder,
    health_multiplier:   healthAdder,
    subtotal_price:      Math.round(midPrice),
    eid_premium:         eidPremium,
    final_price:         finalPrice,
    price_range_min:     priceRangeMin,
    price_range_max:     priceRangeMax,
    appearance_detected: appearance,
    explanation_bn:
      `${breedLabel[breed] ?? breed} জাতের গরু, আনুমানিক ${weightMid} কেজি। ` +
      `${appearanceLabel}। ঈদের হাসিল ও পরিবহন ৳${eidPremium.toLocaleString()} যোগে মোট বাজার অনুমান।`,
  };
}

// ═══════════════════════════════════════════════════════
// SECTION 3 — WEIGHT CALIBRATION ENGINE
// v4: Black/dark large cattle underestimation fix added
// Validated against 20 real Dhaka cattle (2026)
// ═══════════════════════════════════════════════════════

/**
 * BLACK CATTLE CORRECTION (NEW in v4):
 * Problem: Gemini systematically underestimates black/dark large cattle
 * because dark coats visually compress the body silhouette in photos.
 * Real-world data (5 black cattle, 380-650kg range):
 *   - Gemini estimated 290-380kg when actual was 410-650kg
 *   - Average underestimation: ~22% for large dark cattle
 * Solution: Apply an additional dark-coat multiplier BEFORE breed calibration
 * Only applies when: coat is dark AND rawMid >= 300 (medium-large)
 * Does NOT apply to small cattle (rawMid < 300) — small dark cattle are accurate
 */
function getDarkCoatFactor(coatColor: string, rawMid: number): number {
  const isDark = /black|kalo|dark|charcoal|jet|solid.black|গাঢ়|কালো/i.test(coatColor);
  if (!isDark) return 1.0;
  // Small dark cattle: no correction (Gemini accurate per our data)
  if (rawMid < 250) return 1.0;
  // Medium dark (250-380): moderate correction
  if (rawMid < 380) return 1.10;
  // Large dark (380-500): significant correction
  if (rawMid < 500) return 1.18;
  // Very large dark (500+): heavy correction
  return 1.22;
}

/**
 * Combined breed + size calibration factor
 * Validated against 20 real Dhaka cattle (2026 Eid)
 */
function getCombinedFactor(breed: string, rawMid: number): number {
  if (breed === "Friesian Cross") {
    if (rawMid >= 380) return 1.55; // massive dairy frame illusion
    if (rawMid >= 280) return 1.40;
    return 1.25;
  }
  if (["Brahman Cross", "Sahiwal Cross", "Sindhi Cross", "Premium Cross"].includes(breed)) {
    if (rawMid >= 450) return 1.05;
    if (rawMid >= 350) return 1.00;
    return 0.97;
  }
  if (breed === "Local Large Cross") {
    if (rawMid >= 480) return 1.02;
    if (rawMid >= 350) return 0.96;
    return 0.95;
  }
  // Local / Local Cross
  if (rawMid >= 480) return 1.02;
  if (rawMid >= 350) return 0.96;
  if (rawMid >= 220) return 1.00;
  return 1.00;
}

function calibrateWeight(
  rawMin:      number,
  rawMax:      number,
  breed:       string,
  coatColor:   string,      // NEW: passed for dark-coat correction
  sellerClaim: number | undefined
): { min: number; max: number; mid: number; note: string; calibrationFactor: number } {
  const rawMid = (rawMin + rawMax) / 2;

  // Step 1: Apply dark coat correction first (pre-calibration)
  const darkFactor  = getDarkCoatFactor(coatColor, rawMid);
  const adjRawMin   = rawMin * darkFactor;
  const adjRawMax   = rawMax * darkFactor;
  const adjRawMid   = (adjRawMin + adjRawMax) / 2;

  // Step 2: Apply breed calibration on dark-corrected values
  const factor  = getCombinedFactor(breed, adjRawMid);
  const totalFactor = darkFactor * factor; // combined for debug output

  let calMin = Math.round((adjRawMin * factor) / 10) * 10;
  let calMax = Math.round((adjRawMax * factor) / 10) * 10;

  // Enforce minimum 60kg spread
  if (calMax - calMin < 60) {
    const mid  = Math.round((calMin + calMax) / 2 / 10) * 10;
    calMin = mid - 30;
    calMax = mid + 30;
  }

  // Breed-specific floor guards
  if (breed === "Friesian Cross" && calMin < 350) calMin = 350;
  if (breed === "Local Large Cross" && calMin < 300) calMin = 300;

  let note     = "";
  let finalMin = calMin;
  let finalMax = calMax;

  // Dark coat note
  if (darkFactor > 1.0) {
    note = "কালো রঙের গরু — AI অনুমান ঊর্ধ্বমুখী সংশোধন করা হয়েছে";
  }

  // Seller claim blending — only when plausibly close (within 35%)
  if (sellerClaim !== undefined && sellerClaim > calMax) {
    const overageRatio = sellerClaim / calMax;
    if (overageRatio <= 1.35) {
      const calMid     = (calMin + calMax) / 2;
      const blendedMid = Math.round((calMid * 0.65 + sellerClaim * 0.35) / 10) * 10;
      const halfRange  = Math.round((calMax - calMin) / 2 / 10) * 10;
      finalMin = blendedMid - halfRange;
      finalMax = blendedMid + halfRange;
      note = note
        ? note + " · বিক্রেতার দাবি বিবেচনায় সংশোধিত"
        : "বিক্রেতার দাবি বিবেচনায় সংশোধিত অনুমান";
    } else {
      note = note
        ? note + " · বিক্রেতার দাবি অনেক বেশি — সতর্ক থাকুন"
        : "বিক্রেতার দাবি AI অনুমানের চেয়ে অনেক বেশি — সতর্ক থাকুন";
    }
  }

  const mid = Math.round((finalMin + finalMax) / 2 / 5) * 5;

  return {
    min: finalMin,
    max: finalMax,
    mid: Math.max(finalMin, Math.min(finalMax, mid)),
    note,
    calibrationFactor: Math.round(totalFactor * 100) / 100,
  };
}

// ═══════════════════════════════════════════════════════
// SECTION 4 — BACKEND CONFIDENCE CALCULATOR
// Target range: 65–90%
// ═══════════════════════════════════════════════════════

interface ConfidenceResult {
  score: number;
  label: string;
  band:  "LOW" | "MEDIUM" | "HIGH";
}

function calculateConfidence(
  rawMin:      number,
  rawMax:      number,
  calibrated:  { min: number; max: number; calibrationFactor: number },
  breed:       string,
  visualConf:  string,
  sellerClaim: number | undefined
): ConfidenceResult {
  let score = { high: 78, medium: 68, low: 56 }[visualConf] ?? 68;

  const rawRange = rawMax - rawMin;
  if      (rawRange <= 40) score += 6;
  else if (rawRange <= 60) score += 2;
  else if (rawRange <= 80) score -= 3;
  else                     score -= 8;

  const f = calibrated.calibrationFactor;
  if      (f <= 1.05) score += 8;
  else if (f <= 1.10) score += 4;
  else if (f <= 1.20) score += 0;
  else if (f <= 1.35) score -= 5;
  else if (f <= 1.45) score -= 10;
  else                score -= 16;

  if (sellerClaim !== undefined) {
    const calMid = (calibrated.min + calibrated.max) / 2;
    const diff   = Math.abs(sellerClaim - calMid) / calMid;
    if      (diff <= 0.07) score += 8;
    else if (diff <= 0.14) score += 3;
    else if (diff <= 0.25) score -= 2;
    else                   score -= 7;
  }

  const breedPenalty: Record<string, number> = {
    "Local":               +2,
    "Local Cross":          0,
    "Local Large Cross":   -2,
    "Friesian Cross":      -5,
    "Sahiwal Cross":       -3,
    "Brahman Cross":       -2,
    "Sindhi Cross":        -3,
    "Premium Cross":       -4,
    "Unknown Cross":       -6,
  };
  score += breedPenalty[breed] ?? -3;

  score = Math.max(62, Math.min(90, score));
  const band: "LOW" | "MEDIUM" | "HIGH" =
    score >= 80 ? "HIGH" : score >= 71 ? "MEDIUM" : "LOW";

  return { score, label: `${score}%`, band };
}

// ═══════════════════════════════════════════════════════
// SECTION 5 — HELPERS
// ═══════════════════════════════════════════════════════

function getWeightCategory(kg: number): string {
  if (kg < 280) return "Small (ছোট)";
  if (kg < 380) return "Medium (মাঝারি)";
  if (kg < 500) return "Large (বড়)";
  return "Exceptional (অসাধারণ)";
}

function calcFraudRisk(
  sellerWeight:     number | undefined,
  calibratedMax:    number,
  sellerPrice:      number | undefined,
  liveRatePriceMax: number,
  qurbaniPriceMax:  number
): { risk: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN"; warning: string } {
  if (!sellerWeight) return { risk: "UNKNOWN", warning: "" };

  const wRatio          = sellerWeight / calibratedMax;
  const effectivePriceMax = Math.max(liveRatePriceMax, qurbaniPriceMax);
  const pRatio          = sellerPrice ? sellerPrice / effectivePriceMax : 1;

  if (wRatio > 1.35 || pRatio > 1.45) {
    return {
      risk: "HIGH",
      warning: `বিক্রেতা ${sellerWeight} কেজি দাবি করছেন কিন্তু AI সর্বোচ্চ ${calibratedMax} কেজি অনুমান করছে। সম্ভাব্য ${Math.round((wRatio - 1) * 100)}% বেশি দাবি। সতর্ক থাকুন!`,
    };
  }
  if (wRatio > 1.18 || pRatio > 1.25) {
    return {
      risk: "MEDIUM",
      warning: `দাবিকৃত ওজন AI অনুমানের চেয়ে কিছুটা বেশি। দর কষাকষি করুন।`,
    };
  }
  return { risk: "LOW", warning: `বিক্রেতার দাবি AI অনুমানের সাথে সামঞ্জস্যপূর্ণ।` };
}

function getValueVerdict(costPerKgMeat: number, breed: string, weightCategory: string): string {
  if (breed === "Friesian Cross" && costPerKgMeat < 1150)
    return "Friesian Cross — মাংসের অনুপাত কম, তবে দাম ঠিক আছে।";
  if (breed === "Local")
    return "দেশি গরু — কোরবানিতে স্বাদ ও ঐতিহ্যের জন্য প্রিমিয়াম মূল্য স্বাভাবিক।";
  if (weightCategory.startsWith("Small") && costPerKgMeat > 1300)
    return "ছোট গরুতে প্রতি কেজি মাংসের খরচ বেশি — স্বাদ ভালো ও একা কেনা সুবিধাজনক।";
  if (costPerKgMeat < 1100) return "প্রতি কেজি মাংসের হিসেবে চমৎকার মূল্য।";
  if (costPerKgMeat < 1250) return "মূল্য বাজার গড়ের মধ্যে আছে।";
  if (costPerKgMeat < 1400) return "মূল্য কিছুটা বেশি — দর কষুন।";
  return "প্রতি কেজি মাংসের খরচ বেশি — ভালোভাবে দর কষাকষি করুন।";
}

// ═══════════════════════════════════════════════════════
// SECTION 6 — GEMINI PROMPT (v4 — black cattle fix)
// ═══════════════════════════════════════════════════════

const GEMINI_PROMPT = `You are Cowlytics AI — an expert Bangladeshi Qurbani cattle evaluator with 20 years of haat market experience. Analyze the cattle image accurately.

=== BREED IDENTIFICATION ===
Choose EXACTLY ONE breed:
1. "Local" — compact deshi/zebu, small-medium frame, small hump, thin legs. Typical: 120–260 kg.
2. "Local Cross" — desi+cross, medium hump, reddish/brown/grey coat, medium frame. Typical: 220–420 kg.
3. "Local Large Cross" — larger desi cross, broad chest, muscular hindquarter, big frame. Typical: 380–600 kg.
4. "Friesian Cross" — CRITICAL: long rectangular dairy body, stretched torso, long thin legs, shallow/no hump. Black-white patches OR solid black with dairy frame. These are LARGE 400–700 kg animals. If ANY dairy body traits visible → Friesian Cross. Minimum weight: 380 kg.
5. "Sahiwal Cross" — reddish/brown premium beef body, thick neck, medium-large hump. Typical: 300–600 kg.
6. "Brahman Cross" — very large hump, loose hanging skin, massive frame, thick neck. Typical: 350–750 kg.
7. "Sindhi Cross" — deep reddish coat, compact muscular body, medium-heavy frame. Typical: 280–550 kg.
8. "Premium Cross" — elite beef structure, premium muscular body, strong hindquarter. Typical: 350–700 kg.
9. "Unknown Cross" — genuinely unclear mixed breed.

=== WEIGHT ESTIMATION ===
Estimate from: body length, chest depth, belly girth, leg thickness, muscle mass, skeletal frame.

BLACK/DARK CATTLE CRITICAL RULE:
Dark coats (solid black, dark charcoal) make cattle appear SMALLER in photos than they actually are.
- Small dark frame (<250 kg visually): NO adjustment — judge purely on body size.
- Medium dark frame (250–400 kg visually): Report your honest visual estimate WITHOUT adding the dark coat correction — the backend will apply the correction automatically.
- Large dark frame (400 kg+ visually): Same — report honest estimate, backend corrects.
- The backend will apply appropriate upward correction based on coat color.
- IMPORTANT: Do NOT double-correct — just estimate what you see and report coat_color accurately.

LARGE CATTLE RULE:
- Large cattle (400 kg+) are commonly UNDERestimated in photos — apply upward correction.
- If animal stands large next to adult human → 380 kg minimum.
- Friesian cattle appear lighter than they are — do NOT underestimate dairy frame.

REFERENCE WEIGHTS (real verified BD cattle):
176 kg=small desi | 235 kg=avg desi | 260 kg=compact dark Local Cross |
295 kg=medium cross | 390 kg=large cross | 440 kg=big muscular cross |
570 kg=very large cross | 600 kg=exceptional | 620 kg=Friesian (looks lighter than it is)

WEIGHT SPREAD RULES:
≤180 kg → max 30 kg spread
181–350 kg → max 40 kg spread
351–550 kg → max 50 kg spread
551+ kg → max 60 kg spread

=== BODY CONDITION ===
Choose EXACTLY ONE: "Thin" | "Moderate" | "Good Muscular" | "Excellent Heavy"

=== COAT COLOR (CRITICAL — affects weight accuracy) ===
Report the EXACT dominant coat color as precisely as possible:
- Use terms like: "solid black", "jet black", "dark charcoal", "solid white", "solid red", "reddish brown", "brown", "grey", "black white patches", "spotted"
- Be specific — "solid black" vs "dark grey" vs "black white patches" matters for weight calibration.

=== APPEARANCE (Qurbani premium) ===
"premium" — solid jet black OR solid dark red/maroon OR pure white; AND beautiful prominent hump; AND clean shiny coat. Even ONE qualifying trait counts.
"standard" — mixed color, spotted, small/no hump, ordinary appearance.

=== OUTPUT ===
Return ONLY valid JSON — no markdown, no text outside JSON:
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

visual_confidence: "low" (blurry/partial/dark) | "medium" (partial uncertainty) | "high" (full body, clear, breed obvious)
breed: exactly one of the 9 listed above
appearance_category: exactly "premium" or "standard"
hump_quality: "prominent" | "moderate" | "small"`;

// ═══════════════════════════════════════════════════════
// SECTION 7 — API HANDLER
// ═══════════════════════════════════════════════════════

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { image, images, seller_claimed_weight, seller_claimed_price } = body as {
      image?:  string;
      images?: string[];
      seller_claimed_weight?: number;
      seller_claimed_price?:  number;
    };
    const imageList: string[] = images?.length ? images : image ? [image] : [];
    if (!imageList.length) {
      return NextResponse.json({ error: "ছবি পাওয়া যায়নি।" }, { status: 400 });
    }

    const primaryImage = imageList[0];
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "API key কনফিগার করা নেই।" }, { status: 500 });
    }

    // ── Step 1: Gemini visual analysis ──────────────────
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: GEMINI_PROMPT },
              { inline_data: { mime_type: "image/jpeg", data: primaryImage } },
            ],
          }],
          generationConfig: { temperature: 0.10, maxOutputTokens: 400 },
        }),
      }
    );

    if (!geminiRes.ok) {
      return NextResponse.json({ error: `AI Error ${geminiRes.status}` }, { status: 502 });
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
      return NextResponse.json(
        { error: "AI বিশ্লেষণ পার্স করা যায়নি। ছবিটি স্পষ্ট কিনা দেখুন।" },
        { status: 422 }
      );
    }

    // ── Step 2: Validate AI output ───────────────────────
    const validBreeds = [
      "Local", "Local Cross", "Local Large Cross", "Friesian Cross",
      "Sahiwal Cross", "Brahman Cross", "Sindhi Cross", "Premium Cross", "Unknown Cross",
    ];
    const breed: string = validBreeds.includes(ai.breed ?? "")
      ? (ai.breed as string) : "Local Cross";

    const rawMin: number = Math.max(100, ai.weight_min ?? 250);
    const rawMax: number = Math.max(rawMin + 40, ai.weight_max ?? rawMin + 60);

    const validConditions = ["Thin", "Moderate", "Good Muscular", "Excellent Heavy"];
    const bodyCondition: string = validConditions.includes(ai.body_condition ?? "")
      ? (ai.body_condition as string) : "Moderate";

    const appearance:    string = ai.appearance_category === "premium" ? "premium" : "standard";
    const visualConf:    string = ["low","medium","high"].includes(ai.visual_confidence ?? "")
      ? (ai.visual_confidence as string) : "medium";
    const coatColor:     string = ai.coat_color ?? "unknown";

    // ── Step 3: Calibrate weight (now with dark coat correction) ─
    const calibrated = calibrateWeight(rawMin, rawMax, breed, coatColor, seller_claimed_weight);
    const { min: weightMin, max: weightMax, mid: weightMid } = calibrated;

    // ── Step 4: Market metrics ───────────────────────────
    const rate           = MARKET_RATES[breed]    ?? MARKET_RATES["Local Cross"];
    const dressing       = DRESSING_RATES[breed]  ?? 0.42;
    const meatYieldKg    = parseFloat((weightMid * dressing).toFixed(1));
    const priceMin       = Math.round((weightMid * rate.min) / 500) * 500;
    const priceMax       = Math.round((weightMid * rate.max) / 500) * 500;
    const avgPrice       = (priceMin + priceMax) / 2;
    const pricePerKgLive = Math.round(avgPrice / weightMid);
    const costPerKgMeat  = Math.round(avgPrice / meatYieldKg);
    const weightCategory = getWeightCategory(weightMid);
    const valueVerdict   = getValueVerdict(costPerKgMeat, breed, weightCategory);

    // ── Step 5: Qurbani estimate ─────────────────────────
    const qurbani = calcQurbaniEstimate(weightMid, breed, bodyCondition, appearance);

    // ── Step 6: Backend confidence ───────────────────────
    const confidence = calculateConfidence(
      rawMin, rawMax, calibrated, breed, visualConf, seller_claimed_weight
    );

    // ── Step 7: Fraud detection ──────────────────────────
    const { risk: fraudRisk, warning: fraudWarning } = calcFraudRisk(
      seller_claimed_weight, weightMax,
      seller_claimed_price, priceMax, qurbani.price_range_max
    );

    return NextResponse.json({
      // Weight
      estimated_weight:  `${weightMin}–${weightMax} কেজি`,
      weight_min:        weightMin,
      weight_max:        weightMax,
      weight_mid:        weightMid,
      weight_note:       calibrated.note || undefined,
      weight_category:   weightCategory,

      // AI Classification
      breed,
      body_condition:    bodyCondition,
      coat_color:        coatColor,
      hump_quality:      ai.hump_quality ?? "moderate",
      appearance,

      // Confidence
      confidence:        confidence.label,
      confidence_score:  confidence.score,
      confidence_band:   confidence.band,

      // Core metrics
      meat_yield:        `${meatYieldKg} কেজি`,
      meat_yield_kg:     meatYieldKg,
      dressing_rate:     dressing,
      price_range:       `৳${priceMin.toLocaleString()} – ৳${priceMax.toLocaleString()}`,
      price_min:         priceMin,
      price_max:         priceMax,
      price_per_kg_live: pricePerKgLive,
      cost_per_kg_meat:  costPerKgMeat,
      value_verdict:     valueVerdict,

      // Estimate A: Live rate model
      estimate_a: {
        label:             "ক্যালিব্রেটেড বাজার মূল্য",
        meat_yield_kg:     meatYieldKg,
        dressing_rate:     dressing,
        price_min:         priceMin,
        price_max:         priceMax,
        price_per_kg_live: pricePerKgLive,
        cost_per_kg_meat:  costPerKgMeat,
        value_verdict:     valueVerdict,
      },

      // Estimate B: Qurbani seasonal model
      estimate_b: {
        label:               "কোরবানির হাটের বাজার মূল্য",
        base_price_per_kg:   qurbani.base_price_per_kg,
        breed_multiplier:    qurbani.breed_multiplier,
        beauty_multiplier:   qurbani.beauty_multiplier,
        health_multiplier:   qurbani.health_multiplier,
        eid_premium:         qurbani.eid_premium,
        final_price:         qurbani.final_price,
        price_range_min:     qurbani.price_range_min,
        price_range_max:     qurbani.price_range_max,
        price_range:         `৳${qurbani.price_range_min.toLocaleString()} – ৳${qurbani.price_range_max.toLocaleString()}`,
        appearance_detected: qurbani.appearance_detected,
        explanation_bn:      qurbani.explanation_bn,
      },

      // Fraud detection
      fraud_risk:            fraudRisk !== "UNKNOWN" ? fraudRisk : undefined,
      fraud_warning:         fraudWarning || undefined,
      seller_claimed_weight: seller_claimed_weight ?? undefined,
      seller_claimed_price:  seller_claimed_price  ?? undefined,

      image_count: imageList.length,

      ...(process.env.NODE_ENV !== "production" && {
        _debug: {
          ai_raw:             `${rawMin}-${rawMax} kg`,
          ai_visual_conf:     visualConf,
          coat_color:         coatColor,
          dark_coat_factor:   getDarkCoatFactor(coatColor, (rawMin + rawMax) / 2),
          calibration_factor: calibrated.calibrationFactor,
          calibrated:         `${weightMin}-${weightMax} kg`,
        },
      }),
    });

  } catch (err) {
    console.error("Cowlytics error:", err);
    return NextResponse.json(
      { error: "সার্ভার সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।" },
      { status: 500 }
    );
  }
}