import { PARAMETERS, getStatus, getStatusLabel, calculateCorrections, buildSpeechScript } from './chemistry.js';
import { COLOR_CHARTS, matchColor, matchColorInterpolated, extractAverageColor } from './colorChart.js';
import { speak, stopSpeaking, isTTSAvailable, isSpeaking } from './speech.js';
import { downloadICS } from './calendar.js';

// ---- State ----
const state = {
  screen: 'home', // home | scan | analyze | results | corrections | settings | history
  volume: parseFloat(localStorage.getItem('sparobot_volume')) || 0,
  volumeUnit: localStorage.getItem('sparobot_volumeUnit') || 'gallons',
  sanitizerType: localStorage.getItem('sparobot_sanitizer') || 'chlorine',
  capturedImage: null,
  readings: {},
  corrections: [],
  history: JSON.parse(localStorage.getItem('sparobot_history') || '[]'),
  analysisStep: 0,
  analysisParams: [],
};

// ---- Settings persistence ----
function saveSettings() {
  localStorage.setItem('sparobot_volume', state.volume);
  localStorage.setItem('sparobot_volumeUnit', state.volumeUnit);
  localStorage.setItem('sparobot_sanitizer', state.sanitizerType);
}

function saveHistory() {
  // Keep last 50 readings
  if (state.history.length > 50) state.history = state.history.slice(-50);
  localStorage.setItem('sparobot_history', JSON.stringify(state.history));
}

function getVolumeInGallons() {
  return state.volumeUnit === 'liters' ? state.volume * 0.264172 : state.volume;
}

// ---- Analysis parameters based on sanitizer type ----
function getAnalysisParams() {
  if (state.sanitizerType === 'bromine') {
    return ['bromine', 'pH', 'totalAlkalinity', 'totalHardness'];
  }
  return ['freeChlorine', 'pH', 'totalAlkalinity', 'totalHardness', 'cyanuricAcid'];
}

// ---- Rendering ----
const app = document.getElementById('app');

function render() {
  // If no volume set, force settings
  if (state.volume <= 0 && state.screen !== 'settings') {
    state.screen = 'settings';
  }

  switch (state.screen) {
    case 'home': renderHome(); break;
    case 'analyze': renderAnalyze(); break;
    case 'results': renderResults(); break;
    case 'corrections': renderCorrections(); break;
    case 'settings': renderSettings(); break;
    case 'history': renderHistory(); break;
    default: renderHome();
  }
}

function renderHome() {
  const volDisplay = state.volume > 0
    ? `${state.volume.toLocaleString()} ${state.volumeUnit}`
    : 'Not set';

  app.innerHTML = `
    <div class="screen home-screen">
      <div class="hero">
        <div class="logo">
          <svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="none" stroke="#0891B2" stroke-width="3"/><path d="M32 16c-2 8-10 14-10 22a10 10 0 0020 0c0-8-8-14-10-22z" fill="#0891B2" opacity="0.2" stroke="#0891B2" stroke-width="2"/></svg>
        </div>
        <h1>SparoBot</h1>
        <p class="subtitle">Spa & Pool Water Tester</p>
      </div>

      <div class="info-card">
        <div class="info-row"><span>Volume</span><span>${volDisplay}</span></div>
        <div class="info-row"><span>Sanitizer</span><span>${state.sanitizerType === 'bromine' ? 'Bromine' : 'Chlorine'}</span></div>
        <div class="info-row"><span>Last Test</span><span>${state.history.length > 0 ? new Date(state.history[state.history.length - 1].date).toLocaleDateString() : 'Never'}</span></div>
      </div>

      <button class="btn btn-primary btn-large" id="btn-scan">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Scan Test Strip
      </button>

      <input type="file" id="camera-input" accept="image/*" capture="environment" style="display:none">

      <div class="btn-row">
        <button class="btn btn-secondary" id="btn-history">History</button>
        <button class="btn btn-secondary" id="btn-settings">Settings</button>
      </div>
    </div>
  `;

  document.getElementById('btn-scan').onclick = () => {
    document.getElementById('camera-input').click();
  };
  document.getElementById('camera-input').onchange = handleImageCapture;
  document.getElementById('btn-history').onclick = () => { state.screen = 'history'; render(); };
  document.getElementById('btn-settings').onclick = () => { state.screen = 'settings'; render(); };
}

function handleImageCapture(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      state.capturedImage = img;
      state.readings = {};
      state.analysisStep = 0;
      state.analysisParams = getAnalysisParams();
      state.screen = 'analyze';
      render();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function renderAnalyze() {
  const params = state.analysisParams;
  const step = state.analysisStep;

  if (step >= params.length) {
    // All done, go to results
    state.screen = 'results';
    render();
    return;
  }

  const paramKey = params[step];
  const chart = COLOR_CHARTS[paramKey];
  const progress = `${step + 1} / ${params.length}`;

  app.innerHTML = `
    <div class="screen analyze-screen">
      <div class="analyze-header">
        <button class="btn btn-icon" id="btn-back-analyze">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div class="analyze-progress">
          <span class="step-label">Step ${progress}</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${((step + 1) / params.length) * 100}%"></div></div>
        </div>
      </div>

      <div class="analyze-instruction">
        <h2>Tap the <strong>${chart.name}</strong> pad</h2>
        <p>Tap on the test strip pad in the photo below</p>
        <div class="color-ref">
          ${chart.colors.map(c =>
            `<div class="ref-swatch" style="background:rgb(${c.r},${c.g},${c.b})" title="${c.value}${PARAMETERS[paramKey].unit}">
              <span>${c.value}</span>
            </div>`
          ).join('')}
        </div>
      </div>

      <div class="canvas-container" id="canvas-container">
        <canvas id="photo-canvas"></canvas>
        <div class="tap-indicator" id="tap-indicator" style="display:none"></div>
      </div>

      <div class="sampled-result" id="sampled-result" style="display:none">
        <div class="sampled-color" id="sampled-color-swatch"></div>
        <div class="sampled-info">
          <span class="sampled-value" id="sampled-value"></span>
          <span class="sampled-confidence" id="sampled-confidence"></span>
        </div>
        <button class="btn btn-small btn-primary" id="btn-confirm">Confirm</button>
        <button class="btn btn-small btn-secondary" id="btn-retry">Retry</button>
      </div>
    </div>
  `;

  document.getElementById('btn-back-analyze').onclick = () => {
    if (step > 0) {
      state.analysisStep = step - 1;
      // Remove the last reading
      const prevKey = params[step - 1];
      delete state.readings[prevKey];
    } else {
      state.screen = 'home';
    }
    render();
  };

  // Draw image on canvas
  const canvas = document.getElementById('photo-canvas');
  const container = document.getElementById('canvas-container');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const img = state.capturedImage;
  // Scale image to fit container width (max 600px)
  const maxW = Math.min(container.clientWidth || 350, 600);
  const scale = maxW / img.width;
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let pendingMatch = null;

  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    // Extract color
    const color = extractAverageColor(canvas, ctx, x, y, 12);
    if (!color) return;

    // Match against chart
    const match = matchColorInterpolated(color.r, color.g, color.b, paramKey);
    if (!match) return;

    pendingMatch = { color, match };

    // Show tap indicator
    const indicator = document.getElementById('tap-indicator');
    const dispX = (x / canvas.width) * rect.width;
    const dispY = (y / canvas.height) * rect.height;
    indicator.style.display = 'block';
    indicator.style.left = `${dispX - 18}px`;
    indicator.style.top = `${dispY - 18}px`;

    // Show result
    const resultEl = document.getElementById('sampled-result');
    resultEl.style.display = 'flex';
    document.getElementById('sampled-color-swatch').style.background = `rgb(${color.r},${color.g},${color.b})`;

    const unit = PARAMETERS[paramKey].unit;
    const valStr = paramKey === 'pH' ? match.value.toFixed(1) : `${match.value} ${unit}`;
    document.getElementById('sampled-value').textContent = valStr;
    document.getElementById('sampled-confidence').textContent = `Confidence: ${match.confidence}`;
    document.getElementById('sampled-confidence').className = `sampled-confidence conf-${match.confidence}`;
  };

  // Confirm button
  setTimeout(() => {
    const confirmBtn = document.getElementById('btn-confirm');
    const retryBtn = document.getElementById('btn-retry');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        if (!pendingMatch) return;
        state.readings[paramKey] = pendingMatch.match.value;
        state.analysisStep = step + 1;
        render();
      };
    }
    if (retryBtn) {
      retryBtn.onclick = () => {
        pendingMatch = null;
        document.getElementById('sampled-result').style.display = 'none';
        document.getElementById('tap-indicator').style.display = 'none';
      };
    }
  }, 0);
}

function renderResults() {
  const params = state.analysisParams;
  const readings = state.readings;

  // Calculate corrections
  state.corrections = calculateCorrections(readings, getVolumeInGallons(), state.sanitizerType);

  // Build results rows
  const rows = params.map(key => {
    if (readings[key] === undefined) return '';
    const param = PARAMETERS[key];
    const val = readings[key];
    const status = getStatus(key, val);
    const statusLabel = getStatusLabel(status);
    const valStr = key === 'pH' ? val.toFixed(1) : `${val} ${param.unit}`;

    return `
      <div class="result-row status-${status}">
        <div class="result-name">${param.name}</div>
        <div class="result-value">${valStr}</div>
        <div class="result-status">${statusLabel}</div>
        <div class="result-range">${param.idealMin}${param.unit ? ' ' + param.unit : ''} - ${param.idealMax}${param.unit ? ' ' + param.unit : ''}</div>
      </div>
    `;
  }).join('');

  const allOk = params.every(k => readings[k] === undefined || getStatus(k, readings[k]) === 'ok');

  app.innerHTML = `
    <div class="screen results-screen">
      <div class="screen-header">
        <button class="btn btn-icon" id="btn-back-results">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h2>Test Results</h2>
        <button class="btn btn-icon" id="btn-speak">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
        </button>
      </div>

      <div class="results-card">
        <div class="results-header-row">
          <span>Parameter</span><span>Value</span><span>Status</span><span>Ideal</span>
        </div>
        ${rows}
      </div>

      ${allOk ? `
        <div class="all-ok-card">
          <h3>All Clear!</h3>
          <p>Your water chemistry is within ideal ranges. Enjoy your spa!</p>
        </div>
      ` : `
        <button class="btn btn-primary btn-large" id="btn-corrections">
          View Treatment Plan (${state.corrections.length} steps)
        </button>
      `}

      <button class="btn btn-secondary" id="btn-save-results">Save to History</button>
      <button class="btn btn-secondary" id="btn-new-scan">New Scan</button>
    </div>
  `;

  document.getElementById('btn-back-results').onclick = () => {
    state.screen = 'home';
    render();
  };

  document.getElementById('btn-speak').onclick = () => {
    if (isSpeaking()) {
      stopSpeaking();
    } else {
      const script = buildSpeechScript(readings, state.sanitizerType);
      speak(script);
    }
  };

  if (!allOk) {
    document.getElementById('btn-corrections').onclick = () => {
      state.screen = 'corrections';
      render();
    };
  }

  document.getElementById('btn-save-results').onclick = () => {
    state.history.push({
      date: new Date().toISOString(),
      readings: { ...readings },
      volume: state.volume,
      volumeUnit: state.volumeUnit,
      sanitizerType: state.sanitizerType,
    });
    saveHistory();
    alert('Results saved to history.');
  };

  document.getElementById('btn-new-scan').onclick = () => {
    state.screen = 'home';
    render();
  };

  // Auto-speak results
  if (isTTSAvailable()) {
    const script = buildSpeechScript(readings, state.sanitizerType);
    // Small delay to let the screen render
    setTimeout(() => speak(script), 500);
  }
}

function renderCorrections() {
  const corrections = state.corrections;

  const correctionCards = corrections.map((c, i) => `
    <div class="correction-card">
      <div class="correction-order">Step ${i + 1}</div>
      <div class="correction-param">${c.parameter}</div>
      <div class="correction-action">${c.action}</div>
      ${c.reason ? `
        <div class="correction-reason">
          <strong>Why this step?</strong>
          ${c.reason}
        </div>
      ` : ''}
      <div class="correction-detail">
        <div class="detail-row"><span>Chemical:</span><span>${c.chemical}</span></div>
        <div class="detail-row"><span>Amount:</span><span class="amount-highlight">${c.amount}</span></div>
        <div class="detail-row"><span>Wait:</span><span>${c.waitMinutes} minutes</span></div>
      </div>
      ${c.calcBreakdown ? `
        <div class="calc-breakdown">
          <strong>How this was calculated</strong>
          ${c.calcBreakdown.map(line => `<div class="calc-step">${line}</div>`).join('')}
        </div>
      ` : ''}
      <div class="correction-notes">${c.notes}</div>
    </div>
  `).join('');

  // Build speech text for corrections
  const corrSpeech = corrections.map((c, i) =>
    `Step ${i + 1}: ${c.action}. Add ${c.amount} of ${c.chemical}. Wait ${c.waitMinutes} minutes.`
  ).join(' ');

  app.innerHTML = `
    <div class="screen corrections-screen">
      <div class="screen-header">
        <button class="btn btn-icon" id="btn-back-corr">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h2>Treatment Plan</h2>
        <button class="btn btn-icon" id="btn-speak-corr">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>
        </button>
      </div>

      <div class="treatment-info">
        <h3>Why Treatment Order Matters</h3>
        <p>These steps follow a specific sequence because each chemical parameter affects the ones after it. Alkalinity buffers pH, pH controls sanitizer effectiveness, and sanitizer must be added to balanced water to work at full strength. Skipping ahead wastes chemicals and time.</p>
      </div>

      <div class="corrections-list">
        ${correctionCards}
      </div>

      <div class="calendar-section">
        <h3>Schedule Tasks</h3>
        <p>Add all steps to your calendar with timed reminders:</p>
        <div class="time-picker">
          <label>Start time:</label>
          <input type="datetime-local" id="start-time" value="${getDefaultStartTime()}">
        </div>
        <button class="btn btn-primary btn-large" id="btn-add-calendar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Add to Calendar
        </button>
      </div>

      <button class="btn btn-secondary" id="btn-home-corr">Done</button>
    </div>
  `;

  document.getElementById('btn-back-corr').onclick = () => { state.screen = 'results'; render(); };
  document.getElementById('btn-home-corr').onclick = () => { state.screen = 'home'; render(); };

  document.getElementById('btn-speak-corr').onclick = () => {
    if (isSpeaking()) {
      stopSpeaking();
    } else {
      speak(`Here is your treatment plan. ${corrSpeech} After all steps, retest your water.`);
    }
  };

  document.getElementById('btn-add-calendar').onclick = () => {
    const timeInput = document.getElementById('start-time');
    const startTime = new Date(timeInput.value);
    if (isNaN(startTime.getTime())) {
      alert('Please select a valid start time.');
      return;
    }
    downloadICS(corrections, startTime);
  };
}

function getDefaultStartTime() {
  const d = new Date(Date.now() + 30 * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toISOString().slice(0, 16);
}

function renderSettings() {
  const isFirstTime = state.volume <= 0;

  app.innerHTML = `
    <div class="screen settings-screen">
      <div class="screen-header">
        ${isFirstTime ? '' : `
          <button class="btn btn-icon" id="btn-back-settings">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
        `}
        <h2>${isFirstTime ? 'Welcome to SparoBot' : 'Settings'}</h2>
      </div>

      ${isFirstTime ? '<p class="welcome-text">Set up your spa or pool to get started.</p>' : ''}

      <div class="settings-card">
        <div class="field">
          <label for="volume-input">Water Volume</label>
          <div class="input-row">
            <input type="number" id="volume-input" value="${state.volume || ''}"
              placeholder="e.g. 400" inputmode="decimal" min="1" step="1">
            <select id="volume-unit">
              <option value="gallons" ${state.volumeUnit === 'gallons' ? 'selected' : ''}>Gallons</option>
              <option value="liters" ${state.volumeUnit === 'liters' ? 'selected' : ''}>Liters</option>
            </select>
          </div>
          <p class="field-hint">Typical hot tub: 300-500 gallons. Check your owner's manual.</p>
        </div>

        <div class="field">
          <label for="sanitizer-select">Sanitizer Type</label>
          <select id="sanitizer-select">
            <option value="chlorine" ${state.sanitizerType === 'chlorine' ? 'selected' : ''}>Chlorine</option>
            <option value="bromine" ${state.sanitizerType === 'bromine' ? 'selected' : ''}>Bromine</option>
          </select>
        </div>
      </div>

      <button class="btn btn-primary btn-large" id="btn-save-settings">
        ${isFirstTime ? 'Get Started' : 'Save Settings'}
      </button>

      ${!isFirstTime ? `
        <div class="settings-card danger-zone">
          <h3>Data</h3>
          <button class="btn btn-danger" id="btn-clear-history">Clear History</button>
          <button class="btn btn-danger" id="btn-reset-all">Reset All Data</button>
        </div>
      ` : ''}
    </div>
  `;

  if (!isFirstTime) {
    document.getElementById('btn-back-settings').onclick = () => { state.screen = 'home'; render(); };
    document.getElementById('btn-clear-history')?.addEventListener('click', () => {
      if (confirm('Clear all test history?')) {
        state.history = [];
        saveHistory();
        alert('History cleared.');
      }
    });
    document.getElementById('btn-reset-all')?.addEventListener('click', () => {
      if (confirm('Reset all data and settings?')) {
        localStorage.clear();
        location.reload();
      }
    });
  }

  document.getElementById('btn-save-settings').onclick = () => {
    const vol = parseFloat(document.getElementById('volume-input').value);
    if (!vol || vol <= 0) {
      alert('Please enter a valid water volume.');
      return;
    }
    state.volume = vol;
    state.volumeUnit = document.getElementById('volume-unit').value;
    state.sanitizerType = document.getElementById('sanitizer-select').value;
    saveSettings();
    state.screen = 'home';
    render();
  };
}

function renderHistory() {
  const entries = [...state.history].reverse();

  const rows = entries.length === 0
    ? '<p class="empty-msg">No test results saved yet. Scan a test strip to get started.</p>'
    : entries.map((entry, i) => {
      const date = new Date(entry.date);
      const readings = entry.readings;
      const paramKeys = Object.keys(readings);

      return `
        <div class="history-card">
          <div class="history-date">${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div class="history-readings">
            ${paramKeys.map(k => {
              const param = PARAMETERS[k];
              if (!param) return '';
              const val = readings[k];
              const status = getStatus(k, val);
              const valStr = k === 'pH' ? val.toFixed(1) : `${val}`;
              return `<span class="history-pill status-${status}">${param.name}: ${valStr}</span>`;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

  app.innerHTML = `
    <div class="screen history-screen">
      <div class="screen-header">
        <button class="btn btn-icon" id="btn-back-history">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h2>Test History</h2>
      </div>
      <div class="history-list">${rows}</div>
    </div>
  `;

  document.getElementById('btn-back-history').onclick = () => { state.screen = 'home'; render(); };
}

// ---- Init ----
render();

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => {
    console.log('SW registration failed:', err);
  });
}
