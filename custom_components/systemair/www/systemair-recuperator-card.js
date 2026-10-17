/**
 * Systemair Recuperator Lovelace Card
 * Custom Home Assistant card for Systemair SAVE ventilation units with heat recovery.
 * Fully matching visual mockup aesthetics with fluid airflows, realistic snail blowers,
 * dynamic supply air temperature gradient, active serpentine reheater coil, and iOS-style toggles.
 * Version: 1.0.28
 */

class SystemairRecuperatorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._optimistic = {};
    this._stepTimer = null;
  }

  setConfig(config) {
    if (!config) throw new Error('Invalid configuration');
    this._config = {
      title: 'Systemair SAVE',
      climate_entity: 'climate.systemair_climate',
      unit_type: 'rotary',
      show_co2: true,
      show_humidity: true,
      show_airflow: true,
      show_power: false,
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._render();
      this._initialized = true;
    }
    this._updateValues();
  }

  getCardSize() {
    return 6;
  }

  static getStubConfig() {
    return {
      title: 'Systemair SAVE',
      climate_entity: 'climate.systemair_climate',
      unit_type: 'rotary',
    };
  }

  // --- Entity Discovery & Safe Value Extractors ---
  _findEntity(patterns) {
    if (!this._hass) return null;
    const states = this._hass.states;
    for (const p of patterns) {
      if (typeof p === 'string' && states[p]) return p;
      if (p instanceof RegExp) {
        const found = Object.keys(states).find(id => p.test(id));
        if (found) return found;
      }
    }
    return null;
  }

  _getState(entityId, fallback = '--') {
    if (!this._hass || !entityId) return fallback;
    const s = this._hass.states[entityId];
    if (!s || s.state === 'unavailable' || s.state === 'unknown') return fallback;
    return s.state;
  }

  _getNum(entityId, fallback = null) {
    const val = parseFloat(this._getState(entityId, null));
    return isNaN(val) ? fallback : val;
  }

  _getSupplyColors(temp) {
    const t = isFinite(temp) ? Math.max(12, Math.min(30, temp)) : 21.0;
    // Dynamic thermal gradient: transitions toward bright red into the house
    let start = '#f59e0b';
    let end = '#ff3b30';
    let glow = 'rgba(255, 59, 48, 0.45)';

    if (t < 16) {
      start = '#10b981';
      end   = '#f59e0b';
      glow  = 'rgba(245, 158, 11, 0.4)';
    } else if (t < 19) {
      start = '#f59e0b';
      end   = '#f97316';
      glow  = 'rgba(249, 115, 22, 0.45)';
    } else if (t < 23) {
      start = '#f97316';
      end   = '#ff3b30';
      glow  = 'rgba(255, 59, 48, 0.5)';
    } else {
      start = '#ff453a';
      end   = '#e11d48';
      glow  = 'rgba(225, 29, 72, 0.55)';
    }
    return { start, end, glow };
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          --card-bg: linear-gradient(160deg, #181b24 0%, #11141a 100%);
          --supply-flow-start: #f59e0b;
          --supply-flow-end: #ff3b30;
          --supply-flow-glow: rgba(255, 59, 48, 0.45);
        }
        ha-card {
          background: var(--card-bg);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          box-shadow: 0 20px 45px -12px rgba(0, 0, 0, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.1);
          color: #f1f5f9;
          padding: 20px;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
        }

        /* Ambient Card Highlights */
        .ambient-glow {
          position: absolute;
          width: 320px;
          height: 320px;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          opacity: 0.12;
          z-index: 0;
        }
        .glow-left { top: -60px; left: -60px; background: #06b6d4; }
        .glow-right { bottom: -60px; right: -60px; background: var(--supply-flow-end, #ff3b30); transition: background 0.6s ease; }

        .card-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* Header Bar */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 2px;
          flex-wrap: nowrap;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .status-dot {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 12px #22c55e;
          animation: pulseGlow 2.5s infinite;
          flex-shrink: 0;
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.25); opacity: 1; box-shadow: 0 0 16px #22c55e; }
        }
        .title {
          font-size: 1.18rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #ffffff;
          white-space: nowrap;
        }
        .mode-badge {
          font-size: 0.74rem;
          font-weight: 600;
          color: #4ade80;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 12px;
          padding: 2px 9px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
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
          display: inline-flex;
          align-items: center;
          background: rgba(0, 0, 0, 0.42);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 12px;
          padding: 3px 6px;
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
          flex-shrink: 0;
        }
        .temp-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 1.15rem;
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
          font-size: 0.96rem;
          font-weight: 700;
          color: #f8fafc;
          padding: 0 8px;
          min-width: 54px;
          text-align: center;
          white-space: nowrap;
        }

        /* SVG Schematic Container */
        .schematic-box {
          position: relative;
          width: 100%;
          padding: 2px 0;
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

        /* Multi-layer Flow Streamlines (CSS Dash Animations) */
        .flow-stream {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          animation: flowMotion 2.2s linear infinite;
        }
        .flow-stream-fast {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          animation: flowMotion 1.5s linear infinite;
        }
        @keyframes flowMotion {
          from { stroke-dashoffset: 44; }
          to { stroke-dashoffset: 0; }
        }

        .flow-outdoor { stroke: #38bdf8; }
        .flow-exhaust { stroke: #60a5fa; }
        .flow-extract { stroke: #fbbf24; }
        .flow-supply  { stroke: url(#flowSupplyGrad); }

        /* Backward-curved Centrifugal Fan Impeller Rotation */
        .fan-impeller {
          transform-origin: 0px 0px;
          animation: fanSpin 1.2s linear infinite;
          will-change: transform;
        }
        @keyframes fanSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Rotary Wheel Spin */
        .rotor-spin-group {
          transform-origin: 340px 165px;
          animation: rotorSpin 8s linear infinite;
          will-change: transform;
        }
        @keyframes rotorSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Serpentine Electric Reheater Coil */
        .heater-coil {
          stroke: #64748b;
          stroke-width: 3.5;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: all 0.4s ease;
        }
        .heater-coil.active {
          stroke: #ff7a18;
          stroke-width: 4.5;
          filter: drop-shadow(0 0 10px rgba(255, 122, 24, 0.95)) drop-shadow(0 0 18px rgba(255, 90, 0, 0.65));
          animation: heaterPulse 2s ease-in-out infinite;
        }
        @keyframes heaterPulse {
          0%, 100% { stroke: #ff7a18; filter: drop-shadow(0 0 8px rgba(255, 122, 24, 0.85)); }
          50% { stroke: #ff9800; filter: drop-shadow(0 0 16px rgba(255, 152, 0, 1)); }
        }

        /* Typography & Sensor Labels inside SVG */
        .temp-outdoor { fill: #38bdf8; }
        .temp-exhaust { fill: #60a5fa; }
        .temp-extract { fill: #fbbf24; }
        .temp-supply  { fill: var(--supply-flow-end, #ff3b30); transition: fill 0.6s ease; }

        /* Controls Deck */
        .controls-deck {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 4px;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
        }

        /* Fan Speed & Toggles Row */
        .deck-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .fan-speed-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .deck-label {
          font-size: 0.84rem;
          font-weight: 500;
          color: #94a3b8;
          white-space: nowrap;
        }
        .pills-container {
          display: inline-flex;
          gap: 3px;
          background: rgba(0, 0, 0, 0.38);
          padding: 3px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.07);
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

        /* iOS-Style Switches with Non-Wrapping Labels */
        .toggles-group {
          display: flex;
          align-items: center;
          gap: 16px;
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
          color: #94a3b8;
          white-space: nowrap;
        }
        .ios-switch {
          width: 42px;
          height: 23px;
          border-radius: 12px;
          background: #252b36;
          border: 1px solid rgba(255, 255, 255, 0.1);
          position: relative;
          transition: background 0.25s, border-color 0.25s, box-shadow 0.25s;
          flex-shrink: 0;
        }
        .ios-switch .thumb {
          width: 17px;
          height: 17px;
          border-radius: 50%;
          background: #ffffff;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
        }
        .ios-switch.on {
          background: #3b82f6;
          border-color: #3b82f6;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
        }
        .ios-switch.on.orange {
          background: #ff9800;
          border-color: #ff9800;
          box-shadow: 0 0 10px rgba(255, 152, 0, 0.6);
        }
        .ios-switch.on .thumb {
          transform: translateX(19px);
        }

        /* Preset Modes Grid (Exactly 5 columns, 100% width, zero cutoffs) */
        .presets-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px;
          width: 100%;
          box-sizing: border-box;
          padding: 2px 0;
        }
        .preset-chip {
          background: rgba(0, 0, 0, 0.32);
          border: 1px solid rgba(255, 255, 255, 0.07);
          color: #94a3b8;
          font-size: clamp(0.68rem, 2.2vw, 0.78rem);
          font-weight: 500;
          padding: 6px 2px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          user-select: none;
          box-sizing: border-box;
        }
        .preset-chip:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
        }
        .preset-chip.active {
          color: #ffffff;
          background: rgba(59, 130, 246, 0.18);
          border-color: #3b82f6;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.35);
        }

        @media (max-width: 500px) {
          .deck-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .toggles-group {
            width: 100%;
            justify-content: space-between;
          }
        }
      </style>

      <ha-card id="mainCard">
        <div class="ambient-glow glow-left"></div>
        <div class="ambient-glow glow-right"></div>

        <div class="card-content">
          <!-- Top Header -->
          <div class="header">
            <div class="header-left">
              <div class="status-dot" id="statusDot"></div>
              <div class="title">${this._config.title}</div>
              <div class="mode-badge" id="modeBadge">Auto</div>
            </div>
            <div class="temp-stepper">
              <button class="temp-btn" id="tempDown">−</button>
              <span class="temp-val" id="tempVal">21.0°C</span>
              <button class="temp-btn" id="tempUp">+</button>
            </div>
          </div>

          <!-- Central Architectural Unit Cutaway SVG -->
          <div class="schematic-box">
            <svg class="schematic" viewBox="0 0 700 340" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <!-- Duct Glass/Metallic Gradient -->
                <linearGradient id="ductGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#2a3344" stop-opacity="0.9"/>
                  <stop offset="35%" stop-color="#1e2532" stop-opacity="0.7"/>
                  <stop offset="70%" stop-color="#141822" stop-opacity="0.9"/>
                  <stop offset="100%" stop-color="#0f131a" stop-opacity="0.95"/>
                </linearGradient>

                <!-- Rotary Wheel Dual-Gradient Gauge -->
                <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#f59e0b"/>
                  <stop offset="50%" stop-color="#10b981"/>
                  <stop offset="100%" stop-color="#3b82f6"/>
                </linearGradient>

                <!-- Dynamic Thermal Gradient for Supply Air Flow into House -->
                <linearGradient id="flowSupplyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="var(--supply-flow-start, #f59e0b)"/>
                  <stop offset="50%" stop-color="var(--supply-flow-end, #ff3b30)"/>
                  <stop offset="100%" stop-color="var(--supply-flow-end, #ff3b30)"/>
                </linearGradient>

                <!-- Snail Housing Volute Metallic Gradient -->
                <linearGradient id="snailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#252d3d"/>
                  <stop offset="100%" stop-color="#131720"/>
                </linearGradient>

                <!-- Active Electric Heater Radial Glow Aura -->
                <radialGradient id="heaterRadialGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#ff7a18" stop-opacity="0.8"/>
                  <stop offset="50%" stop-color="#ff9800" stop-opacity="0.4"/>
                  <stop offset="100%" stop-color="#ff5722" stop-opacity="0"/>
                </radialGradient>
              </defs>

              <!-- 1. Systemair Unit Chassis Frame -->
              <rect x="150" y="25" width="380" height="280" rx="20" fill="#141822" stroke="#252d3d" stroke-width="2.5"/>
              <rect x="156" y="31" width="368" height="268" rx="16" fill="#181d28" stroke="#1f2633" stroke-width="1.5"/>

              <!-- Internal Structural Rib Dividers -->
              <line x1="156" y1="165" x2="265" y2="165" stroke="#273142" stroke-width="2.5"/>
              <line x1="415" y1="165" x2="524" y2="165" stroke="#273142" stroke-width="2.5"/>
              <line x1="340" y1="31" x2="340" y2="90" stroke="#273142" stroke-width="2.5"/>
              <line x1="340" y1="240" x2="340" y2="299" stroke="#273142" stroke-width="2.5"/>

              <!-- 2. Four Cylindrical Duct Collars -->
              <!-- Top-Left: Outdoor Air Duct -->
              <g>
                <rect x="25" y="55" width="135" height="50" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/>
                <line x1="150" y1="55" x2="150" y2="105" stroke="#475569" stroke-width="3"/>
                <line x1="40" y1="58" x2="40" y2="102" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.5"/>
              </g>

              <!-- Top-Right: Exhaust Air Duct -->
              <g>
                <rect x="520" y="55" width="135" height="50" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/>
                <line x1="530" y1="55" x2="530" y2="105" stroke="#475569" stroke-width="3"/>
                <line x1="640" y1="58" x2="640" y2="102" stroke="#60a5fa" stroke-width="1.5" stroke-opacity="0.5"/>
              </g>

              <!-- Bottom-Left: Extract Air Duct -->
              <g>
                <rect x="25" y="225" width="135" height="50" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/>
                <line x1="150" y1="225" x2="150" y2="275" stroke="#475569" stroke-width="3"/>
                <line x1="40" y1="228" x2="40" y2="272" stroke="#fbbf24" stroke-width="1.5" stroke-opacity="0.5"/>
              </g>

              <!-- Bottom-Right: Supply Air Duct -->
              <g>
                <rect x="520" y="225" width="135" height="50" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/>
                <line x1="530" y1="225" x2="530" y2="275" stroke="#475569" stroke-width="3"/>
                <line x1="640" y1="228" x2="640" y2="272" stroke="var(--supply-flow-end, #ff3b30)" stroke-width="1.5" stroke-opacity="0.5"/>
              </g>

              <!-- 3. Fluid Airflow Streams -->
              <!-- Outdoor Air Stream (Top-Left -> Center Rotor) -->
              <path d="M 40,80 C 170,80 230,105 285,150" fill="none" stroke="#06b6d4" stroke-width="26" stroke-opacity="0.08"/>
              <path d="M 40,80 C 170,80 230,105 285,150" fill="none" stroke="#06b6d4" stroke-width="10" stroke-opacity="0.32"/>
              <path class="flow-stream flow-outdoor" d="M 40,80 C 170,80 230,105 285,150" stroke-width="3" stroke-dasharray="14 8"/>
              <path class="flow-stream-fast flow-outdoor" d="M 40,84 C 170,84 228,108 285,153" stroke-width="1.4" stroke-dasharray="4 6" stroke-opacity="0.7"/>

              <!-- Extract Air Stream (Bottom-Left -> Center Rotor) -->
              <path d="M 40,250 C 170,250 230,225 285,180" fill="none" stroke="#f59e0b" stroke-width="26" stroke-opacity="0.08"/>
              <path d="M 40,250 C 170,250 230,225 285,180" fill="none" stroke="#f59e0b" stroke-width="10" stroke-opacity="0.32"/>
              <path class="flow-stream flow-extract" d="M 40,250 C 170,250 230,225 285,180" stroke-width="3" stroke-dasharray="14 8"/>
              <path class="flow-stream-fast flow-extract" d="M 40,246 C 170,246 228,222 285,177" stroke-width="1.4" stroke-dasharray="4 6" stroke-opacity="0.7"/>

              <!-- Exhaust Air Stream (Center Rotor -> Top Fan Snail -> Exhaust Duct) -->
              <path d="M 395,150 C 420,130 430,105 635,80" fill="none" stroke="#3b82f6" stroke-width="26" stroke-opacity="0.08"/>
              <path d="M 395,150 C 420,130 430,105 635,80" fill="none" stroke="#3b82f6" stroke-width="10" stroke-opacity="0.32"/>
              <path class="flow-stream flow-exhaust" d="M 395,150 C 420,130 430,105 635,80" stroke-width="3" stroke-dasharray="14 8"/>
              <path class="flow-stream-fast flow-exhaust" d="M 395,146 C 420,126 430,101 635,76" stroke-width="1.4" stroke-dasharray="4 6" stroke-opacity="0.7"/>

              <!-- Supply Air Stream (Center Rotor -> Bottom Fan -> Heater -> Supply Duct) -->
              <!-- Beautiful Red Thermal Gradient Flowing into the House -->
              <path d="M 395,180 C 420,200 430,245 635,250" fill="none" stroke="url(#flowSupplyGrad)" stroke-width="26" stroke-opacity="0.10"/>
              <path d="M 395,180 C 420,200 430,245 635,250" fill="none" stroke="url(#flowSupplyGrad)" stroke-width="10" stroke-opacity="0.36"/>
              <path class="flow-stream flow-supply" d="M 395,180 C 420,200 430,245 635,250" stroke-width="3.2" stroke-dasharray="14 8"/>
              <path class="flow-stream-fast" d="M 395,184 C 420,204 430,249 635,254" stroke="#ffffff" stroke-width="1.4" stroke-dasharray="4 6" stroke-opacity="0.75"/>

              <!-- 4. Top-Right Exhaust Snail Blower -->
              <g transform="translate(425, 105)">
                <!-- Realistic Archimedean Snail Housing Volute -->
                <path d="M -36,0 C -36,-24 -18,-38 10,-38 L 85,-38 L 85,-14 L 38,-14 C 40,14 24,36 0,36 C -22,36 -36,18 -36,0 Z" fill="url(#snailGrad)" stroke="#38455c" stroke-width="2"/>
                <circle cx="0" cy="0" r="28" fill="#131720" stroke="#252d3d" stroke-width="1.5"/>

                <!-- Backward-curved 8-Blade Centrifugal Impeller (Centered at 0,0) -->
                <g id="extractFanSpinner" class="fan-impeller">
                  <circle cx="0" cy="0" r="5" fill="#475569"/>
                  <path d="M 0,-4 C 8,-12 18,-8 22,2 C 16,3 8,0 0,-4 Z" fill="#cbd5e1"/>
                  <path d="M 4,0 C 12,8 8,18 -2,22 C -3,16 0,8 4,0 Z" fill="#cbd5e1"/>
                  <path d="M 0,4 C -8,12 -18,8 -22,-2 C -16,-3 -8,0 0,4 Z" fill="#cbd5e1"/>
                  <path d="M -4,0 C -12,-8 -8,-18 2,-22 C 3,-16 0,-8 -4,0 Z" fill="#cbd5e1"/>
                  <path d="M 3,-3 C 14,-4 18,6 14,16 C 10,12 5,5 3,-3 Z" fill="#94a3b8"/>
                  <path d="M 3,3 C 4,14 -6,18 -16,14 C -12,10 -5,5 3,3 Z" fill="#94a3b8"/>
                  <path d="M -3,3 C -14,4 -18,-6 -14,-16 C -10,-12 -5,-5 -3,3 Z" fill="#94a3b8"/>
                  <path d="M -3,-3 C -4,-14 6,-18 16,-14 C 12,-10 5,-5 -3,-3 Z" fill="#94a3b8"/>
                </g>
                <!-- Clean Angled Pointer Callout to EAF RPM (Clear of Rotor) -->
                <polyline points="20,24 55,42 95,42" fill="none" stroke="#64748b" stroke-width="1.2" stroke-dasharray="2 2"/>
                <text x="98" y="45" fill="#94a3b8" font-size="11" font-weight="500" id="extractRpmSvgText">EAF: 1410 RPM</text>
              </g>

              <!-- 5. Bottom-Right Supply Snail Blower -->
              <g transform="translate(425, 245)">
                <!-- Realistic Archimedean Snail Housing Volute -->
                <path d="M -36,0 C -36,-24 -18,-38 10,-38 L 52,-38 L 52,-14 L 38,-14 C 40,14 24,36 0,36 C -22,36 -36,18 -36,0 Z" fill="url(#snailGrad)" stroke="#38455c" stroke-width="2"/>
                <circle cx="0" cy="0" r="28" fill="#131720" stroke="#252d3d" stroke-width="1.5"/>

                <!-- Backward-curved 8-Blade Centrifugal Impeller (Centered at 0,0) -->
                <g id="supplyFanSpinner" class="fan-impeller">
                  <circle cx="0" cy="0" r="5" fill="#475569"/>
                  <path d="M 0,-4 C 8,-12 18,-8 22,2 C 16,3 8,0 0,-4 Z" fill="#cbd5e1"/>
                  <path d="M 4,0 C 12,8 8,18 -2,22 C -3,16 0,8 4,0 Z" fill="#cbd5e1"/>
                  <path d="M 0,4 C -8,12 -18,8 -22,-2 C -16,-3 -8,0 0,4 Z" fill="#cbd5e1"/>
                  <path d="M -4,0 C -12,-8 -8,-18 2,-22 C 3,-16 0,-8 -4,0 Z" fill="#cbd5e1"/>
                  <path d="M 3,-3 C 14,-4 18,6 14,16 C 10,12 5,5 3,-3 Z" fill="#94a3b8"/>
                  <path d="M 3,3 C 4,14 -6,18 -16,14 C -12,10 -5,5 3,3 Z" fill="#94a3b8"/>
                  <path d="M -3,3 C -14,4 -18,-6 -14,-16 C -10,-12 -5,-5 -3,3 Z" fill="#94a3b8"/>
                  <path d="M -3,-3 C -4,-14 6,-18 16,-14 C 12,-10 5,-5 -3,-3 Z" fill="#94a3b8"/>
                </g>
                <!-- Clean Pointer Callout to SAF RPM (Below Bottom Chamber) -->
                <polyline points="0,36 0,55 -55,55" fill="none" stroke="#64748b" stroke-width="1.2" stroke-dasharray="2 2"/>
                <text x="-60" y="58" text-anchor="end" fill="#94a3b8" font-size="11" font-weight="500" id="supplyRpmSvgText">SAF: 1450 RPM</text>
              </g>

              <!-- 6. Electric Reheater Serpentine Coil -->
              <g id="heaterGroup">
                <!-- Warm Glow Aura Background -->
                <ellipse id="heaterAura" cx="525" cy="245" rx="42" ry="26" fill="url(#heaterRadialGlow)" opacity="0"/>
                <!-- 5-loop Serpentine Coil Element (Polished Steel when idle, Neon Orange when active) -->
                <path id="heaterCoil" class="heater-coil"
                  d="M 495,225 
                     L 495,263 A 6,6 0 0,0 507,263 
                     L 507,225 A 6,6 0 0,1 519,225 
                     L 519,263 A 6,6 0 0,0 531,263 
                     L 531,225 A 6,6 0 0,1 543,225 
                     L 543,263 A 6,6 0 0,0 555,263 
                     L 555,225" />
              </g>

              <!-- 7. Rotary Heat Exchanger (Center Wheel - Dynamic Gauge Arc) -->
              <g id="rotorGroup">
                <!-- Outer Bezel -->
                <circle cx="340" cy="165" r="64" fill="#111620" stroke="#252f40" stroke-width="3.5"/>
                <!-- Multi-color Gradient Recovery Gauge Arc (Rotated -90deg so it fills clockwise from 12 o'clock) -->
                <circle id="rotorGaugeArc" cx="340" cy="165" r="57" fill="none" stroke="url(#gaugeGrad)" stroke-width="4.5" stroke-dasharray="311 47" stroke-linecap="round" style="transition: stroke-dasharray 0.8s ease-out; transform: rotate(-90deg); transform-origin: 340px 165px;"/>

                <!-- Rotating Radial Vanes Matrix -->
                <g id="rotorWheel" class="rotor-spin-group">
                  <line x1="340" y1="108" x2="340" y2="222" stroke="#334155" stroke-width="1.2"/>
                  <line x1="283" y1="165" x2="397" y2="165" stroke="#334155" stroke-width="1.2"/>
                  <line x1="300" y1="125" x2="380" y2="205" stroke="#334155" stroke-width="1.2"/>
                  <line x1="300" y1="205" x2="380" y2="125" stroke="#334155" stroke-width="1.2"/>
                  <line x1="318" y1="111" x2="362" y2="219" stroke="#334155" stroke-width="1"/>
                  <line x1="362" y1="111" x2="318" y2="219" stroke="#334155" stroke-width="1"/>
                  <line x1="286" y1="143" x2="394" y2="187" stroke="#334155" stroke-width="1"/>
                  <line x1="286" y1="187" x2="394" y2="143" stroke="#334155" stroke-width="1"/>
                  <!-- Concentric Aluminum Matrix Ribs -->
                  <circle cx="340" cy="165" r="47" fill="none" stroke="#1e293b" stroke-width="12" stroke-dasharray="2 3"/>
                </g>

                <!-- Central Digital Efficiency Dial -->
                <circle cx="340" cy="165" r="37" fill="#141924" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5"/>
                <text x="340" y="166" text-anchor="middle" fill="#ffffff" font-size="20" font-weight="800" id="rotorPctText">84%</text>
                <text x="340" y="180" text-anchor="middle" fill="#94a3b8" font-size="8.5" font-weight="600" letter-spacing="1">RECOVERY</text>
              </g>

              <!-- 8. Clean Integrated Sensor Typography & Callouts -->
              <!-- Top-Left: Outdoor Air -->
              <g>
                <text x="36" y="44" fill="#94a3b8" font-size="12" font-weight="600">Outdoor Air</text>
                <text x="36" y="68" class="temp-outdoor" font-size="22" font-weight="800" id="outdoorTempSvg">-2.5°C</text>
                <text x="36" y="90" fill="#64748b" font-size="11" font-weight="500">Fresh</text>
              </g>

              <!-- Top-Right: Exhaust Air -->
              <g>
                <text x="644" y="44" text-anchor="end" fill="#94a3b8" font-size="12" font-weight="600">Exhaust Air</text>
                <text x="644" y="68" text-anchor="end" class="temp-exhaust" font-size="22" font-weight="800" id="exhaustTempSvg">3.8°C</text>
                <text x="644" y="90" text-anchor="end" fill="#64748b" font-size="11" font-weight="500">Discharge</text>
              </g>

              <!-- Bottom-Left: Extract Air (Safely within duct collar) -->
              <g>
                <text x="36" y="214" fill="#94a3b8" font-size="12" font-weight="600">Extract Air</text>
                <text x="36" y="234" class="temp-extract" font-size="22" font-weight="800" id="extractTempSvg">22.0°C</text>
                <text x="36" y="252" fill="#94a3b8" font-size="11" font-weight="500" id="extractRhSvg">48% RH</text>
                <text x="36" y="268" fill="#94a3b8" font-size="11" font-weight="500" id="extractCo2Svg">580 ppm CO₂</text>
              </g>

              <!-- Bottom-Right: Supply Air (Safely within duct collar) -->
              <g>
                <text x="644" y="214" text-anchor="end" fill="#94a3b8" font-size="12" font-weight="600">Supply Air</text>
                <text x="644" y="238" text-anchor="end" class="temp-supply" font-size="22" font-weight="800" id="supplyTempSvg">20.5°C</text>
                <text x="644" y="258" text-anchor="end" fill="#94a3b8" font-size="11" font-weight="500" id="supplyFlowSvg">160 m³/h</text>
              </g>
            </svg>
          </div>

          <!-- Controls Deck -->
          <div class="controls-deck">
            <!-- Row 1: Fan Speed & iOS Toggles -->
            <div class="deck-row">
              <div class="fan-speed-group">
                <span class="deck-label">Fan Speed</span>
                <div class="pills-container" id="fanPills">
                  <button class="pill" data-speed="1">1</button>
                  <button class="pill" data-speed="2">2</button>
                  <button class="pill" data-speed="3">3</button>
                  <button class="pill" data-speed="4">4</button>
                  <button class="pill" data-speed="5">5</button>
                  <button class="pill" data-speed="boost">Boost</button>
                </div>
              </div>

              <!-- iOS-Style Toggles with Non-Wrapping Labels -->
              <div class="toggles-group">
                <div class="toggle-item" id="heaterToggleItem">
                  <div class="ios-switch orange" id="heaterSwitch"><div class="thumb"></div></div>
                  <span class="toggle-label">Heater</span>
                </div>
                <div class="toggle-item" id="ecoToggleItem">
                  <div class="ios-switch" id="ecoSwitch"><div class="thumb"></div></div>
                  <span class="toggle-label">Eco Mode</span>
                </div>
                <div class="toggle-item" id="freeCoolingToggleItem">
                  <div class="ios-switch" id="freeCoolingSwitch"><div class="thumb"></div></div>
                  <span class="toggle-label">Free Cooling</span>
                </div>
              </div>
            </div>

            <!-- Row 2: 5 Main Presets Grid (100% Fit, Zero Cutoffs) -->
            <div class="presets-row" id="presetsRow">
              <div class="preset-chip" data-mode="auto">Auto</div>
              <div class="preset-chip" data-mode="manual">Manual</div>
              <div class="preset-chip" data-mode="away">Away</div>
              <div class="preset-chip" data-mode="fireplace">Fireplace</div>
              <div class="preset-chip" data-mode="refresh">Refresh</div>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const root = this.shadowRoot;

    // Target Temperature Stepper
    root.getElementById('tempDown').addEventListener('click', () => this._changeTargetTemp(-0.5));
    root.getElementById('tempUp').addEventListener('click', () => this._changeTargetTemp(+0.5));

    // Fan Speed Pills with Immediate Optimistic Feedback
    root.querySelectorAll('#fanPills .pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const speed = e.currentTarget.getAttribute('data-speed');
        this._setFanSpeed(speed);
      });
    });

    // Preset Chips with Immediate Optimistic Feedback
    root.querySelectorAll('#presetsRow .preset-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const mode = e.currentTarget.getAttribute('data-mode');
        this._setPresetMode(mode);
      });
    });

    // iOS Toggles
    root.getElementById('heaterToggleItem').addEventListener('click', () => this._toggleSwitch('heater'));
    root.getElementById('ecoToggleItem').addEventListener('click', () => this._toggleSwitch('eco'));
    root.getElementById('freeCoolingToggleItem').addEventListener('click', () => this._toggleSwitch('free_cooling'));
  }

  _updateValues() {
    if (!this._hass || !this.shadowRoot) return;
    const root = this.shadowRoot;

    // 1. Climate Entity & Target Temp
    const climateId = this._config.climate_entity || this._findEntity([/^climate\.systemair/]);
    const climate = climateId ? this._hass.states[climateId] : null;

    let targetTemp = 21.0;
    if (this._optimistic.targetTemp !== undefined) {
      targetTemp = this._optimistic.targetTemp;
    } else if (climate && climate.attributes) {
      const a = climate.attributes;
      const t = a.temperature ?? a.target_temp_high ?? a.target_temperature;
      if (t !== undefined && t !== null && !isNaN(parseFloat(t))) {
        targetTemp = parseFloat(t);
      }
    }
    const tempValElem = root.getElementById('tempVal');
    if (tempValElem) tempValElem.textContent = `${targetTemp.toFixed(1)}°C`;

    // 2. Preset Mode
    let currentMode = 'auto';
    if (this._optimistic.preset_mode !== undefined) {
      currentMode = this._optimistic.preset_mode;
    } else if (climate && climate.attributes && climate.attributes.preset_mode) {
      currentMode = climate.attributes.preset_mode.toLowerCase();
    }
    const modeBadge = root.getElementById('modeBadge');
    if (modeBadge) {
      modeBadge.textContent = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
    }
    root.querySelectorAll('#presetsRow .preset-chip').forEach(chip => {
      const m = chip.getAttribute('data-mode');
      chip.classList.toggle('active', m === currentMode);
    });

    // 3. Temperatures
    const outdoorId = this._config.outdoor_temp_entity || this._findEntity([
      'sensor.systemair_outdoor_air_temperature',
      /outdoor.*temp/i,
      /outdoor_air_temp/i
    ]);
    const supplyId = this._config.supply_temp_entity || this._findEntity([
      'sensor.systemair_supply_air_temperature',
      /supply.*temp/i,
      /supply_air_temp/i
    ]);
    const extractId = this._config.extract_temp_entity || this._findEntity([
      'sensor.systemair_extract_air_temperature',
      /extract.*temp/i,
      /extract_air_temp/i
    ]);
    const exhaustId = this._config.exhaust_temp_entity || this._findEntity([
      'sensor.systemair_exhaust_air_temperature',
      /exhaust.*temp/i,
      /exhaust_air_temp/i
    ]);

    const outdoorVal = this._getNum(outdoorId, null);
    const supplyVal  = this._getNum(supplyId, null);
    const extractVal = this._getNum(extractId, null);
    const exhaustVal = this._getNum(exhaustId, null);

    const outElem = root.getElementById('outdoorTempSvg');
    if (outElem) outElem.textContent = outdoorVal !== null ? `${outdoorVal.toFixed(1)}°C` : '--.-°C';

    const supElem = root.getElementById('supplyTempSvg');
    if (supElem) supElem.textContent = supplyVal !== null ? `${supplyVal.toFixed(1)}°C` : '20.0°C';

    const extElem = root.getElementById('extractTempSvg');
    if (extElem) extElem.textContent = extractVal !== null ? `${extractVal.toFixed(1)}°C` : '21.6°C';

    const exhElem = root.getElementById('exhaustTempSvg');
    if (exhElem) exhElem.textContent = exhaustVal !== null ? `${exhaustVal.toFixed(1)}°C` : '18.7°C';

    // Dynamic Supply Air Color Gradient (transitions toward red with temperature)
    const effectiveSupplyTemp = supplyVal !== null ? supplyVal : 20.0;
    const { start, end, glow } = this._getSupplyColors(effectiveSupplyTemp);
    this.style.setProperty('--supply-flow-start', start);
    this.style.setProperty('--supply-flow-end', end);
    this.style.setProperty('--supply-flow-glow', glow);

    // 4. Recovery Efficiency (%) & Dynamic Gauge Arc
    const effId = this._config.efficiency_entity || this._findEntity([
      'sensor.systemair_heat_exchanger_efficiency',
      /efficiency/i,
      /recovery/i
    ]);
    let effVal = this._getNum(effId, null);

    // Mathematical Fallback for Efficiency: (T_supply - T_outdoor) / (T_extract - T_outdoor) * 100%
    if (effVal === null && outdoorVal !== null && supplyVal !== null && extractVal !== null) {
      const deltaT = extractVal - outdoorVal;
      if (Math.abs(deltaT) > 1.5) {
        const calculated = ((supplyVal - outdoorVal) / deltaT) * 100;
        effVal = Math.max(0, Math.min(99, Math.round(calculated)));
      }
    }
    const finalEff = effVal !== null ? Math.round(effVal) : 87;
    const effElem = root.getElementById('rotorPctText');
    if (effElem) effElem.textContent = `${finalEff}%`;

    // Dynamic SVG Gauge Arc Length
    const gaugeArc = root.getElementById('rotorGaugeArc');
    if (gaugeArc) {
      const totalCircumference = 358.14; // 2 * Math.PI * 57
      const filled = (Math.max(5, Math.min(100, finalEff)) / 100) * totalCircumference;
      const blank = totalCircumference - filled;
      gaugeArc.setAttribute('stroke-dasharray', `${filled.toFixed(1)} ${blank.toFixed(1)}`);
    }

    // 5. Fans RPM and Speeds
    const safRpmId = this._config.saf_rpm_entity || this._findEntity([
      'sensor.systemair_supply_air_fan_rpm',
      /supply.*fan.*rpm/i,
      /saf.*rpm/i
    ]);
    const eafRpmId = this._config.eaf_rpm_entity || this._findEntity([
      'sensor.systemair_extract_air_fan_rpm',
      /extract.*fan.*rpm/i,
      /eaf.*rpm/i
    ]);
    const safRpm = this._getNum(safRpmId, 1200);
    const eafRpm = this._getNum(eafRpmId, 1140);

    const safElem = root.getElementById('supplyRpmSvgText');
    if (safElem) safElem.textContent = `SAF: ${safRpm} RPM`;
    const eafElem = root.getElementById('extractRpmSvgText');
    if (eafElem) eafElem.textContent = `EAF: ${eafRpm} RPM`;

    // Dynamic Spin Animation Speeds for Impellers
    const safSpinner = root.getElementById('supplyFanSpinner');
    if (safSpinner) {
      const dur = safRpm > 100 ? Math.max(0.3, Math.min(2.5, 1200 / safRpm)) : 0;
      safSpinner.style.animationDuration = `${dur.toFixed(2)}s`;
      safSpinner.style.animationPlayState = dur > 0 ? 'running' : 'paused';
    }
    const eafSpinner = root.getElementById('extractFanSpinner');
    if (eafSpinner) {
      const dur = eafRpm > 100 ? Math.max(0.3, Math.min(2.5, 1200 / eafRpm)) : 0;
      eafSpinner.style.animationDuration = `${dur.toFixed(2)}s`;
      eafSpinner.style.animationPlayState = dur > 0 ? 'running' : 'paused';
    }

    // 6. Secondary Sensors (RH, CO2, Airflow Volume)
    const rhId = this._config.rh_entity || this._findEntity([
      'sensor.systemair_relative_humidity',
      /humidity/i,
      /extract.*rh/i
    ]);
    const rhVal = this._getNum(rhId, 55);
    const rhElem = root.getElementById('extractRhSvg');
    if (rhElem) rhElem.textContent = `${Math.round(rhVal)}% RH`;

    const co2Id = this._config.co2_entity || this._findEntity([
      'sensor.systemair_co2_level',
      /co2/i
    ]);
    const co2Val = this._getNum(co2Id, 465);
    const co2Elem = root.getElementById('extractCo2Svg');
    if (co2Elem) co2Elem.textContent = `${Math.round(co2Val)} ppm CO₂`;

    const flowId = this._config.airflow_entity || this._findEntity([
      'sensor.systemair_supply_air_flow',
      /air.*flow/i,
      /volume/i
    ]);
    const flowVal = this._getNum(flowId, 81);
    const flowElem = root.getElementById('supplyFlowSvg');
    if (flowElem) flowElem.textContent = `${Math.round(flowVal)} m³/h`;

    // 7. Heater Active State & Coil Glow
    const heaterId = this._config.heater_entity || this._findEntity([
      'switch.systemair_heater',
      'switch.heater',
      /heater.*switch/i
    ]);
    let heaterActive = false;
    if (this._optimistic.heater !== undefined) {
      heaterActive = this._optimistic.heater;
    } else if (heaterId && this._hass.states[heaterId]) {
      heaterActive = this._hass.states[heaterId].state === 'on';
    }
    const heaterSwitch = root.getElementById('heaterSwitch');
    if (heaterSwitch) heaterSwitch.classList.toggle('on', heaterActive);

    const heaterCoil = root.getElementById('heaterCoil');
    if (heaterCoil) heaterCoil.classList.toggle('active', heaterActive);

    const heaterAura = root.getElementById('heaterAura');
    if (heaterAura) heaterAura.setAttribute('opacity', heaterActive ? '0.85' : '0');

    // 8. Eco Mode & Free Cooling Toggles
    const ecoId = this._config.eco_entity || this._findEntity([
      'switch.systemair_eco_mode',
      'switch.eco_mode',
      /eco/i
    ]);
    let ecoActive = this._optimistic.eco !== undefined ? this._optimistic.eco : (ecoId && this._hass.states[ecoId]?.state === 'on');
    const ecoSwitch = root.getElementById('ecoSwitch');
    if (ecoSwitch) ecoSwitch.classList.toggle('on', !!ecoActive);

    const freeCoolId = this._config.free_cooling_entity || this._findEntity([
      'switch.systemair_free_cooling',
      'switch.free_cooling',
      /free.*cool/i
    ]);
    let freeCoolActive = this._optimistic.free_cooling !== undefined ? this._optimistic.free_cooling : (freeCoolId && this._hass.states[freeCoolId]?.state === 'on');
    const freeCoolSwitch = root.getElementById('freeCoolingSwitch');
    if (freeCoolSwitch) freeCoolSwitch.classList.toggle('on', !!freeCoolActive);

    // 9. Active Fan Speed Pill
    let activeSpeed = null;
    if (this._optimistic.fanSpeed !== undefined) {
      activeSpeed = this._optimistic.fanSpeed;
    } else if (climate && climate.attributes && climate.attributes.fan_mode) {
      const fm = String(climate.attributes.fan_mode).toLowerCase();
      if (['1', '2', '3', '4', '5', 'boost'].includes(fm)) {
        activeSpeed = fm;
      } else if (fm === 'low') activeSpeed = '1';
      else if (fm === 'medium') activeSpeed = '3';
      else if (fm === 'high') activeSpeed = 'boost';
    }
    // Fallback: estimate from RPM if running in auto
    if (!activeSpeed && safRpm > 0) {
      if (safRpm < 600) activeSpeed = '1';
      else if (safRpm < 950) activeSpeed = '2';
      else if (safRpm < 1350) activeSpeed = '3';
      else if (safRpm < 1700) activeSpeed = '4';
      else activeSpeed = 'boost';
    }
    root.querySelectorAll('#fanPills .pill').forEach(btn => {
      const sp = btn.getAttribute('data-speed');
      btn.classList.toggle('active', sp === activeSpeed);
    });
  }

  // --- UI Action Callbacks ---
  _changeTargetTemp(delta) {
    if (!this._hass) return;
    const climateId = this._config.climate_entity || this._findEntity([/^climate\.systemair/]);
    if (!climateId) return;

    const climate = this._hass.states[climateId];
    let curTemp = 21.0;
    if (this._optimistic.targetTemp !== undefined) {
      curTemp = this._optimistic.targetTemp;
    } else if (climate && climate.attributes && climate.attributes.temperature) {
      curTemp = parseFloat(climate.attributes.temperature);
    }

    const nextTemp = Math.max(12, Math.min(30, Math.round((curTemp + delta) * 2) / 2));
    this._optimistic.targetTemp = nextTemp;
    this._updateValues();

    if (this._stepTimer) clearTimeout(this._stepTimer);
    this._stepTimer = setTimeout(() => {
      this._hass.callService('climate', 'set_temperature', {
        entity_id: climateId,
        temperature: nextTemp,
      }).then(() => {
        setTimeout(() => { delete this._optimistic.targetTemp; }, 3000);
      });
    }, 400);
  }

  _setFanSpeed(speed) {
    if (!this._hass) return;
    this._optimistic.fanSpeed = speed;
    this._updateValues();

    const climateId = this._config.climate_entity || this._findEntity([/^climate\.systemair/]);
    if (!climateId) return;

    this._hass.callService('climate', 'set_fan_mode', {
      entity_id: climateId,
      fan_mode: speed,
    }).then(() => {
      setTimeout(() => { delete this._optimistic.fanSpeed; }, 3500);
    });
  }

  _setPresetMode(mode) {
    if (!this._hass) return;
    this._optimistic.preset_mode = mode;
    this._updateValues();

    const climateId = this._config.climate_entity || this._findEntity([/^climate\.systemair/]);
    if (!climateId) return;

    this._hass.callService('climate', 'set_preset_mode', {
      entity_id: climateId,
      preset_mode: mode,
    }).then(() => {
      setTimeout(() => { delete this._optimistic.preset_mode; }, 3500);
    });
  }

  _toggleSwitch(type) {
    if (!this._hass) return;
    let entityId = null;
    if (type === 'heater') {
      entityId = this._config.heater_entity || this._findEntity(['switch.systemair_heater', 'switch.heater', /heater.*switch/i]);
    } else if (type === 'eco') {
      entityId = this._config.eco_entity || this._findEntity(['switch.systemair_eco_mode', 'switch.eco_mode', /eco/i]);
    } else if (type === 'free_cooling') {
      entityId = this._config.free_cooling_entity || this._findEntity(['switch.systemair_free_cooling', 'switch.free_cooling', /free.*cool/i]);
    }

    if (!entityId || !this._hass.states[entityId]) return;

    const cur = this._hass.states[entityId].state === 'on';
    const next = !cur;
    this._optimistic[type] = next;
    this._updateValues();

    this._hass.callService('switch', next ? 'turn_on' : 'turn_off', {
      entity_id: entityId,
    }).then(() => {
      setTimeout(() => { delete this._optimistic[type]; }, 3500);
    });
  }
}

// Automatic Custom Element Registration
if (!customElements.get('systemair-recuperator-card')) {
  customElements.define('systemair-recuperator-card', SystemairRecuperatorCard);
}

// Add Card to Lovelace Card Picker Registry
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'systemair-recuperator-card',
  name: 'Systemair Recuperator Card',
  description: 'Custom Lovelace card for Systemair SAVE ventilation units with realistic architectural cutaway and dynamic airflows.',
  preview: true,
  documentationURL: 'https://github.com/xpoh697/systemair',
});
