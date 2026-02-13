// Color reference charts for pool/spa test strips and color matching algorithm
// RGB values are approximations of common 7-in-1 test strip colors (AquaChek/Taylor style)

// Reference color data: each parameter has an array of { value, r, g, b }
// Colors are based on standard DPD (chlorine), phenol red (pH), and other common indicators

export const COLOR_CHARTS = {
  freeChlorine: {
    name: 'Free Chlorine',
    key: 'freeChlorine',
    colors: [
      { value: 0,  r: 255, g: 248, b: 240 }, // off-white / no color
      { value: 1,  r: 255, g: 210, b: 210 }, // very light pink
      { value: 2,  r: 255, g: 170, b: 170 }, // light pink
      { value: 3,  r: 245, g: 130, b: 145 }, // medium pink
      { value: 5,  r: 220, g: 80,  b: 110 }, // dark pink
      { value: 10, r: 190, g: 40,  b: 80  }, // deep magenta
    ],
  },
  totalChlorine: {
    name: 'Total Chlorine',
    key: 'totalChlorine',
    colors: [
      { value: 0,   r: 255, g: 248, b: 240 },
      { value: 0.5, r: 255, g: 225, b: 220 },
      { value: 1,   r: 255, g: 195, b: 185 },
      { value: 2,   r: 250, g: 150, b: 135 },
      { value: 5,   r: 225, g: 95,  b: 80  },
      { value: 10,  r: 195, g: 55,  b: 40  },
    ],
  },
  bromine: {
    name: 'Total Bromine',
    key: 'bromine',
    colors: [
      { value: 0,  r: 255, g: 250, b: 240 },
      { value: 1,  r: 255, g: 225, b: 210 },
      { value: 2,  r: 255, g: 195, b: 175 },
      { value: 4,  r: 245, g: 145, b: 125 },
      { value: 10, r: 220, g: 90,  b: 70  },
      { value: 20, r: 185, g: 50,  b: 35  },
    ],
  },
  pH: {
    name: 'pH',
    key: 'pH',
    colors: [
      { value: 6.4, r: 235, g: 200, b: 65  }, // yellow
      { value: 6.8, r: 225, g: 180, b: 55  }, // yellow-orange
      { value: 7.2, r: 215, g: 150, b: 55  }, // orange
      { value: 7.8, r: 195, g: 105, b: 60  }, // orange-red
      { value: 8.4, r: 165, g: 65,  b: 85  }, // red-purple
    ],
  },
  totalAlkalinity: {
    name: 'Total Alkalinity',
    key: 'totalAlkalinity',
    colors: [
      { value: 0,   r: 225, g: 210, b: 55  }, // yellow
      { value: 40,  r: 185, g: 210, b: 60  }, // yellow-green
      { value: 80,  r: 110, g: 190, b: 75  }, // green
      { value: 120, r: 60,  g: 160, b: 70  }, // medium green
      { value: 180, r: 45,  g: 135, b: 100 }, // teal
      { value: 240, r: 40,  g: 110, b: 135 }, // blue-green
    ],
  },
  totalHardness: {
    name: 'Calcium Hardness',
    key: 'totalHardness',
    colors: [
      { value: 0,   r: 55,  g: 170, b: 135 }, // teal
      { value: 100, r: 75,  g: 120, b: 180 }, // blue
      { value: 200, r: 110, g: 90,  b: 170 }, // purple
      { value: 400, r: 155, g: 60,  b: 130 }, // magenta
      { value: 800, r: 200, g: 45,  b: 80  }, // deep rose
    ],
  },
  cyanuricAcid: {
    name: 'Cyanuric Acid',
    key: 'cyanuricAcid',
    colors: [
      { value: 0,   r: 235, g: 220, b: 195 }, // light beige
      { value: 40,  r: 200, g: 180, b: 140 }, // tan
      { value: 70,  r: 175, g: 155, b: 115 }, // medium tan
      { value: 100, r: 145, g: 125, b: 90  }, // brown
      { value: 150, r: 115, g: 95,  b: 65  }, // dark brown
      { value: 300, r: 80,  g: 65,  b: 45  }, // very dark brown
    ],
  },
};

// --- Color space conversion and matching ---

// sRGB (0-1) to CIELAB
function rgbToLab(r, g, b) {
  // Linearize sRGB
  const linearize = c => c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  const rL = linearize(r);
  const gL = linearize(g);
  const bL = linearize(b);

  // Linear RGB to XYZ (D65)
  const x = rL * 0.4124564 + gL * 0.3575761 + bL * 0.1804375;
  const y = rL * 0.2126729 + gL * 0.7151522 + bL * 0.0721750;
  const z = rL * 0.0193339 + gL * 0.1191920 + bL * 0.9503041;

  // XYZ to Lab
  const xRef = 0.95047, yRef = 1.0, zRef = 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : (t * 7.787) + 16 / 116;

  const fx = f(x / xRef);
  const fy = f(y / yRef);
  const fz = f(z / zRef);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

// CIE76 Delta-E (Euclidean distance in Lab space)
function deltaE76(lab1, lab2) {
  const dl = lab1.l - lab2.l;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

// Match a sampled RGB color against a reference chart
// Returns { value, deltaE, refColor } for the best match
export function matchColor(sampledR, sampledG, sampledB, chartKey) {
  const chart = COLOR_CHARTS[chartKey];
  if (!chart) return null;

  const sampledLab = rgbToLab(sampledR / 255, sampledG / 255, sampledB / 255);

  let bestMatch = null;
  let bestDeltaE = Infinity;

  for (const ref of chart.colors) {
    const refLab = rgbToLab(ref.r / 255, ref.g / 255, ref.b / 255);
    const dE = deltaE76(sampledLab, refLab);
    if (dE < bestDeltaE) {
      bestDeltaE = dE;
      bestMatch = ref;
    }
  }

  return {
    value: bestMatch.value,
    deltaE: bestDeltaE,
    refColor: bestMatch,
  };
}

// Interpolated match: use inverse-distance weighting between two closest matches
export function matchColorInterpolated(sampledR, sampledG, sampledB, chartKey) {
  const chart = COLOR_CHARTS[chartKey];
  if (!chart) return null;

  const sampledLab = rgbToLab(sampledR / 255, sampledG / 255, sampledB / 255);

  const matches = chart.colors.map(ref => {
    const refLab = rgbToLab(ref.r / 255, ref.g / 255, ref.b / 255);
    return { ref, deltaE: deltaE76(sampledLab, refLab) };
  }).sort((a, b) => a.deltaE - b.deltaE);

  const m1 = matches[0];
  const m2 = matches[1];

  // If perfect match, return directly
  if (m1.deltaE < 1) return { value: m1.ref.value, deltaE: m1.deltaE, confidence: 'high' };

  // Inverse-distance weighted interpolation
  const w1 = 1 / Math.max(m1.deltaE, 0.001);
  const w2 = 1 / Math.max(m2.deltaE, 0.001);
  const value = (m1.ref.value * w1 + m2.ref.value * w2) / (w1 + w2);

  // Confidence based on deltaE of best match
  const confidence = m1.deltaE < 10 ? 'high' : m1.deltaE < 25 ? 'medium' : 'low';

  return {
    value: Math.round(value * 10) / 10, // round to 1 decimal
    deltaE: m1.deltaE,
    confidence,
  };
}

// Extract average color from a rectangular region of an image (via canvas)
export function extractAverageColor(canvas, ctx, x, y, sampleRadius = 15) {
  const size = sampleRadius * 2;
  const sx = Math.max(0, Math.round(x - sampleRadius));
  const sy = Math.max(0, Math.round(y - sampleRadius));
  const sw = Math.min(size, canvas.width - sx);
  const sh = Math.min(size, canvas.height - sy);

  if (sw <= 0 || sh <= 0) return null;

  const imageData = ctx.getImageData(sx, sy, sw, sh);
  const data = imageData.data;
  const pixelCount = sw * sh;

  let totalR = 0, totalG = 0, totalB = 0;
  for (let i = 0; i < data.length; i += 4) {
    totalR += data[i];
    totalG += data[i + 1];
    totalB += data[i + 2];
  }

  return {
    r: Math.round(totalR / pixelCount),
    g: Math.round(totalG / pixelCount),
    b: Math.round(totalB / pixelCount),
  };
}
