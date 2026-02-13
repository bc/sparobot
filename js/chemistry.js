// Water chemistry data, ideal ranges, and dosage calculations for hot tubs/spas/pools

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
const DOSAGES = {
  alkalinityUp: {
    chemical: 'Sodium Bicarbonate (Baking Soda)',
    per10kGal: 1.5, // lbs per 10 ppm increase
    unit: 'lbs',
    ppmPer: 10,
  },
  phUp: {
    chemical: 'Soda Ash (Sodium Carbonate)',
    per10kGal: 6, // oz per 0.2 pH increase
    unit: 'oz',
    phPer: 0.2,
  },
  phDown: {
    chemical: 'Sodium Bisulfate (pH Decreaser)',
    per10kGal: 12, // oz per 0.2 pH decrease
    unit: 'oz',
    phPer: 0.2,
  },
  chlorineUp: {
    chemical: 'Sodium Dichlor (56% Chlorine Granules)',
    per10kGal: 2, // oz per 1.5 ppm increase
    unit: 'oz',
    ppmPer: 1.5,
  },
  bromineUp: {
    chemical: 'Sodium Bromide + MPS Shock',
    per10kGal: 2, // oz per 2 ppm increase
    unit: 'oz',
    ppmPer: 2,
  },
  hardnessUp: {
    chemical: 'Calcium Chloride',
    per10kGal: 1.25, // lbs per 10 ppm increase
    unit: 'lbs',
    ppmPer: 10,
  },
  cyaUp: {
    chemical: 'Cyanuric Acid (Stabilizer)',
    per10kGal: 1, // lbs per 12 ppm increase
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

// Calculate corrections needed and return them in priority order
export function calculateCorrections(readings, volumeGallons, sanitizerType = 'chlorine') {
  const corrections = [];
  const scale = volumeGallons / 10000;

  // 1. Total Alkalinity (always first - affects pH)
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
        notes: 'Add slowly with pump running. Retest after 20 minutes.',
      });
    } else if (val > p.idealMax) {
      corrections.push({
        order: 1,
        parameter: 'Total Alkalinity',
        action: `Lower from ${val} to ~${p.idealMax} ppm`,
        chemical: 'Sodium Bisulfate (pH Decreaser)',
        amount: formatAmount((val - p.idealMax) * 0.1 * scale, 'oz'),
        waitMinutes: 20,
        notes: 'Add pH decreaser. This will also lower pH. Aerate to raise pH back if needed.',
      });
    }
  }

  // 2. pH (after alkalinity since TA changes affect pH)
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
        notes: 'Add with pump running. Wait 20 min and retest.',
      });
    }
  }

  // 3. Calcium Hardness
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
        notes: 'Only way to lower calcium hardness is dilution.',
      });
    }
  }

  // 4. Sanitizer
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
        notes: `Do not use spa until ${p.name.toLowerCase()} drops below ${p.idealMax} ppm.`,
      });
    }
  }

  // 5. Cyanuric Acid (chlorine only)
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
