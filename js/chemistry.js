// Water chemistry data, ideal ranges, and dosage calculations for hot tubs/spas/pools
//
// TREATMENT ORDER: Alkalinity → pH → Hardness → Sanitizer → Stabilizer
// This sequence is critical because each parameter affects the ones after it.
// See calculateCorrections() for detailed rationale on each step.

export const PARAMETERS = {
  freeChlorine: {
    name: 'Free Chlorine',
    unit: 'ppm',
    idealMin: 3,
    idealMax: 5,
    levels: [0, 1, 2, 3, 5, 10],
  },
  totalChlorine: {
    name: 'Total Chlorine',
    unit: 'ppm',
    idealMin: 3,
    idealMax: 5,
    levels: [0, 0.5, 1, 2, 5, 10],
  },
  bromine: {
    name: 'Total Bromine',
    unit: 'ppm',
    idealMin: 4,
    idealMax: 6,
    levels: [0, 1, 2, 4, 10, 20],
  },
  pH: {
    name: 'pH',
    unit: '',
    idealMin: 7.2,
    idealMax: 7.8,
    levels: [6.4, 6.8, 7.2, 7.8, 8.4],
  },
  totalAlkalinity: {
    name: 'Total Alkalinity',
    unit: 'ppm',
    idealMin: 80,
    idealMax: 120,
    levels: [0, 40, 80, 120, 180, 240],
  },
  totalHardness: {
    name: 'Calcium Hardness',
    unit: 'ppm',
    idealMin: 175,
    idealMax: 250,
    levels: [0, 100, 200, 400, 800],
  },
  cyanuricAcid: {
    name: 'Cyanuric Acid',
    unit: 'ppm',
    idealMin: 30,
    idealMax: 50,
    levels: [0, 40, 70, 100, 150, 300],
  },
};

// Dosage data per 10,000 gallons
// Sources: Pool Chemistry Training Manual, APSP/PHTA standards, chemical manufacturer guidelines
const DOSAGES = {
  alkalinityUp: {
    chemical: 'Sodium Bicarbonate (Baking Soda)',
    per10kGal: 1.5, // lbs per 10 ppm increase per 10,000 gallons
    unit: 'lbs',
    ppmPer: 10,
  },
  phUp: {
    chemical: 'Soda Ash (Sodium Carbonate)',
    per10kGal: 6, // oz per 0.2 pH increase per 10,000 gallons
    unit: 'oz',
    phPer: 0.2,
  },
  phDown: {
    chemical: 'Sodium Bisulfate (pH Decreaser)',
    per10kGal: 12, // oz per 0.2 pH decrease per 10,000 gallons
    unit: 'oz',
    phPer: 0.2,
  },
  chlorineUp: {
    chemical: 'Sodium Dichlor (56% Chlorine Granules)',
    per10kGal: 2, // oz per 1.5 ppm increase per 10,000 gallons
    unit: 'oz',
    ppmPer: 1.5,
  },
  bromineUp: {
    chemical: 'Sodium Bromide + MPS Shock',
    per10kGal: 2, // oz per 2 ppm increase per 10,000 gallons
    unit: 'oz',
    ppmPer: 2,
  },
  hardnessUp: {
    chemical: 'Calcium Chloride',
    per10kGal: 1.25, // lbs per 10 ppm increase per 10,000 gallons
    unit: 'lbs',
    ppmPer: 10,
  },
  cyaUp: {
    chemical: 'Cyanuric Acid (Stabilizer)',
    per10kGal: 1, // lbs per 12 ppm increase per 10,000 gallons
    unit: 'lbs',
    ppmPer: 12,
  },
};

export function getStatus(paramKey, value) {
  const param = PARAMETERS[paramKey];
  if (!param) return 'unknown';
  if (value < param.idealMin) return 'low';
  if (value > param.idealMax) return 'high';
  return 'ok';
}

export function getStatusLabel(status) {
  switch (status) {
    case 'low': return 'LOW';
    case 'high': return 'HIGH';
    case 'ok': return 'OK';
    default: return '?';
  }
}

function formatAmount(value, unit) {
  if (unit === 'oz') {
    if (value < 0.5) return `${Math.round(value * 6)} teaspoons`;
    if (value < 1) return `${(value * 2).toFixed(1)} tablespoons`;
    if (value < 4) return `${value.toFixed(1)} oz`;
    return `${value.toFixed(1)} oz (${(value / 16).toFixed(2)} lbs)`;
  }
  if (unit === 'lbs') {
    if (value < 0.03) return `${Math.round(value * 96)} teaspoons`;
    if (value < 0.0625) return `${(value * 32).toFixed(1)} tablespoons`;
    if (value < 0.25) return `${(value * 16).toFixed(1)} oz`;
    return `${value.toFixed(2)} lbs (${(value * 16).toFixed(1)} oz)`;
  }
  return `${value.toFixed(2)} ${unit}`;
}

// Calculate corrections needed and return them in priority order.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ TREATMENT ORDER RATIONALE                                          │
// ├─────────────────────────────────────────────────────────────────────┤
// │ 1. Total Alkalinity                                                │
// │    TA is the pH buffering system. Adjusting pH before TA is stable │
// │    causes pH drift, wasting chemicals. Correct the buffer first.   │
// │                                                                    │
// │ 2. pH                                                              │
// │    Controls sanitizer effectiveness. At pH 7.2, free chlorine is   │
// │    ~65% hypochlorous acid (active form). At pH 8.0 only ~22%.     │
// │    Also affects bather comfort and equipment corrosion.            │
// │                                                                    │
// │ 3. Calcium Hardness                                                │
// │    Determines water balance (Langelier Saturation Index). Low CH   │
// │    = corrosive water that pits metal and etches surfaces. High CH  │
// │    = scale deposits. Independent of pH/TA but needed before        │
// │    sanitizer to prevent equipment damage.                          │
// │                                                                    │
// │ 4. Sanitizer (Chlorine or Bromine)                                 │
// │    Must follow pH/TA correction so it works at max efficiency.     │
// │    Adding sanitizer to imbalanced water wastes product and leaves  │
// │    water under-protected.                                          │
// │                                                                    │
// │ 5. Cyanuric Acid (Chlorine systems only)                           │
// │    UV stabilizer that shields chlorine from sunlight degradation.  │
// │    Only relevant outdoors. Dissolves very slowly (24+ hours).      │
// │    Low urgency, long-term maintenance adjustment.                  │
// └─────────────────────────────────────────────────────────────────────┘
//
// DOSAGE FORMULA (linear scaling):
//   amount = (needed_change / rate_per_unit) × dosage_per_10k_gal × (volume / 10000)
//
export function calculateCorrections(readings, volumeGallons, sanitizerType = 'chlorine') {
  const corrections = [];
  const scale = volumeGallons / 10000;
  const volLabel = Math.round(volumeGallons).toLocaleString();

  // ── Step 1: Total Alkalinity ──────────────────────────────────────
  // Always first — TA is the pH buffer. If TA is wrong, pH won't hold.
  if (readings.totalAlkalinity !== undefined) {
    const val = readings.totalAlkalinity;
    const p = PARAMETERS.totalAlkalinity;
    const target = (p.idealMin + p.idealMax) / 2;
    if (val < p.idealMin) {
      const ppmNeeded = target - val;
      const d = DOSAGES.alkalinityUp;
      const amt = (ppmNeeded / d.ppmPer) * d.per10kGal * scale;
      corrections.push({
        order: 1,
        parameter: 'Total Alkalinity',
        action: `Raise from ${val} to ~${Math.round(target)} ppm`,
        chemical: d.chemical,
        amount: formatAmount(amt, d.unit),
        waitMinutes: 20,
        reason: 'Total Alkalinity is your pH buffering system. If TA is low, pH will swing wildly and won\'t hold after adjustment. Stabilizing the buffer first ensures all subsequent pH changes stick.',
        calcBreakdown: [
          `Target: ${Math.round(target)} ppm (midpoint of ${p.idealMin}\u2013${p.idealMax} ideal range)`,
          `Raise by: ${ppmNeeded} ppm`,
          `Dosage rate: ${d.per10kGal} lbs per ${d.ppmPer} ppm per 10,000 gal`,
          `Your spa (${volLabel} gal): (${ppmNeeded} \u00F7 ${d.ppmPer}) \u00D7 ${d.per10kGal} \u00D7 ${scale.toFixed(4)} = ${amt.toFixed(3)} lbs`,
        ],
        notes: 'Add slowly with pump running. Retest after 20 minutes.',
      });
    } else if (val > p.idealMax) {
      const excess = val - p.idealMax;
      const amt = excess * 0.1 * scale;
      corrections.push({
        order: 1,
        parameter: 'Total Alkalinity',
        action: `Lower from ${val} to ~${p.idealMax} ppm`,
        chemical: 'Sodium Bisulfate (pH Decreaser)',
        amount: formatAmount(amt, 'oz'),
        waitMinutes: 20,
        reason: 'High alkalinity resists pH changes and tends to push pH upward. Lowering TA first prevents fighting against the buffer when adjusting pH in the next step.',
        calcBreakdown: [
          `Target: \u2264${p.idealMax} ppm (top of ideal range)`,
          `Excess: ${excess} ppm over maximum`,
          `Approximate rate: 0.1 oz per 1 ppm reduction per 10,000 gal`,
          `Your spa (${volLabel} gal): ${excess} \u00D7 0.1 \u00D7 ${scale.toFixed(4)} = ${amt.toFixed(2)} oz`,
        ],
        notes: 'Add pH decreaser. This will also lower pH. Aerate to raise pH back if needed.',
      });
    }
  }

  // ── Step 2: pH ────────────────────────────────────────────────────
  // After TA is correct, pH adjustments will hold. pH directly controls
  // sanitizer kill rate and bather comfort.
  if (readings.pH !== undefined) {
    const val = readings.pH;
    const p = PARAMETERS.pH;
    const target = 7.5;
    if (val < p.idealMin) {
      const phNeeded = target - val;
      const d = DOSAGES.phUp;
      const amt = (phNeeded / d.phPer) * d.per10kGal * scale;
      corrections.push({
        order: 2,
        parameter: 'pH',
        action: `Raise from ${val.toFixed(1)} to ~${target}`,
        chemical: d.chemical,
        amount: formatAmount(amt, d.unit),
        waitMinutes: 20,
        reason: 'pH directly controls sanitizer strength. At pH 7.5, chlorine is about 50% active as hypochlorous acid. Below 7.2, water becomes corrosive and irritates skin. Adjusted after alkalinity so the buffer holds this change.',
        calcBreakdown: [
          `Target: ${target} (center of ${p.idealMin}\u2013${p.idealMax} ideal range)`,
          `Raise by: ${phNeeded.toFixed(1)} pH units`,
          `Dosage rate: ${d.per10kGal} oz per ${d.phPer} pH per 10,000 gal`,
          `Your spa (${volLabel} gal): (${phNeeded.toFixed(1)} \u00F7 ${d.phPer}) \u00D7 ${d.per10kGal} \u00D7 ${scale.toFixed(4)} = ${amt.toFixed(2)} oz`,
        ],
        notes: 'Add with pump running. Wait 20 min and retest.',
      });
    } else if (val > p.idealMax) {
      const phNeeded = val - target;
      const d = DOSAGES.phDown;
      const amt = (phNeeded / d.phPer) * d.per10kGal * scale;
      corrections.push({
        order: 2,
        parameter: 'pH',
        action: `Lower from ${val.toFixed(1)} to ~${target}`,
        chemical: d.chemical,
        amount: formatAmount(amt, d.unit),
        waitMinutes: 20,
        reason: 'High pH dramatically reduces sanitizer effectiveness \u2014 at pH 8.0, chlorine is only ~22% active. It also causes cloudy water and scale buildup. Adjusted after alkalinity so the buffer holds this change.',
        calcBreakdown: [
          `Target: ${target} (center of ${p.idealMin}\u2013${p.idealMax} ideal range)`,
          `Lower by: ${phNeeded.toFixed(1)} pH units`,
          `Dosage rate: ${d.per10kGal} oz per ${d.phPer} pH per 10,000 gal`,
          `Your spa (${volLabel} gal): (${phNeeded.toFixed(1)} \u00F7 ${d.phPer}) \u00D7 ${d.per10kGal} \u00D7 ${scale.toFixed(4)} = ${amt.toFixed(2)} oz`,
        ],
        notes: 'Add with pump running. Wait 20 min and retest.',
      });
    }
  }

  // ── Step 3: Calcium Hardness ──────────────────────────────────────
  // Independent of pH/TA but affects water balance (LSI). Low hardness
  // = corrosive water that attacks equipment. Must be correct before
  // adding sanitizer.
  if (readings.totalHardness !== undefined) {
    const val = readings.totalHardness;
    const p = PARAMETERS.totalHardness;
    const target = (p.idealMin + p.idealMax) / 2;
    if (val < p.idealMin) {
      const ppmNeeded = target - val;
      const d = DOSAGES.hardnessUp;
      const amt = (ppmNeeded / d.ppmPer) * d.per10kGal * scale;
      corrections.push({
        order: 3,
        parameter: 'Calcium Hardness',
        action: `Raise from ${val} to ~${Math.round(target)} ppm`,
        chemical: d.chemical,
        amount: formatAmount(amt, d.unit),
        waitMinutes: 20,
        reason: 'Low calcium makes water "aggressive" \u2014 it dissolves minerals from grout, plaster, metal fittings, and heater elements to satisfy its mineral demand. Corrected before sanitizer since corrosive water degrades chlorine faster.',
        calcBreakdown: [
          `Target: ${Math.round(target)} ppm (midpoint of ${p.idealMin}\u2013${p.idealMax} ideal range)`,
          `Raise by: ${ppmNeeded} ppm`,
          `Dosage rate: ${d.per10kGal} lbs per ${d.ppmPer} ppm per 10,000 gal`,
          `Your spa (${volLabel} gal): (${ppmNeeded} \u00F7 ${d.ppmPer}) \u00D7 ${d.per10kGal} \u00D7 ${scale.toFixed(4)} = ${amt.toFixed(3)} lbs`,
        ],
        notes: 'Pre-dissolve in warm water before adding to spa.',
      });
    } else if (val > p.idealMax) {
      const pct = Math.round((1 - p.idealMax / val) * 100);
      corrections.push({
        order: 3,
        parameter: 'Calcium Hardness',
        action: `Lower from ${val} ppm (too high)`,
        chemical: 'Partial Water Replacement',
        amount: `Drain ~${pct}% and refill with fresh water`,
        waitMinutes: 60,
        reason: 'High calcium causes white scale deposits on surfaces, jets, and heater elements. There is no chemical that removes dissolved calcium \u2014 dilution with fresh water is the only solution.',
        calcBreakdown: [
          `Current: ${val} ppm (maximum: ${p.idealMax} ppm)`,
          `Dilution needed: ~${pct}% water replacement`,
          `Formula: 1 \u2212 (${p.idealMax} \u00F7 ${val}) = ${(1 - p.idealMax / val).toFixed(2)} \u2248 ${pct}%`,
        ],
        notes: 'Only way to lower calcium hardness is dilution.',
      });
    }
  }

  // ── Step 4: Sanitizer ─────────────────────────────────────────────
  // Must come after pH/TA are correct. Sanitizer effectiveness depends
  // entirely on water balance being in range first.
  const sanKey = sanitizerType === 'bromine' ? 'bromine' : 'freeChlorine';
  if (readings[sanKey] !== undefined) {
    const val = readings[sanKey];
    const p = PARAMETERS[sanKey];
    const target = (p.idealMin + p.idealMax) / 2;
    if (val < p.idealMin) {
      const ppmNeeded = target - val;
      const dKey = sanitizerType === 'bromine' ? 'bromineUp' : 'chlorineUp';
      const d = DOSAGES[dKey];
      const amt = (ppmNeeded / d.ppmPer) * d.per10kGal * scale;
      corrections.push({
        order: 4,
        parameter: p.name,
        action: `Raise from ${val} to ~${target} ppm`,
        chemical: d.chemical,
        amount: formatAmount(amt, d.unit),
        waitMinutes: 15,
        reason: `Sanitizer is added after pH and alkalinity are correct because its effectiveness depends entirely on water balance. At the proper pH of 7.2\u20137.8, ${sanitizerType === 'bromine' ? 'bromine' : 'chlorine'} works at maximum killing power against bacteria and algae.`,
        calcBreakdown: [
          `Target: ${target} ppm (midpoint of ${p.idealMin}\u2013${p.idealMax} ideal range)`,
          `Raise by: ${ppmNeeded} ppm`,
          `Dosage rate: ${d.per10kGal} oz per ${d.ppmPer} ppm per 10,000 gal`,
          `Your spa (${volLabel} gal): (${ppmNeeded} \u00F7 ${d.ppmPer}) \u00D7 ${d.per10kGal} \u00D7 ${scale.toFixed(4)} = ${amt.toFixed(2)} oz`,
        ],
        notes: `Add with pump running. Wait 15 min and retest. Don't enter spa until level is safe.`,
      });
    } else if (val > p.idealMax) {
      corrections.push({
        order: 4,
        parameter: p.name,
        action: `${p.name} is high at ${val} ppm`,
        chemical: 'Wait & Aerate',
        amount: 'Leave cover off, run jets',
        waitMinutes: 30,
        reason: `High ${p.name.toLowerCase()} levels dissipate naturally through aeration and UV exposure. No chemical neutralizer is needed \u2014 time and air circulation bring levels down safely.`,
        calcBreakdown: [
          `Current: ${val} ppm (maximum safe: ${p.idealMax} ppm)`,
          `No chemical dosage \u2014 natural dissipation through aeration`,
          `Running jets with cover off accelerates the process`,
        ],
        notes: `Do not use spa until ${p.name.toLowerCase()} drops below ${p.idealMax} ppm.`,
      });
    }
  }

  // ── Step 5: Cyanuric Acid (chlorine systems only) ─────────────────
  // UV stabilizer. Very slow to dissolve (24+ hours). Low urgency,
  // long-term maintenance. Only relevant for outdoor installations.
  if (sanitizerType === 'chlorine' && readings.cyanuricAcid !== undefined) {
    const val = readings.cyanuricAcid;
    const p = PARAMETERS.cyanuricAcid;
    const target = (p.idealMin + p.idealMax) / 2;
    if (val < p.idealMin) {
      const ppmNeeded = target - val;
      const d = DOSAGES.cyaUp;
      const amt = (ppmNeeded / d.ppmPer) * d.per10kGal * scale;
      corrections.push({
        order: 5,
        parameter: 'Cyanuric Acid',
        action: `Raise from ${val} to ~${Math.round(target)} ppm`,
        chemical: d.chemical,
        amount: formatAmount(amt, d.unit),
        waitMinutes: 30,
        reason: 'Cyanuric acid (CYA) forms a protective bond around chlorine molecules, shielding them from UV destruction. Without it, sunlight destroys ~90% of free chlorine within 2 hours. Done last because CYA dissolves very slowly (24+ hours for full effect).',
        calcBreakdown: [
          `Target: ${Math.round(target)} ppm (midpoint of ${p.idealMin}\u2013${p.idealMax} ideal range)`,
          `Raise by: ${ppmNeeded} ppm`,
          `Dosage rate: ${d.per10kGal} lbs per ${d.ppmPer} ppm per 10,000 gal`,
          `Your spa (${volLabel} gal): (${ppmNeeded} \u00F7 ${d.ppmPer}) \u00D7 ${d.per10kGal} \u00D7 ${scale.toFixed(4)} = ${amt.toFixed(3)} lbs`,
        ],
        notes: 'Dissolve in warm water. CYA is slow to dissolve; retest after 24 hours.',
      });
    } else if (val > p.idealMax) {
      const pct = Math.round((1 - p.idealMax / val) * 100);
      corrections.push({
        order: 5,
        parameter: 'Cyanuric Acid',
        action: `CYA too high at ${val} ppm`,
        chemical: 'Partial Water Replacement',
        amount: `Drain ~${pct}% and refill`,
        waitMinutes: 60,
        reason: 'Excess CYA "locks up" chlorine \u2014 it over-stabilizes the sanitizer so it can\'t effectively kill bacteria (called "chlorine lock"). Like calcium, CYA cannot be chemically removed; dilution is the only solution.',
        calcBreakdown: [
          `Current: ${val} ppm (maximum: ${p.idealMax} ppm)`,
          `Dilution needed: ~${pct}% water replacement`,
          `Formula: 1 \u2212 (${p.idealMax} \u00F7 ${val}) = ${(1 - p.idealMax / val).toFixed(2)} \u2248 ${pct}%`,
        ],
        notes: 'High CYA reduces sanitizer effectiveness. Dilution is the only fix.',
      });
    }
  }

  return corrections.sort((a, b) => a.order - b.order);
}

// Build a spoken summary of the test results
export function buildSpeechScript(readings, sanitizerType = 'chlorine') {
  const lines = ['Here are your spa water test results.'];

  const paramsToRead = sanitizerType === 'bromine'
    ? ['pH', 'totalAlkalinity', 'totalHardness', 'bromine']
    : ['pH', 'totalAlkalinity', 'totalHardness', 'freeChlorine', 'cyanuricAcid'];

  for (const key of paramsToRead) {
    if (readings[key] === undefined) continue;
    const val = readings[key];
    const param = PARAMETERS[key];
    const status = getStatus(key, val);
    const statusWord = status === 'ok' ? 'in the ideal range'
      : status === 'low' ? 'low' : 'high';

    if (key === 'pH') {
      lines.push(`pH is ${val.toFixed(1)}, which is ${statusWord}.`);
    } else {
      lines.push(`${param.name} is ${val} ${param.unit}, which is ${statusWord}.`);
    }
  }

  return lines.join(' ');
}
