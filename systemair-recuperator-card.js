/**
 * Systemair Recuperator Lovelace Card
 * Custom Home Assistant card for Systemair SAVE ventilation and heat recovery units.
 * Features:
 * - Real-time animated airflow paths (SVG + CSS dashoffset)
 * - Rotating dual centrifugal fans with RPM-synchronized speed
 * - Animated rotating rotary heat exchanger (rotor) with efficiency %
 * - Interactive heating coil visualization with active glow
 * - Preset modes, fan speed selector, target temperature control
 * - Quick toggles for Heater, Eco Mode, and Free Cooling
 * - Hardware accelerated animations with auto-pause on idle / hidden tab
 * - Optimistic UI with debounced service calls
 * Version: 1.0.0
 */

class SystemairRecuperatorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = {};
    this._targetTempDebounce = null;
    this._optimisticTargetTemp = null;
    this._optimisticFanSpeed = null;
    this._optimisticPreset = null;
    this._optimisticSwitches = {};
    this._isTabVisible = true;

    document.addEventListener('visibilitychange', () => {
      this._isTabVisible = !document.hidden;
      this._updateAnimationState();
    });
  }

  static getStubConfig() {
    return {
      type: 'custom:systemair-recuperator-card',
      climate: 'climate.systemair',
      title: 'Systemair SAVE'
    };
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    this._config = {
      title: 'Systemair SAVE',
      climate: 'climate.systemair',
      ...config
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._updateData();
  }

  // Auto-discover entities matching prefix if not explicitly configured
  _getEntity(type, defaultSuffix) {
    if (this._config.entities && this._config.entities[type]) {
      return this._hass.states[this._config.entities[type]];
    }
    const climateId = this._config.climate || 'climate.systemair';
    const prefix = climateId.replace(/^climate\./, '');

    // Try standard candidate entity IDs
    const candidates = [
      `sensor.${prefix}_${defaultSuffix}`,
      `sensor.systemair_${defaultSuffix}`,
      `switch.${prefix}_${defaultSuffix}`,
      `switch.systemair_${defaultSuffix}`
    ];

    for (const id of candidates) {
      if (this._hass.states[id]) {
        return this._hass.states[id];
      }
    }

    // Try finding by ending pattern
    for (const [id, state] of Object.entries(this._hass.states)) {
      if (id.includes('systemair') && id.endsWith(defaultSuffix)) {
        return state;
      }
    }
    return null;
  }

  _getState(entity) {
    if (!entity || entity.state === undefined || entity.state === 'unavailable' || entity.state === 'unknown') {
      return null;
    }
    return entity.state;
  }

  _getFloat(entity) {
    const s = this._getState(entity);
    if (s === null) return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --card-bg: var(--ha-card-background, var(--card-background-color, #171b24));
          --card-border-radius: var(--ha-card-border-radius, 16px);
          --text-primary: var(--primary-text-color, #f1f5f9);
          --text-secondary: var(--secondary-text-color, #94a3b8);
          --accent-cyan: #38bdf8;
          --accent-blue: #60a5fa;
          --accent-warm: #fbbf24;
          --accent-orange: #f97316;
          --accent-green: #34d399;
          --glow-cyan: rgba(56, 189, 248, 0.45);
          --glow-orange: rgba(249, 115, 22, 0.55);
          --glow-green: rgba(52, 211, 153, 0.45);
          font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        }

        ha-card {
          background: var(--card-bg);
          border-radius: var(--card-border-radius);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 18px;
          color: var(--text-primary);
          overflow: hidden;
          position: relative;
          box-sizing: border-box;
        }

        /* Header */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .header-title-box {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #64748b;
          box-shadow: 0 0 8px rgba(100, 116, 139, 0.5);
          transition: background 0.3s, box-shadow 0.3s;
        }
        .status-dot.active {
          background: var(--accent-green);
          box-shadow: 0 0 12px var(--glow-green);
        }
        .title {
          font-size: 1.15rem;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .mode-badge {
          font-size: 0.75rem;
          padding: 3px 9px;
          border-radius: 12px;
          background: rgba(52, 211, 153, 0.15);
          color: var(--accent-green);
          border: 1px solid rgba(52, 211, 153, 0.3);
          text-transform: capitalize;
          font-weight: 500;
        }

        /* Target Temperature Stepper */
        .temp-stepper {
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
        }
        .temp-btn {
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 1.1rem;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
          user-select: none;
        }
        .temp-btn:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .temp-val {
          font-size: 0.95rem;
          font-weight: 600;
          padding: 0 8px;
          min-width: 50px;
          text-align: center;
        }

        /* Unit Schematic View */
        .schematic-box {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: radial-gradient(circle at center, #1e2634 0%, #11141c 100%);
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          overflow: hidden;
          margin-bottom: 18px;
        }

        svg.schematic {
          width: 100%;
          height: 100%;
          display: block;
        }

        /* Airflow Streams */
        .flow-path {
          fill: none;
          stroke-width: 5;
          stroke-linecap: round;
          stroke-dasharray: 8 8;
          animation: flowAnim 1.4s linear infinite;
          will-change: stroke-dashoffset;
        }
        @keyframes flowAnim {
          from { stroke-dashoffset: 32; }
          to { stroke-dashoffset: 0; }
        }

        .flow-outdoor { stroke: #38bdf8; filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.6)); }
        .flow-exhaust { stroke: #60a5fa; filter: drop-shadow(0 0 5px rgba(96, 165, 250, 0.45)); opacity: 0.85; }
        .flow-extract { stroke: #fbbf24; filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.55)); }
        .flow-supply  { stroke: #34d399; filter: drop-shadow(0 0 6px rgba(52, 211, 153, 0.6)); }
        .flow-supply.heated { stroke: #fb923c; filter: drop-shadow(0 0 8px rgba(251, 146, 60, 0.7)); }

        /* Rotor in Center */
        .rotor-wheel {
          transform-origin: 300px 170px;
          will-change: transform;
        }
        .rotor-spinning {
          animation: rotateSpin 6s linear infinite;
        }
        @keyframes rotateSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Fan Impellers */
        .fan-spinner {
          transform-origin: center;
          will-change: transform;
        }
        .fan-rotating {
          animation: rotateSpin 1.2s linear infinite;
        }

        /* Heater Coil */
        .heater-coil {
          stroke: #475569;
          stroke-width: 4;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: stroke 0.4s, filter 0.4s;
        }
        .heater-coil.active {
          stroke: #f97316;
          filter: drop-shadow(0 0 8px #f97316);
          animation: heaterPulse 2s ease-in-out infinite;
        }
        @keyframes heaterPulse {
          0%, 100% { stroke: #f97316; filter: drop-shadow(0 0 8px rgba(249, 115, 22, 0.8)); }
          50% { stroke: #ea580c; filter: drop-shadow(0 0 14px rgba(234, 88, 12, 1)); }
        }

        /* Data Badges overlaid on diagram */
        .badge {
          position: absolute;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 6px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          z-index: 2;
          pointer-events: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .badge-title {
          font-size: 0.68rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .badge-temp {
          font-size: 1.05rem;
          font-weight: 700;
        }
        .badge-sub {
          font-size: 0.7rem;
          color: var(--text-secondary);
          display: flex;
          gap: 6px;
        }

        .badge-outdoor { top: 10px; left: 12px; }
        .badge-outdoor .badge-temp { color: var(--accent-cyan); }

        .badge-exhaust { top: 10px; right: 12px; }
        .badge-exhaust .badge-temp { color: var(--accent-blue); }

        .badge-extract { bottom: 10px; left: 12px; }
        .badge-extract .badge-temp { color: var(--accent-warm); }

        .badge-supply { bottom: 10px; right: 12px; }
        .badge-supply .badge-temp { color: var(--accent-green); }

        /* Rotor Center Badge */
        .rotor-badge {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 68px;
          height: 68px;
          border-radius: 50%;
          background: rgba(15, 23, 42, 0.9);
          border: 2px solid rgba(56, 189, 248, 0.35);
          box-shadow: 0 0 16px rgba(0, 0, 0, 0.6);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 3;
        }
        .rotor-pct {
          font-size: 1rem;
          font-weight: 700;
          color: var(--accent-cyan);
          line-height: 1.1;
        }
        .rotor-lbl {
          font-size: 0.58rem;
          color: var(--text-secondary);
          text-transform: uppercase;
        }

        /* Controls Grid */
        .controls-panel {
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 14px;
        }

        /* Fan Speed Selector */
        .control-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }
        .control-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .pills-group {
          display: flex;
          gap: 4px;
          background: rgba(0, 0, 0, 0.25);
          padding: 3px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .pill-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 0.78rem;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          user-select: none;
        }
        .pill-btn:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.08);
        }
        .pill-btn.active {
          color: #fff;
          background: #3b82f6;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
        }

        /* Presets Chips */
        .chips-group {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .chip-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--text-secondary);
          font-size: 0.75rem;
          font-weight: 500;
          padding: 5px 12px;
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s;
          user-select: none;
        }
        .chip-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
        }
        .chip-btn.active {
          background: rgba(56, 189, 248, 0.2);
          border-color: var(--accent-cyan);
          color: var(--accent-cyan);
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
        }

        /* Toggle Switches Row */
        .toggles-row {
          display: flex;
          align-items: center;
          gap: 16px;
          padding-top: 6px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          flex-wrap: wrap;
        }
        .toggle-item {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
        }
        .toggle-label {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .toggle-item.active .toggle-label {
          color: var(--text-primary);
        }

        /* Custom Toggle Switch Pill */
        .switch-track {
          width: 38px;
          height: 20px;
          background: rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          position: relative;
          transition: background 0.25s, box-shadow 0.25s;
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .switch-thumb {
          width: 14px;
          height: 14px;
          background: #ffffff;
          border-radius: 50%;
          position: absolute;
          top: 2px;
          left: 3px;
          transition: transform 0.25s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }
        .toggle-item.active .switch-track.heater {
          background: #f97316;
          box-shadow: 0 0 10px rgba(249, 115, 22, 0.5);
        }
        .toggle-item.active .switch-track.eco {
          background: #34d399;
          box-shadow: 0 0 10px rgba(52, 211, 153, 0.5);
        }
        .toggle-item.active .switch-track.freecool {
          background: #38bdf8;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
        }
        .toggle-item.active .switch-thumb {
          transform: translateX(18px);
        }

        .fan-rpm-text {
          font-size: 0.65rem;
          fill: #94a3b8;
          text-anchor: middle;
        }
      </style>

      <ha-card>
        <!-- Header -->
        <div class="header">
          <div class="header-title-box">
            <div id="statusDot" class="status-dot active"></div>
            <div class="title" id="cardTitle">${this._config.title || 'Systemair SAVE'}</div>
            <div class="mode-badge" id="modeBadge">Auto</div>
          </div>
          <div class="temp-stepper">
            <button class="temp-btn" id="btnTempMinus">−</button>
            <div class="temp-val" id="targetTempVal">21.0°C</div>
            <button class="temp-btn" id="btnTempPlus">+</button>
          </div>
        </div>

        <!-- Schematic Visualizer -->
        <div class="schematic-box">
          <svg class="schematic" viewBox="0 0 600 340">
            <!-- Unit Outer Housing -->
            <rect x="130" y="40" width="340" height="260" rx="12" fill="#171e2b" stroke="#334155" stroke-width="2"/>
            
            <!-- Ducts Outline -->
            <!-- Top Left: Outdoor -->
            <rect x="30" y="65" width="105" height="42" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
            <!-- Top Right: Exhaust -->
            <rect x="465" y="65" width="105" height="42" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
            <!-- Bottom Left: Extract -->
            <rect x="30" y="233" width="105" height="42" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
            <!-- Bottom Right: Supply -->
            <rect x="465" y="233" width="105" height="42" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>

            <!-- Internal Flow Channels -->
            <!-- Outdoor to Supply (Top-Left to Bottom-Right through Rotor) -->
            <path id="pathOutdoorToSupply" class="flow-path flow-outdoor" d="M 40,86 C 160,86 210,130 260,165" />
            <path id="pathSupplyAfterRotor" class="flow-path flow-supply" d="M 340,175 C 380,210 420,254 560,254" />

            <!-- Extract to Exhaust (Bottom-Left to Top-Right through Rotor) -->
            <path id="pathExtractToRotor" class="flow-path flow-extract" d="M 40,254 C 160,254 210,210 260,175" />
            <path id="pathExhaustAfterRotor" class="flow-path flow-exhaust" d="M 340,165 C 380,130 420,86 560,86" />

            <!-- Central Rotor Housing -->
            <circle cx="300" cy="170" r="54" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4 2" />
            <g id="rotorWheel" class="rotor-wheel rotor-spinning">
              <line x1="300" y1="120" x2="300" y2="220" stroke="#475569" stroke-width="1.5" />
              <line x1="250" y1="170" x2="350" y2="170" stroke="#475569" stroke-width="1.5" />
              <line x1="265" y1="135" x2="335" y2="205" stroke="#475569" stroke-width="1" />
              <line x1="265" y1="205" x2="335" y2="135" stroke="#475569" stroke-width="1" />
              <circle cx="300" cy="170" r="42" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="2 3"/>
            </g>

            <!-- Extract Fan (Top Right chamber inside unit) -->
            <g transform="translate(415, 100)">
              <circle cx="0" cy="0" r="24" fill="#1e293b" stroke="#475569" stroke-width="1.5"/>
              <g id="extractFanSpinner" class="fan-spinner fan-rotating">
                <circle cx="0" cy="0" r="6" fill="#64748b"/>
                <path d="M 0,-5 C 8,-15 15,-10 18,0 C 15,3 5,2 0,0 Z" fill="#94a3b8"/>
                <path d="M 5,0 C 15,8 10,15 0,18 C -3,15 -2,5 0,0 Z" fill="#94a3b8"/>
                <path d="M 0,5 C -8,15 -15,10 -18,0 C -15,-3 -5,-2 0,0 Z" fill="#94a3b8"/>
                <path d="M -5,0 C -15,-8 -10,-15 0,-18 C 3,-15 2,-5 0,0 Z" fill="#94a3b8"/>
              </g>
              <text x="0" y="36" class="fan-rpm-text" id="extractRpmText">EAF: 1410 RPM</text>
            </g>

            <!-- Supply Fan (Bottom Right chamber inside unit) -->
            <g transform="translate(415, 240)">
              <circle cx="0" cy="0" r="24" fill="#1e293b" stroke="#475569" stroke-width="1.5"/>
              <g id="supplyFanSpinner" class="fan-spinner fan-rotating">
                <circle cx="0" cy="0" r="6" fill="#64748b"/>
                <path d="M 0,-5 C 8,-15 15,-10 18,0 C 15,3 5,2 0,0 Z" fill="#94a3b8"/>
                <path d="M 5,0 C 15,8 10,15 0,18 C -3,15 -2,5 0,0 Z" fill="#94a3b8"/>
                <path d="M 0,5 C -8,15 -15,10 -18,0 C -15,-3 -5,-2 0,0 Z" fill="#94a3b8"/>
                <path d="M -5,0 C -15,-8 -10,-15 0,-18 C 3,-15 2,-5 0,0 Z" fill="#94a3b8"/>
              </g>
              <text x="0" y="36" class="fan-rpm-text" id="supplyRpmText">SAF: 1450 RPM</text>
            </g>

            <!-- Electric Reheater Coil in Supply Duct -->
            <path id="heaterCoil" class="heater-coil active" d="M 465,244 L 472,264 L 479,244 L 486,264 L 493,244 L 500,264 L 507,244" />
          </svg>

          <!-- Badges Overlay -->
          <!-- Outdoor Air Badge -->
          <div class="badge badge-outdoor">
            <span class="badge-title">Outdoor Air</span>
            <span class="badge-temp" id="valOat">-2.5°C</span>
            <span class="badge-sub" id="subOat">Fresh</span>
          </div>

          <!-- Exhaust Air Badge -->
          <div class="badge badge-exhaust">
            <span class="badge-title">Exhaust Air</span>
            <span class="badge-temp" id="valExhaust">3.8°C</span>
            <span class="badge-sub" id="subExhaust">Discharge</span>
          </div>

          <!-- Extract Air Badge -->
          <div class="badge badge-extract">
            <span class="badge-title">Extract Air</span>
            <span class="badge-temp" id="valEat">22.0°C</span>
            <span class="badge-sub" id="subExtract">48% RH • 580 ppm</span>
          </div>

          <!-- Supply Air Badge -->
          <div class="badge badge-supply">
            <span class="badge-title">Supply Air</span>
            <span class="badge-temp" id="valSat">20.5°C</span>
            <span class="badge-sub" id="subSupply">160 m³/h</span>
          </div>

          <!-- Rotor Center Badge -->
          <div class="rotor-badge">
            <span class="rotor-pct" id="valRecovery">84%</span>
            <span class="rotor-lbl">Recovery</span>
          </div>
        </div>

        <!-- Controls Section -->
        <div class="controls-panel">
          <!-- Fan Speed Row -->
          <div class="control-row">
            <span class="control-label">Fan Speed</span>
            <div class="pills-group" id="fanPills">
              <button class="pill-btn" data-speed="0">Off</button>
              <button class="pill-btn" data-speed="2">Low</button>
              <button class="pill-btn active" data-speed="3">Normal</button>
              <button class="pill-btn" data-speed="4">High</button>
              <button class="pill-btn" data-speed="5">Boost</button>
            </div>
          </div>

          <!-- Presets Row -->
          <div class="control-row">
            <span class="control-label">Preset Mode</span>
            <div class="chips-group" id="presetChips">
              <button class="chip-btn active" data-preset="auto">Auto</button>
              <button class="chip-btn" data-preset="manual">Manual</button>
              <button class="chip-btn" data-preset="away">Away</button>
              <button class="chip-btn" data-preset="fireplace">Fireplace</button>
              <button class="chip-btn" data-preset="refresh">Refresh</button>
            </div>
          </div>

          <!-- Quick Switches Row -->
          <div class="toggles-row">
            <!-- Heater Toggle -->
            <div class="toggle-item active" id="toggleHeater">
              <div class="switch-track heater"><div class="switch-thumb"></div></div>
              <span class="toggle-label">Heater</span>
            </div>

            <!-- Eco Mode Toggle -->
            <div class="toggle-item" id="toggleEco">
              <div class="switch-track eco"><div class="switch-thumb"></div></div>
              <span class="toggle-label">Eco Mode</span>
            </div>

            <!-- Free Cooling Toggle -->
            <div class="toggle-item" id="toggleFreeCooling">
              <div class="switch-track freecool"><div class="switch-thumb"></div></div>
              <span class="toggle-label">Free Cooling</span>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const root = this.shadowRoot;

    // Temperature stepper
    root.getElementById('btnTempMinus')?.addEventListener('click', () => this._changeTargetTemp(-0.5));
    root.getElementById('btnTempPlus')?.addEventListener('click', () => this._changeTargetTemp(+0.5));

    // Fan Speed pills
    root.getElementById('fanPills')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-btn');
      if (!btn) return;
      const speed = parseInt(btn.dataset.speed, 10);
      this._setFanSpeed(speed);
    });

    // Preset Chips
    root.getElementById('presetChips')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;
      const preset = btn.dataset.preset;
      this._setPreset(preset);
    });

    // Toggle Switches
    root.getElementById('toggleHeater')?.addEventListener('click', () => this._toggleSwitch('heater'));
    root.getElementById('toggleEco')?.addEventListener('click', () => this._toggleSwitch('eco'));
    root.getElementById('toggleFreeCooling')?.addEventListener('click', () => this._toggleSwitch('free_cooling'));
  }

  _changeTargetTemp(delta) {
    const climate = this._hass?.states[this._config.climate || 'climate.systemair'];
    const current = this._optimisticTargetTemp ?? (climate?.attributes?.temperature || 21.0);
    const newTemp = Math.round((current + delta) * 2) / 2;
    this._optimisticTargetTemp = newTemp;
    this.shadowRoot.getElementById('targetTempVal').textContent = `${newTemp.toFixed(1)}°C`;

    if (this._targetTempDebounce) clearTimeout(this._targetTempDebounce);
    this._targetTempDebounce = setTimeout(() => {
      this._callService('climate', 'set_temperature', {
        entity_id: this._config.climate || 'climate.systemair',
        temperature: newTemp
      });
    }, 400);
  }

  _setFanSpeed(speed) {
    this._optimisticFanSpeed = speed;
    const fanPills = this.shadowRoot.querySelectorAll('.pill-btn');
    fanPills.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.speed, 10) === speed);
    });

    const fanModeMap = { 0: 'off', 2: 'low', 3: 'medium', 4: 'high', 5: 'high' };
    const mode = fanModeMap[speed] || 'medium';

    this._callService('climate', 'set_fan_mode', {
      entity_id: this._config.climate || 'climate.systemair',
      fan_mode: mode
    });
  }

  _setPreset(preset) {
    this._optimisticPreset = preset;
    const chips = this.shadowRoot.querySelectorAll('.chip-btn');
    chips.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === preset);
    });
    this.shadowRoot.getElementById('modeBadge').textContent = preset;

    this._callService('climate', 'set_preset_mode', {
      entity_id: this._config.climate || 'climate.systemair',
      preset_mode: preset
    });
  }

  _toggleSwitch(type) {
    let switchEntity = null;
    if (type === 'heater') {
      switchEntity = this._getEntity('heater_switch', 'heater');
    } else if (type === 'eco') {
      switchEntity = this._getEntity('eco_mode_switch', 'eco_mode');
    } else if (type === 'free_cooling') {
      switchEntity = this._getEntity('free_cooling_switch', 'free_cooling');
    }

    if (!switchEntity) {
      console.warn(`[Systemair Card] Switch entity for ${type} not found.`);
      return;
    }

    const currentOn = this._optimisticSwitches[type] ?? (switchEntity.state === 'on');
    const newState = !currentOn;
    this._optimisticSwitches[type] = newState;

    const elemMap = {
      heater: 'toggleHeater',
      eco: 'toggleEco',
      free_cooling: 'toggleFreeCooling'
    };
    const el = this.shadowRoot.getElementById(elemMap[type]);
    if (el) el.classList.toggle('active', newState);

    if (type === 'heater') {
      const coil = this.shadowRoot.getElementById('heaterCoil');
      if (coil) coil.classList.toggle('active', newState);
    }

    this._callService('switch', newState ? 'turn_on' : 'turn_off', {
      entity_id: switchEntity.entity_id
    });
  }

  _callService(domain, service, data) {
    if (!this._hass) return;
    this._hass.callService(domain, service, data).catch(err => {
      console.error(`[Systemair Card] Service call error:`, err);
    });
  }

  _updateAnimationState() {
    const isPlaying = this._isTabVisible;
    const root = this.shadowRoot;
    const flowPaths = root.querySelectorAll('.flow-path');
    const rotor = root.getElementById('rotorWheel');
    const fans = root.querySelectorAll('.fan-spinner');

    flowPaths.forEach(p => p.style.animationPlayState = isPlaying ? 'running' : 'paused');
    if (rotor) rotor.style.animationPlayState = isPlaying ? 'running' : 'paused';
    fans.forEach(f => f.style.animationPlayState = isPlaying ? 'running' : 'paused');
  }

  _updateData() {
    if (!this._hass || !this.shadowRoot) return;
    const root = this.shadowRoot;

    // 1. Climate Entity
    const climate = this._hass.states[this._config.climate || 'climate.systemair'];
    const isOff = !climate || climate.state === 'off';
    const statusDot = root.getElementById('statusDot');
    if (statusDot) {
      statusDot.classList.toggle('active', !isOff);
    }

    // Target Temperature
    const targetTemp = this._optimisticTargetTemp ?? (climate?.attributes?.temperature || 21.0);
    const targetEl = root.getElementById('targetTempVal');
    if (targetEl) targetEl.textContent = `${Number(targetTemp).toFixed(1)}°C`;

    // Mode / Preset
    const preset = this._optimisticPreset ?? (climate?.attributes?.preset_mode || 'auto');
    const modeBadge = root.getElementById('modeBadge');
    if (modeBadge) modeBadge.textContent = preset;

    const chips = root.querySelectorAll('.chip-btn');
    chips.forEach(btn => btn.classList.toggle('active', btn.dataset.preset === preset));

    // 2. Temperatures
    const oat = this._getFloat(this._getEntity('outdoor_temperature', 'outdoor_air_temperature'));
    const sat = this._getFloat(this._getEntity('supply_temperature', 'supply_air_temperature'));
    const eat = this._getFloat(this._getEntity('extract_temperature', 'extract_air_temperature'))
             ?? this._getFloat(this._getEntity('room_temperature', 'room_air_temperature'));
    const exhaust = this._getFloat(this._getEntity('exhaust_temperature', 'exhaust_air_temperature'));

    if (oat !== null) root.getElementById('valOat').textContent = `${oat.toFixed(1)}°C`;
    if (sat !== null) root.getElementById('valSat').textContent = `${sat.toFixed(1)}°C`;
    if (eat !== null) root.getElementById('valEat').textContent = `${eat.toFixed(1)}°C`;
    if (exhaust !== null) {
      root.getElementById('valExhaust').textContent = `${exhaust.toFixed(1)}°C`;
    } else if (oat !== null && eat !== null && sat !== null) {
      // Estimated exhaust temperature if physical sensor is absent
      const estExhaust = eat - (sat - oat);
      root.getElementById('valExhaust').textContent = `${estExhaust.toFixed(1)}°C`;
    }

    // 3. Humidity & CO2
    const rh = this._getFloat(this._getEntity('humidity', 'relative_humidity'));
    const co2 = this._getFloat(this._getEntity('co2', 'co2'));
    const subExtract = root.getElementById('subExtract');
    if (subExtract) {
      const parts = [];
      if (rh !== null) parts.push(`${Math.round(rh)}% RH`);
      if (co2 !== null) parts.push(`${Math.round(co2)} ppm`);
      if (parts.length > 0) subExtract.textContent = parts.join(' • ');
    }

    // 4. Airflow & RPM
    const safRpm = this._getFloat(this._getEntity('supply_fan_rpm', 'supply_fan_rpm'));
    const eafRpm = this._getFloat(this._getEntity('extract_fan_rpm', 'extract_fan_rpm'));
    const airflow = this._getFloat(this._getEntity('airflow', 'airflow'));

    const subSupply = root.getElementById('subSupply');
    if (subSupply) {
      if (airflow !== null) {
        subSupply.textContent = `${Math.round(airflow)} m³/h`;
      } else if (safRpm !== null) {
        subSupply.textContent = `${Math.round(safRpm)} RPM`;
      }
    }

    if (safRpm !== null) {
      const el = root.getElementById('supplyRpmText');
      if (el) el.textContent = `SAF: ${Math.round(safRpm)} RPM`;
    }
    if (eafRpm !== null) {
      const el = root.getElementById('extractRpmText');
      if (el) el.textContent = `EAF: ${Math.round(eafRpm)} RPM`;
    }

    // Fan animation speed based on RPM
    const supplyFan = root.getElementById('supplyFanSpinner');
    const extractFan = root.getElementById('extractFanSpinner');
    const isFansRunning = !isOff && (safRpm === null || safRpm > 100);

    if (supplyFan) {
      supplyFan.style.animationPlayState = isFansRunning ? 'running' : 'paused';
      if (safRpm && safRpm > 0) {
        const dur = Math.max(0.3, Math.min(2.5, 2000 / safRpm));
        supplyFan.style.animationDuration = `${dur.toFixed(2)}s`;
      }
    }
    if (extractFan) {
      extractFan.style.animationPlayState = isFansRunning ? 'running' : 'paused';
      if (eafRpm && eafRpm > 0) {
        const dur = Math.max(0.3, Math.min(2.5, 2000 / eafRpm));
        extractFan.style.animationDuration = `${dur.toFixed(2)}s`;
      }
    }

    // 5. Heat Recovery %
    const recoverySensor = this._getFloat(this._getEntity('heat_recovery', 'heat_exchanger_analog_output'));
    let recoveryPct = recoverySensor;
    if (recoveryPct === null && oat !== null && eat !== null && sat !== null && (eat - oat) > 1) {
      // Heat recovery efficiency formula: (SAT - OAT) / (EAT - OAT) * 100
      const calc = ((sat - oat) / (eat - oat)) * 100;
      recoveryPct = Math.max(0, Math.min(99, calc));
    }
    const valRec = root.getElementById('valRecovery');
    if (valRec) {
      valRec.textContent = recoveryPct !== null ? `${Math.round(recoveryPct)}%` : '--%';
    }

    // Rotor spinning animation speed
    const rotor = root.getElementById('rotorWheel');
    if (rotor) {
      const isRotorActive = isFansRunning && (recoveryPct === null || recoveryPct > 5);
      rotor.style.animationPlayState = isRotorActive ? 'running' : 'paused';
    }

    // 6. Heater State
    const heaterSwitch = this._getEntity('heater_switch', 'heater');
    const heaterOutput = this._getFloat(this._getEntity('heater_output', 'heater_analog_output'));
    const isHeaterOn = this._optimisticSwitches.heater ?? (heaterSwitch?.state === 'on');
    const isHeatingActive = isHeaterOn && (heaterOutput === null || heaterOutput > 0);

    const toggleHeater = root.getElementById('toggleHeater');
    if (toggleHeater) toggleHeater.classList.toggle('active', isHeaterOn);

    const coil = root.getElementById('heaterCoil');
    if (coil) coil.classList.toggle('active', isHeatingActive);

    const supplyPath = root.getElementById('pathSupplyAfterRotor');
    if (supplyPath) supplyPath.classList.toggle('heated', isHeatingActive);

    // 7. Eco Mode & Free Cooling Switches
    const ecoSwitch = this._getEntity('eco_mode_switch', 'eco_mode');
    const isEcoOn = this._optimisticSwitches.eco ?? (ecoSwitch?.state === 'on');
    const toggleEco = root.getElementById('toggleEco');
    if (toggleEco) toggleEco.classList.toggle('active', isEcoOn);

    const freeCoolSwitch = this._getEntity('free_cooling_switch', 'free_cooling');
    const isFreeCoolOn = this._optimisticSwitches.free_cooling ?? (freeCoolSwitch?.state === 'on');
    const toggleFreeCool = root.getElementById('toggleFreeCooling');
    if (toggleFreeCool) toggleFreeCool.classList.toggle('active', isFreeCoolOn);
  }
}

customElements.define('systemair-recuperator-card', SystemairRecuperatorCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'systemair-recuperator-card',
  name: 'Systemair Recuperator Card',
  description: 'Interactive animated card for Systemair ventilation and heat recovery units.',
  preview: true
});
console.info(
  '%c SYSTEMAIR-RECUPERATOR-CARD %c v1.0.0 is loaded ',
  'color: white; background: #38bdf8; font-weight: bold; border-radius: 4px 0 0 4px;',
  'color: #38bdf8; background: #0f172a; font-weight: bold; border-radius: 0 4px 4px 0;'
);
