/**
 * Systemair SAVE Recuperator Lovelace Card
 * Premium Glassmorphism visualization matching the design mockup:
 * - Architectural cutaway of Systemair SAVE ventilation unit
 * - Translucent cylindrical ducts with metallic collars
 * - Multi-layered glowing airflow streams (Cyan, Blue, Amber, Green)
 * - Rotary heat exchanger with 24 radial vanes, gradient gauge & auto efficiency calculation
 * - Centrifugal snail blowers (volutes) with animated impellers & RPM callouts
 * - Glowing serpentine electric heating coil in supply stream
 * - Monolithic dark glassmorphic UI with compact integrated controls
 * Version: 1.1.0
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
    if (!config) throw new Error('Invalid configuration');
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

  _getEntity(type, defaultSuffix) {
    if (this._config.entities && this._config.entities[type]) {
      return this._hass.states[this._config.entities[type]];
    }
    const climateId = this._config.climate || 'climate.systemair';
    const prefix = climateId.replace(/^climate\./, '');

    const candidates = [
      `sensor.${prefix}_${defaultSuffix}`,
      `sensor.systemair_${defaultSuffix}`,
      `switch.${prefix}_${defaultSuffix}`,
      `switch.systemair_${defaultSuffix}`
    ];

    for (const id of candidates) {
      if (this._hass.states[id]) return this._hass.states[id];
    }

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
    const v = parseFloat(s);
    return isNaN(v) ? null : v;
  }

  _updateAnimationState() {
    const svg = this.shadowRoot.querySelector('svg.schematic');
    if (!svg) return;
    if (!this._isTabVisible) {
      svg.classList.add('paused');
    } else {
      svg.classList.remove('paused');
    }
  }

  _calculateEfficiency(tOutdoor, tExtract, tSupply) {
    if (tOutdoor === null || tExtract === null || tSupply === null) return null;
    const denom = tExtract - tOutdoor;
    if (Math.abs(denom) < 0.5) return null;
    let eff = Math.round(((tSupply - tOutdoor) / denom) * 100);
    if (eff < 0) eff = 0;
    if (eff > 99) eff = 88;
    return eff;
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        ha-card {
          background: linear-gradient(165deg, #181c25 0%, #11141b 100%);
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          color: #f1f5f9;
          overflow: hidden;
          padding: 16px 18px;
          position: relative;
        }

        /* Header */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .status-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 10px #22c55e;
          animation: pulseGlow 2.5s infinite;
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.25); opacity: 1; box-shadow: 0 0 14px #22c55e; }
        }
        .title {
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #ffffff;
        }
        .mode-badge {
          font-size: 0.72rem;
          font-weight: 600;
          color: #4ade80;
          background: rgba(34, 197, 94, 0.14);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 12px;
          padding: 2px 8px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .mode-badge::before {
          content: "";
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #4ade80;
        }

        /* Target Temp Stepper */
        .temp-stepper {
          display: flex;
          align-items: center;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 12px;
          padding: 3px 5px;
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
        }
        .temp-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 1.1rem;
          font-weight: 600;
          width: 28px;
          height: 28px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }
        .temp-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }
        .temp-val {
          font-size: 0.95rem;
          font-weight: 700;
          color: #f8fafc;
          padding: 0 8px;
          min-width: 52px;
          text-align: center;
        }

        /* SVG Schematic */
        .schematic-box {
          position: relative;
          width: 100%;
          padding: 4px 0;
        }
        svg.schematic {
          width: 100%;
          height: auto;
          display: block;
          overflow: visible;
        }
        svg.schematic.paused * {
          animation-play-state: paused !important;
        }

        /* Animated Airflow Paths */
        .flow-core {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .flow-outdoor { stroke: #06b6d4; }
        .flow-exhaust { stroke: #3b82f6; }
        .flow-extract { stroke: #f59e0b; }
        .flow-supply  { stroke: #10b981; }

        .flow-stream {
          fill: none;
          stroke-linecap: round;
          stroke-dasharray: 6 10;
          animation: flowAnim 1.6s linear infinite;
        }
        @keyframes flowAnim {
          from { stroke-dashoffset: 32; }
          to { stroke-dashoffset: 0; }
        }

        /* Rotor Spin */
        .rotor-spin-group {
          transform-origin: 340px 165px;
          will-change: transform;
          animation: rotorSpin 7s linear infinite;
        }
        @keyframes rotorSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Fan Impellers */
        .fan-impeller {
          transform-origin: center;
          will-change: transform;
          animation: fanSpin 1.2s linear infinite;
        }
        @keyframes fanSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Electric Reheater Coil */
        .heater-coil {
          stroke: #475569;
          stroke-width: 3.5;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: stroke 0.4s, filter 0.4s;
        }
        .heater-coil.active {
          stroke: #f97316;
          filter: drop-shadow(0 0 10px rgba(249, 115, 22, 0.9));
          animation: heaterPulse 2s ease-in-out infinite;
        }
        @keyframes heaterPulse {
          0%, 100% { stroke: #f97316; filter: drop-shadow(0 0 8px rgba(249, 115, 22, 0.8)); }
          50% { stroke: #fb923c; filter: drop-shadow(0 0 14px rgba(251, 146, 60, 1)); }
        }

        /* Controls Deck */
        .controls-deck {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 6px;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        /* Fan Speed Row */
        .deck-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }
        .deck-label {
          font-size: 0.8rem;
          font-weight: 500;
          color: #94a3b8;
        }
        .pills-container {
          display: flex;
          gap: 4px;
          background: rgba(0, 0, 0, 0.35);
          padding: 3px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .pill {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 0.78rem;
          font-weight: 600;
          padding: 5px 12px;
          border-radius: 9px;
          cursor: pointer;
          transition: all 0.2s;
          user-select: none;
        }
        .pill:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }
        .pill.active {
          color: #ffffff;
          background: #3b82f6;
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.5);
        }

        /* Presets & Toggles Row */
        .bottom-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .chips-container {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .chip {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          font-size: 0.75rem;
          font-weight: 500;
          padding: 5px 13px;
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s;
          user-select: none;
        }
        .chip:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.09);
        }
        .chip.active {
          background: rgba(56, 189, 248, 0.15);
          border-color: #38bdf8;
          color: #38bdf8;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.3);
        }

        /* Toggle Switches */
        .toggles-group {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .toggle-item {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
        }
        .toggle-text {
          font-size: 0.78rem;
          font-weight: 500;
          color: #94a3b8;
        }
        .toggle-item.active .toggle-text {
          color: #ffffff;
        }
        .switch-track {
          width: 38px;
          height: 20px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          position: relative;
          transition: background 0.25s, box-shadow 0.25s;
          border: 1px solid rgba(255, 255, 255, 0.08);
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
          box-shadow: 0 0 12px rgba(249, 115, 22, 0.55);
        }
        .toggle-item.active .switch-track.eco {
          background: #10b981;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.55);
        }
        .toggle-item.active .switch-track.freecool {
          background: #38bdf8;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.55);
        }
        .toggle-item.active .switch-thumb {
          transform: translateX(18px);
        }
      </style>

      <ha-card>
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            <div id="statusDot" class="status-dot"></div>
            <div class="title" id="cardTitle">${this._config.title || 'Systemair SAVE'}</div>
            <div class="mode-badge" id="modeBadge">Auto</div>
          </div>
          <div class="temp-stepper">
            <button class="temp-btn" id="btnTempMinus">−</button>
            <div class="temp-val" id="targetTempVal">21.0°C</div>
            <button class="temp-btn" id="btnTempPlus">+</button>
          </div>
        </div>

        <!-- Central Unit Schematic -->
        <div class="schematic-box">
          <svg class="schematic" viewBox="0 0 680 330">
            <defs>
              <!-- Metallic Collar Gradient -->
              <linearGradient id="ductGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#2a3240"/>
                <stop offset="50%" stop-color="#191f2a"/>
                <stop offset="100%" stop-color="#141923"/>
              </linearGradient>

              <!-- Radial Rotor Gauge Arc Gradient -->
              <linearGradient id="gaugeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#06b6d4"/>
                <stop offset="50%" stop-color="#38bdf8"/>
                <stop offset="100%" stop-color="#f59e0b"/>
              </linearGradient>

              <!-- Cyan Glow Filter -->
              <linearGradient id="flowCyan" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.8"/>
                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.3"/>
              </linearGradient>

              <!-- Green Glow Filter -->
              <linearGradient id="flowGreen" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="#34d399" stop-opacity="0.8"/>
              </linearGradient>

              <!-- Amber Glow Filter -->
              <linearGradient id="flowAmber" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.8"/>
                <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.3"/>
              </linearGradient>

              <!-- Blue Glow Filter -->
              <linearGradient id="flowBlue" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.8"/>
              </linearGradient>
            </defs>

            <!-- 1. Systemair Unit Outer Chassis -->
            <rect x="150" y="25" width="380" height="280" rx="18" fill="#141822" stroke="#252d3d" stroke-width="2.5"/>
            <rect x="156" y="31" width="368" height="268" rx="14" fill="#181d28" stroke="#1f2633" stroke-width="1.5"/>

            <!-- Internal Structural Ribs / Dividers -->
            <line x1="156" y1="165" x2="265" y2="165" stroke="#273142" stroke-width="2.5"/>
            <line x1="415" y1="165" x2="524" y2="165" stroke="#273142" stroke-width="2.5"/>
            <line x1="340" y1="31" x2="340" y2="90" stroke="#273142" stroke-width="2.5"/>
            <line x1="340" y1="240" x2="340" y2="299" stroke="#273142" stroke-width="2.5"/>

            <!-- 2. Four Cylindrical Ducts with Highlight Rings -->
            <!-- Top-Left: Outdoor Air -->
            <g>
              <rect x="25" y="55" width="135" height="50" rx="6" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.5"/>
              <line x1="150" y1="55" x2="150" y2="105" stroke="#475569" stroke-width="3"/>
              <line x1="40" y1="57" x2="40" y2="103" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.4"/>
            </g>

            <!-- Top-Right: Exhaust Air -->
            <g>
              <rect x="520" y="55" width="135" height="50" rx="6" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.5"/>
              <line x1="530" y1="55" x2="530" y2="105" stroke="#475569" stroke-width="3"/>
              <line x1="640" y1="57" x2="640" y2="103" stroke="#60a5fa" stroke-width="1.5" stroke-opacity="0.4"/>
            </g>

            <!-- Bottom-Left: Extract Air -->
            <g>
              <rect x="25" y="225" width="135" height="50" rx="6" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.5"/>
              <line x1="150" y1="225" x2="150" y2="275" stroke="#475569" stroke-width="3"/>
              <line x1="40" y1="227" x2="40" y2="273" stroke="#fbbf24" stroke-width="1.5" stroke-opacity="0.4"/>
            </g>

            <!-- Bottom-Right: Supply Air -->
            <g>
              <rect x="520" y="225" width="135" height="50" rx="6" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.5"/>
              <line x1="530" y1="225" x2="530" y2="275" stroke="#475569" stroke-width="3"/>
              <line x1="640" y1="227" x2="640" y2="273" stroke="#34d399" stroke-width="1.5" stroke-opacity="0.4"/>
            </g>

            <!-- 3. Airflow Channels & Glowing Streams -->
            <!-- Outdoor Air Flow (Top-Left -> Center Rotor) -->
            <path d="M 40,80 C 170,80 230,105 285,150" fill="none" stroke="#06b6d4" stroke-width="26" stroke-opacity="0.08"/>
            <path d="M 40,80 C 170,80 230,105 285,150" fill="none" stroke="#06b6d4" stroke-width="10" stroke-opacity="0.35"/>
            <path class="flow-stream" d="M 40,80 C 170,80 230,105 285,150" stroke="#38bdf8" stroke-width="3.2"/>

            <!-- Supply Air Flow (Center Rotor -> Fan -> Heater -> Supply Duct) -->
            <path d="M 395,180 C 440,210 470,250 635,250" fill="none" stroke="#10b981" stroke-width="26" stroke-opacity="0.08"/>
            <path d="M 395,180 C 440,210 470,250 635,250" fill="none" stroke="#10b981" stroke-width="10" stroke-opacity="0.35"/>
            <path class="flow-stream" d="M 395,180 C 440,210 470,250 635,250" stroke="#34d399" stroke-width="3.2"/>

            <!-- Extract Air Flow (Bottom-Left -> Center Rotor) -->
            <path d="M 40,250 C 170,250 230,225 285,180" fill="none" stroke="#f59e0b" stroke-width="26" stroke-opacity="0.08"/>
            <path d="M 40,250 C 170,250 230,225 285,180" fill="none" stroke="#f59e0b" stroke-width="10" stroke-opacity="0.35"/>
            <path class="flow-stream" d="M 40,250 C 170,250 230,225 285,180" stroke="#fbbf24" stroke-width="3.2"/>

            <!-- Exhaust Air Flow (Center Rotor -> Fan -> Exhaust Duct) -->
            <path d="M 395,150 C 440,120 470,80 635,80" fill="none" stroke="#3b82f6" stroke-width="26" stroke-opacity="0.08"/>
            <path d="M 395,150 C 440,120 470,80 635,80" fill="none" stroke="#3b82f6" stroke-width="10" stroke-opacity="0.35"/>
            <path class="flow-stream" d="M 395,150 C 440,120 470,80 635,80" stroke="#60a5fa" stroke-width="3.2"/>

            <!-- 4. Top-Right Centrifugal Exhaust Fan (Snail Volute) -->
            <g transform="translate(460, 95)">
              <!-- Snail Housing -->
              <path d="M -3,-28 C 16,-28 29,-14 29,4 C 29,22 14,35 -5,35 C -25,35 -38,18 -38,-5 C -38,-22 -24,-28 -3,-28 Z" fill="#1b2230" stroke="#334155" stroke-width="1.8"/>
              <!-- Impeller -->
              <g id="extractFanSpinner" class="fan-impeller">
                <circle cx="-3" cy="4" r="5" fill="#475569"/>
                <path d="M -3,-1 C 4,-12 12,-7 14,3 C 10,4 3,3 -3,4 Z" fill="#94a3b8"/>
                <path d="M 1,4 C 12,11 7,19 -3,21 C -4,17 -3,10 -3,4 Z" fill="#94a3b8"/>
                <path d="M -3,9 C -10,20 -18,15 -20,5 C -16,4 -9,5 -3,4 Z" fill="#94a3b8"/>
                <path d="M -7,4 C -18,-3 -13,-11 -3,-13 C -2,-9 -3,-2 -3,4 Z" fill="#94a3b8"/>
              </g>
              <!-- Callout Pointer to RPM -->
              <polyline points="22,18 42,32 80,32" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="2 2"/>
              <text x="84" y="35" fill="#94a3b8" font-size="11" font-weight="500" id="extractRpmSvgText">EAF: 1410 RPM</text>
            </g>

            <!-- 5. Bottom-Right Centrifugal Supply Fan (Snail Volute) -->
            <g transform="translate(435, 235)">
              <!-- Snail Housing -->
              <path d="M -3,-28 C 16,-28 29,-14 29,4 C 29,22 14,35 -5,35 C -25,35 -38,18 -38,-5 C -38,-22 -24,-28 -3,-28 Z" fill="#1b2230" stroke="#334155" stroke-width="1.8"/>
              <!-- Impeller -->
              <g id="supplyFanSpinner" class="fan-impeller">
                <circle cx="-3" cy="4" r="5" fill="#475569"/>
                <path d="M -3,-1 C 4,-12 12,-7 14,3 C 10,4 3,3 -3,4 Z" fill="#94a3b8"/>
                <path d="M 1,4 C 12,11 7,19 -3,21 C -4,17 -3,10 -3,4 Z" fill="#94a3b8"/>
                <path d="M -3,9 C -10,20 -18,15 -20,5 C -16,4 -9,5 -3,4 Z" fill="#94a3b8"/>
                <path d="M -7,4 C -18,-3 -13,-11 -3,-13 C -2,-9 -3,-2 -3,4 Z" fill="#94a3b8"/>
              </g>
              <!-- Callout Pointer to RPM -->
              <polyline points="-15,35 -15,50 -55,50" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="2 2"/>
              <text x="-58" y="53" text-anchor="end" fill="#94a3b8" font-size="11" font-weight="500" id="supplyRpmSvgText">SAF: 1450 RPM</text>
            </g>

            <!-- 6. Electric Reheater Serpentine Coil -->
            <g id="heaterGroup">
              <path id="heaterCoil" class="heater-coil active" d="M 505,232 L 512,268 L 519,232 L 526,268 L 533,232 L 540,268 L 547,232 L 554,268 L 561,232" />
            </g>

            <!-- 7. Rotary Heat Exchanger (Center Wheel) -->
            <g id="rotorGroup">
              <!-- Outer Rotor Bezel -->
              <circle cx="340" cy="165" r="64" fill="#10151f" stroke="#252f40" stroke-width="3"/>
              <!-- Gradient Arc Gauge -->
              <circle cx="340" cy="165" r="57" fill="none" stroke="url(#gaugeGrad)" stroke-width="4" stroke-dasharray="260 90" stroke-linecap="round"/>

              <!-- Rotating Radial Vanes -->
              <g id="rotorWheel" class="rotor-spin-group">
                <line x1="340" y1="110" x2="340" y2="220" stroke="#334155" stroke-width="1.2"/>
                <line x1="285" y1="165" x2="395" y2="165" stroke="#334155" stroke-width="1.2"/>
                <line x1="301" y1="126" x2="379" y2="204" stroke="#334155" stroke-width="1.2"/>
                <line x1="301" y1="204" x2="379" y2="126" stroke="#334155" stroke-width="1.2"/>
                <line x1="319" y1="113" x2="361" y2="217" stroke="#334155" stroke-width="1"/>
                <line x1="361" y1="113" x2="319" y2="217" stroke="#334155" stroke-width="1"/>
                <line x1="288" y1="144" x2="392" y2="186" stroke="#334155" stroke-width="1"/>
                <line x1="288" y1="186" x2="392" y2="144" stroke="#334155" stroke-width="1"/>
                <!-- Radial Texture Ring -->
                <circle cx="340" cy="165" r="46" fill="none" stroke="#1e293b" stroke-width="12" stroke-dasharray="2 3"/>
              </g>

              <!-- Central Digital Efficiency Dial -->
              <circle cx="340" cy="165" r="36" fill="#141923" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5"/>
              <text x="340" y="166" text-anchor="middle" fill="#38bdf8" font-size="18" font-weight="800" id="rotorPctText">84%</text>
              <text x="340" y="180" text-anchor="middle" fill="#94a3b8" font-size="8.5" font-weight="600" letter-spacing="1">RECOVERY</text>
            </g>

            <!-- 8. Clean Integrated Typography & Sensor Callouts -->
            <!-- Top-Left: Outdoor Air -->
            <g>
              <text x="36" y="44" fill="#94a3b8" font-size="12" font-weight="600">Outdoor Air</text>
              <text x="36" y="70" fill="#38bdf8" font-size="22" font-weight="800" id="outdoorTempSvg">-2.5°C</text>
              <text x="36" y="122" fill="#64748b" font-size="11" font-weight="500">Fresh</text>
            </g>

            <!-- Top-Right: Exhaust Air -->
            <g>
              <text x="644" y="44" text-anchor="end" fill="#94a3b8" font-size="12" font-weight="600">Exhaust Air</text>
              <text x="644" y="70" text-anchor="end" fill="#60a5fa" font-size="22" font-weight="800" id="exhaustTempSvg">3.8°C</text>
              <text x="644" y="122" text-anchor="end" fill="#64748b" font-size="11" font-weight="500">Discharge</text>
            </g>

            <!-- Bottom-Left: Extract Air -->
            <g>
              <text x="36" y="214" fill="#94a3b8" font-size="12" font-weight="600">Extract Air</text>
              <text x="36" y="240" fill="#fbbf24" font-size="22" font-weight="800" id="extractTempSvg">21.7°C</text>
              <text x="36" y="292" fill="#94a3b8" font-size="11" font-weight="500" id="extractExtraSvg">48% RH  ·  580 ppm</text>
            </g>

            <!-- Bottom-Right: Supply Air -->
            <g>
              <text x="644" y="214" text-anchor="end" fill="#94a3b8" font-size="12" font-weight="600">Supply Air</text>
              <text x="644" y="240" text-anchor="end" fill="#34d399" font-size="22" font-weight="800" id="supplyTempSvg">20.5°C</text>
              <text x="644" y="292" text-anchor="end" fill="#94a3b8" font-size="11" font-weight="500" id="supplyFlowSvg">160 m³/h</text>
            </g>
          </svg>
        </div>

        <!-- Integrated Controls Deck -->
        <div class="controls-deck">
          <!-- Fan Speed Row -->
          <div class="deck-row">
            <div class="deck-label">Fan Speed</div>
            <div class="pills-container" id="fanPills">
              <button class="pill" data-speed="off">Off</button>
              <button class="pill" data-speed="low">1</button>
              <button class="pill" data-speed="medium">2</button>
              <button class="pill" data-speed="normal">3</button>
              <button class="pill" data-speed="high">4</button>
              <button class="pill" data-speed="boost">Boost</button>
            </div>
          </div>

          <!-- Presets and Toggles Row -->
          <div class="bottom-row">
            <!-- Mode Chips -->
            <div class="chips-container" id="presetChips">
              <button class="chip" data-preset="auto">Auto</button>
              <button class="chip" data-preset="manual">Manual</button>
              <button class="chip" data-preset="away">Away</button>
              <button class="chip" data-preset="fireplace">Fireplace</button>
              <button class="chip" data-preset="refresh">Refresh</button>
            </div>

            <!-- Toggle Switches -->
            <div class="toggles-group">
              <div class="toggle-item" id="toggleHeater">
                <div class="switch-track heater"><div class="switch-thumb"></div></div>
                <div class="toggle-text">Heater</div>
              </div>

              <div class="toggle-item" id="toggleEco">
                <div class="switch-track eco"><div class="switch-thumb"></div></div>
                <div class="toggle-text">Eco Mode</div>
              </div>

              <div class="toggle-item" id="toggleFreeCool">
                <div class="switch-track freecool"><div class="switch-thumb"></div></div>
                <div class="toggle-text">Free Cooling</div>
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const root = this.shadowRoot;

    // Target Temp Stepper
    root.querySelector('#btnTempMinus').addEventListener('click', () => this._adjustTemp(-0.5));
    root.querySelector('#btnTempPlus').addEventListener('click', () => this._adjustTemp(0.5));

    // Fan Speed Pills
    root.querySelectorAll('#fanPills .pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const speed = e.currentTarget.dataset.speed;
        this._setFanSpeed(speed);
      });
    });

    // Preset Mode Chips
    root.querySelectorAll('#presetChips .chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = e.currentTarget.dataset.preset;
        this._setPreset(preset);
      });
    });

    // Toggle Switches
    root.querySelector('#toggleHeater').addEventListener('click', () => this._toggleSwitch('heater'));
    root.querySelector('#toggleEco').addEventListener('click', () => this._toggleSwitch('eco_mode'));
    root.querySelector('#toggleFreeCool').addEventListener('click', () => this._toggleSwitch('free_cooling'));
  }

  _updateData() {
    if (!this._hass || !this.shadowRoot.querySelector('ha-card')) return;

    const climateEntity = this._hass.states[this._config.climate || 'climate.systemair'];
    const outdoorSensor = this._getEntity('outdoor_temp', 'outdoor_air_temperature');
    const extractSensor = this._getEntity('extract_temp', 'extract_air_temperature');
    const supplySensor = this._getEntity('supply_temp', 'supply_air_temperature');
    const exhaustSensor = this._getEntity('exhaust_temp', 'exhaust_air_temperature');

    const supplyFanRpm = this._getEntity('supply_fan_rpm', 'supply_fan_rpm');
    const extractFanRpm = this._getEntity('extract_fan_rpm', 'extract_fan_rpm');
    const supplyFlow = this._getEntity('supply_flow', 'supply_air_flow');
    const extractRh = this._getEntity('extract_rh', 'relative_humidity');
    const extractCo2 = this._getEntity('extract_co2', 'co2');
    const efficiencySensor = this._getEntity('heat_recovery_efficiency', 'heat_recovery_efficiency');

    const heaterSwitch = this._getEntity('heater', 'heater');
    const ecoSwitch = this._getEntity('eco_mode', 'eco_mode');
    const freeCoolSwitch = this._getEntity('free_cooling', 'free_cooling');

    // Temperatures
    const tOut = this._getFloat(outdoorSensor);
    const tExt = this._getFloat(extractSensor);
    const tSup = this._getFloat(supplySensor);
    const tExh = this._getFloat(exhaustSensor);

    this.shadowRoot.querySelector('#outdoorTempSvg').textContent = tOut !== null ? `${tOut.toFixed(1)}°C` : '--.-°C';
    this.shadowRoot.querySelector('#extractTempSvg').textContent = tExt !== null ? `${tExt.toFixed(1)}°C` : '--.-°C';
    this.shadowRoot.querySelector('#supplyTempSvg').textContent = tSup !== null ? `${tSup.toFixed(1)}°C` : '--.-°C';
    this.shadowRoot.querySelector('#exhaustTempSvg').textContent = tExh !== null ? `${tExh.toFixed(1)}°C` : '--.-°C';

    // Target Temperature
    let targetTemp = this._optimisticTargetTemp;
    if (targetTemp === null && climateEntity && climateEntity.attributes) {
      targetTemp = climateEntity.attributes.temperature;
    }
    this.shadowRoot.querySelector('#targetTempVal').textContent = targetTemp ? `${parseFloat(targetTemp).toFixed(1)}°C` : '--.-°C';

    // Heat Recovery Efficiency (Sensor or Fallback Formula)
    let eff = this._getFloat(efficiencySensor);
    if (eff === null) {
      eff = this._calculateEfficiency(tOut, tExt, tSup);
    }
    this.shadowRoot.querySelector('#rotorPctText').textContent = eff !== null ? `${eff}%` : '84%';

    // Extra metrics (RH, CO2, Airflow)
    const rhVal = this._getFloat(extractRh);
    const co2Val = this._getFloat(extractCo2);
    let extraText = '';
    if (rhVal !== null) extraText += `${Math.round(rhVal)}% RH`;
    if (co2Val !== null) extraText += (extraText ? '  ·  ' : '') + `${Math.round(co2Val)} ppm`;
    if (!extraText) extraText = 'Normal';
    this.shadowRoot.querySelector('#extractExtraSvg').textContent = extraText;

    const flowVal = this._getFloat(supplyFlow);
    this.shadowRoot.querySelector('#supplyFlowSvg').textContent = flowVal !== null ? `${Math.round(flowVal)} m³/h` : 'Normal Flow';

    // RPM texts & fan animation speeds
    const supRpm = this._getFloat(supplyFanRpm);
    const extRpm = this._getFloat(extractFanRpm);
    this.shadowRoot.querySelector('#supplyRpmSvgText').textContent = supRpm !== null ? `SAF: ${Math.round(supRpm)} RPM` : 'SAF: 1450 RPM';
    this.shadowRoot.querySelector('#extractRpmSvgText').textContent = extRpm !== null ? `EAF: ${Math.round(extRpm)} RPM` : 'EAF: 1410 RPM';

    const supSpinner = this.shadowRoot.querySelector('#supplyFanSpinner');
    const extSpinner = this.shadowRoot.querySelector('#extractFanSpinner');
    if (supRpm === 0) {
      supSpinner.style.animationPlayState = 'paused';
    } else {
      supSpinner.style.animationPlayState = 'running';
      const dur = supRpm ? Math.max(0.4, 1800 / supRpm) : 1.2;
      supSpinner.style.animationDuration = `${dur.toFixed(2)}s`;
    }
    if (extRpm === 0) {
      extSpinner.style.animationPlayState = 'paused';
    } else {
      extSpinner.style.animationPlayState = 'running';
      const dur = extRpm ? Math.max(0.4, 1800 / extRpm) : 1.2;
      extSpinner.style.animationDuration = `${dur.toFixed(2)}s`;
    }

    // Reheater Active Glow
    const isHeaterOn = this._optimisticSwitches.heater !== undefined
      ? this._optimisticSwitches.heater
      : (heaterSwitch ? heaterSwitch.state === 'on' : true);
    const heaterCoil = this.shadowRoot.querySelector('#heaterCoil');
    if (isHeaterOn) {
      heaterCoil.classList.add('active');
    } else {
      heaterCoil.classList.remove('active');
    }

    // Climate Preset & Mode
    let currentPreset = this._optimisticPreset;
    if (currentPreset === null && climateEntity && climateEntity.attributes) {
      currentPreset = climateEntity.attributes.preset_mode || climateEntity.state;
    }
    if (currentPreset) {
      const badge = this.shadowRoot.querySelector('#modeBadge');
      badge.textContent = currentPreset.charAt(0).toUpperCase() + currentPreset.slice(1);

      this.shadowRoot.querySelectorAll('#presetChips .chip').forEach(btn => {
        if (btn.dataset.preset.toLowerCase() === currentPreset.toLowerCase()) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // Fan Speed Selector Pills
    let currentFanMode = this._optimisticFanSpeed;
    if (currentFanMode === null && climateEntity && climateEntity.attributes) {
      currentFanMode = climateEntity.attributes.fan_mode;
    }
    if (currentFanMode) {
      this.shadowRoot.querySelectorAll('#fanPills .pill').forEach(btn => {
        if (btn.dataset.speed.toLowerCase() === currentFanMode.toLowerCase()) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // Toggles state
    this._updateToggleUI('toggleHeater', isHeaterOn);
    this._updateToggleUI('toggleEco', this._getSwitchState('eco_mode', ecoSwitch));
    this._updateToggleUI('toggleFreeCool', this._getSwitchState('free_cooling', freeCoolSwitch));
  }

  _getSwitchState(type, entity) {
    if (this._optimisticSwitches[type] !== undefined) {
      return this._optimisticSwitches[type];
    }
    return entity ? entity.state === 'on' : false;
  }

  _updateToggleUI(elementId, isActive) {
    const el = this.shadowRoot.querySelector(`#${elementId}`);
    if (!el) return;
    if (isActive) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }

  _adjustTemp(delta) {
    const climateEntity = this._hass.states[this._config.climate || 'climate.systemair'];
    let current = this._optimisticTargetTemp;
    if (current === null && climateEntity && climateEntity.attributes) {
      current = parseFloat(climateEntity.attributes.temperature) || 21.0;
    }
    if (current === null) current = 21.0;

    let target = Math.round((current + delta) * 2) / 2;
    if (target < 12) target = 12;
    if (target > 30) target = 30;

    this._optimisticTargetTemp = target;
    this.shadowRoot.querySelector('#targetTempVal').textContent = `${target.toFixed(1)}°C`;

    if (this._targetTempDebounce) clearTimeout(this._targetTempDebounce);
    this._targetTempDebounce = setTimeout(() => {
      this._hass.callService('climate', 'set_temperature', {
        entity_id: this._config.climate || 'climate.systemair',
        temperature: target
      });
      setTimeout(() => { this._optimisticTargetTemp = null; }, 3000);
    }, 450);
  }

  _setFanSpeed(speed) {
    this._optimisticFanSpeed = speed;
    this.shadowRoot.querySelectorAll('#fanPills .pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.speed === speed);
    });

    this._hass.callService('climate', 'set_fan_mode', {
      entity_id: this._config.climate || 'climate.systemair',
      fan_mode: speed
    });
    setTimeout(() => { this._optimisticFanSpeed = null; }, 3000);
  }

  _setPreset(preset) {
    this._optimisticPreset = preset;
    this.shadowRoot.querySelectorAll('#presetChips .chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === preset);
    });
    this.shadowRoot.querySelector('#modeBadge').textContent = preset.charAt(0).toUpperCase() + preset.slice(1);

    this._hass.callService('climate', 'set_preset_mode', {
      entity_id: this._config.climate || 'climate.systemair',
      preset_mode: preset
    });
    setTimeout(() => { this._optimisticPreset = null; }, 3000);
  }

  _toggleSwitch(type) {
    let current = false;
    let entity = null;
    if (type === 'heater') entity = this._getEntity('heater', 'heater');
    else if (type === 'eco_mode') entity = this._getEntity('eco_mode', 'eco_mode');
    else if (type === 'free_cooling') entity = this._getEntity('free_cooling', 'free_cooling');

    if (this._optimisticSwitches[type] !== undefined) {
      current = this._optimisticSwitches[type];
    } else if (entity) {
      current = entity.state === 'on';
    }

    const nextState = !current;
    this._optimisticSwitches[type] = nextState;

    if (type === 'heater') {
      this._updateToggleUI('toggleHeater', nextState);
      const coil = this.shadowRoot.querySelector('#heaterCoil');
      if (nextState) coil.classList.add('active');
      else coil.classList.remove('active');
    } else if (type === 'eco_mode') {
      this._updateToggleUI('toggleEco', nextState);
    } else if (type === 'free_cooling') {
      this._updateToggleUI('toggleFreeCool', nextState);
    }

    if (entity) {
      this._hass.callService('switch', nextState ? 'turn_on' : 'turn_off', {
        entity_id: entity.entity_id
      });
    }
    setTimeout(() => { delete this._optimisticSwitches[type]; }, 3500);
  }

  getCardSize() {
    return 5;
  }
}

if (!customElements.get('systemair-recuperator-card')) {
  customElements.define('systemair-recuperator-card', SystemairRecuperatorCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'systemair-recuperator-card')) {
  window.customCards.push({
    type: 'systemair-recuperator-card',
    name: 'Systemair Recuperator Card',
    description: 'Animated Lovelace card for Systemair SAVE ventilation and recuperator units with airflow, fans, and controls.',
    preview: true
  });
}
