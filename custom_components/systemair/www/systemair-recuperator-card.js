/**
 * Systemair Recuperator Lovelace Card
 * Custom Home Assistant card for Systemair SAVE ventilation units with heat recovery.
 * Fully matching visual mockup aesthetics: edge-to-edge large schematic, fluid airflows,
 * realistic snail blowers, dynamic supply air thermal gradient, active serpentine reheater,
 * bold high-visibility typography, and responsive iOS-style controls.
 * Version: 1.0.31
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
          padding: 14px 10px 14px 10px;
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
          gap: 10px;
        }

        /* Header Bar */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 4px 2px 4px;
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
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #ffffff;
          white-space: nowrap;
        }
        .mode-badge {
          font-size: 0.78rem;
          font-weight: 600;
          color: #4ade80;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 12px;
          padding: 3px 10px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
        }
        .mode-badge::before {
          content: "";
          width: 6px;
          height: 6px;
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
          font-size: 1.2rem;
          font-weight: 600;
          width: 30px;
          height: 30px;
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
          font-size: 1.05rem;
          font-weight: 800;
          color: #f8fafc;
          padding: 0 8px;
          min-width: 58px;
          text-align: center;
          white-space: nowrap;
        }

        /* SVG Schematic Container - FULL CARD WIDTH */
        .schematic-box {
          position: relative;
          width: 100%;
          padding: 0;
          margin: 0;
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

        /* Rotary Wheel Spin (Centered strictly at 270px 175px) */
        .rotor-spin-group {
          transform-origin: 270px 175px;
          animation: rotorSpin 8s linear infinite;
          will-change: transform;
        }
        @keyframes rotorSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Serpentine Electric Reheater Coil (Refined & Compact) */
        .heater-coil {
          stroke: #64748b;
          stroke-width: 2.6;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: all 0.3s ease;
        }
        .heater-coil.active {
          stroke: #ff7a18;
          stroke-width: 3.4;
          filter: drop-shadow(0 0 6px rgba(255, 122, 24, 0.95)) drop-shadow(0 0 12px rgba(255, 90, 0, 0.7));
          animation: heaterPulse 2s ease-in-out infinite;
        }
        @keyframes heaterPulse {
          0%, 100% { stroke: #ff7a18; filter: drop-shadow(0 0 6px rgba(255, 122, 24, 0.85)); }
          50% { stroke: #ff9800; filter: drop-shadow(0 0 12px rgba(255, 152, 0, 1)); }
        }

        /* BOLD HIGH-VISIBILITY TYPOGRAPHY INSIDE SVG */
        .channel-title {
          fill: #e2e8f0;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.3px;
        }
        .sensor-tag {
          fill: #94a3b8;
          font-size: 12px;
          font-weight: 600;
        }
        .sensor-sub {
          fill: #cbd5e1;
          font-size: 13.5px;
          font-weight: 600;
        }
        .temp-outdoor { fill: #38bdf8; font-size: 28px; font-weight: 900; }
        .temp-exhaust { fill: #60a5fa; font-size: 28px; font-weight: 900; }
        .temp-extract { fill: #fbbf24; font-size: 28px; font-weight: 900; }
        .temp-supply  { fill: var(--supply-flow-end, #ff3b30); font-size: 28px; font-weight: 900; transition: fill 0.6s ease; }

        /* Controls Deck */
        .controls-deck {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 2px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
        }

        /* Fan Speed & Toggles Row */
        .deck-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          padding: 0 2px;
        }
        .fan-speed-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .deck-label {
          font-size: 0.9rem;
          font-weight: 600;
          color: #cbd5e1;
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
          font-size: 0.86rem;
          font-weight: 700;
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
          gap: 14px;
        }
        .toggle-item {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
        }
        .toggle-label {
          font-size: 0.88rem;
          font-weight: 600;
          color: #e2e8f0;
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
          color: #cbd5e1;
          font-size: clamp(0.72rem, 2.2vw, 0.85rem);
          font-weight: 600;
          padding: 7px 2px;
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

          <!-- Central Architectural Unit Cutaway SVG - MASSIVE FULL-WIDTH SCHEMATIC -->
          <div class="schematic-box">
            <svg class="schematic" viewBox="0 0 540 350" xmlns="http://www.w3.org/2000/svg">
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
                  <stop offset="0%" stop-color="#ff7a18" stop-opacity="0.85"/>
                  <stop offset="50%" stop-color="#ff9800" stop-opacity="0.45"/>
                  <stop offset="100%" stop-color="#ff5722" stop-opacity="0"/>
                </radialGradient>
              </defs>

              <!-- 1. Systemair Unit Chassis Frame (Expanded to 420px width x 320px height) -->
              <rect x="60" y="15" width="420" height="320" rx="20" fill="#141822" stroke="#252d3d" stroke-width="2.5"/>
              <rect x="67" y="22" width="406" height="306" rx="16" fill="#181d28" stroke="#1f2633" stroke-width="1.5"/>

              <!-- Internal Structural Rib Dividers -->
              <line x1="67" y1="175" x2="190" y2="175" stroke="#273142" stroke-width="2.5"/>
              <line x1="350" y1="175" x2="473" y2="175" stroke="#273142" stroke-width="2.5"/>
              <line x1="270" y1="22" x2="270" y2="95" stroke="#273142" stroke-width="2.5"/>
              <line x1="270" y1="255" x2="270" y2="328" stroke="#273142" stroke-width="2.5"/>

              <!-- 2. Four Edge-to-Edge Cylindrical Duct Collars -->
              <!-- Top-Left: Outdoor Air Duct -->
              <g>
                <rect x="0" y="56" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/>
                <line x1="60" y1="56" x2="60" y2="116" stroke="#475569" stroke-width="3"/>
                <line x1="10" y1="59" x2="10" y2="113" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.5"/>
              </g>

              <!-- Top-Right: Exhaust Air Duct -->
              <g>
                <rect x="470" y="56" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/>
                <line x1="480" y1="56" x2="480" y2="116" stroke="#475569" stroke-width="3"/>
                <line x1="530" y1="59" x2="530" y2="113" stroke="#60a5fa" stroke-width="1.5" stroke-opacity="0.5"/>
              </g>

              <!-- Bottom-Left: Extract Air Duct -->
              <g>
                <rect x="0" y="234" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/>
                <line x1="60" y1="234" x2="60" y2="294" stroke="#475569" stroke-width="3"/>
                <line x1="10" y1="237" x2="10" y2="291" stroke="#fbbf24" stroke-width="1.5" stroke-opacity="0.5"/>
              </g>

              <!-- Bottom-Right: Supply Air Duct -->
              <g>
                <rect x="470" y="234" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/>
                <line x1="480" y1="234" x2="480" y2="294" stroke="#475569" stroke-width="3"/>
                <line x1="530" y1="237" x2="530" y2="291" stroke="var(--supply-flow-end, #ff3b30)" stroke-width="1.5" stroke-opacity="0.5"/>
              </g>

              <!-- 3. Broad Volumetric Fluid Airflow Streams -->
              <!-- Outdoor Air Stream (Top-Left -> Center Rotor) -->
              <path d="M 5,86 C 95,86 155,108 210,155" fill="none" stroke="#06b6d4" stroke-width="32" stroke-opacity="0.09"/>
              <path d="M 5,86 C 95,86 155,108 210,155" fill="none" stroke="#06b6d4" stroke-width="12" stroke-opacity="0.35"/>
              <path class="flow-stream flow-outdoor" d="M 5,86 C 95,86 155,108 210,155" stroke-width="3.2" stroke-dasharray="14 8"/>
              <path class="flow-stream-fast flow-outdoor" d="M 5,90 C 95,90 153,112 208,158" stroke-width="1.5" stroke-dasharray="4 6" stroke-opacity="0.8"/>

              <!-- Extract Air Stream (Bottom-Left -> Center Rotor) -->
              <path d="M 5,264 C 95,264 155,242 210,195" fill="none" stroke="#f59e0b" stroke-width="32" stroke-opacity="0.09"/>
              <path d="M 5,264 C 95,264 155,242 210,195" fill="none" stroke="#f59e0b" stroke-width="12" stroke-opacity="0.35"/>
              <path class="flow-stream flow-extract" d="M 5,264 C 95,264 155,242 210,195" stroke-width="3.2" stroke-dasharray="14 8"/>
              <path class="flow-stream-fast flow-extract" d="M 5,260 C 95,260 153,238 208,192" stroke-width="1.5" stroke-dasharray="4 6" stroke-opacity="0.8"/>

              <!-- Exhaust Air Stream (Center Rotor -> Top Fan -> Exhaust Duct) -->
              <path d="M 330,155 C 355,135 375,105 535,86" fill="none" stroke="#3b82f6" stroke-width="32" stroke-opacity="0.09"/>
              <path d="M 330,155 C 355,135 375,105 535,86" fill="none" stroke="#3b82f6" stroke-width="12" stroke-opacity="0.35"/>
              <path class="flow-stream flow-exhaust" d="M 330,155 C 355,135 375,105 535,86" stroke-width="3.2" stroke-dasharray="14 8"/>
              <path class="flow-stream-fast flow-exhaust" d="M 330,151 C 355,131 375,101 535,82" stroke-width="1.5" stroke-dasharray="4 6" stroke-opacity="0.8"/>

              <!-- Supply Air Stream (Center Rotor -> Bottom Fan -> Heater -> Supply Duct) -->
              <path d="M 330,195 C 345,225 360,264 535,264" fill="none" stroke="url(#flowSupplyGrad)" stroke-width="32" stroke-opacity="0.12"/>
              <path d="M 330,195 C 345,225 360,264 535,264" fill="none" stroke="url(#flowSupplyGrad)" stroke-width="12" stroke-opacity="0.40"/>
              <path class="flow-stream flow-supply" d="M 330,195 C 345,225 360,264 535,264" stroke-width="3.4" stroke-dasharray="14 8"/>
              <path class="flow-stream-fast" d="M 330,199 C 345,229 360,268 535,268" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="4 6" stroke-opacity="0.85"/>

              <!-- 4. Top-Right Exhaust Snail Blower -->
              <g transform="translate(385, 105)">
                <path d="M -36,0 C -36,-24 -18,-40 12,-40 L 85,-40 L 85,-12 L 38,-12 C 42,16 26,40 0,40 C -24,40 -36,20 -36,0 Z" fill="url(#snailGrad)" stroke="#38455c" stroke-width="2"/>
                <circle cx="0" cy="0" r="30" fill="#131720" stroke="#252d3d" stroke-width="1.5"/>

                <!-- Backward-curved 8-Blade Centrifugal Impeller -->
                <g id="extractFanSpinner" class="fan-impeller">
                  <circle cx="0" cy="0" r="6" fill="#475569"/>
                  <path d="M 0,-5 C 9,-14 20,-9 24,2 C 18,3 9,0 0,-5 Z" fill="#cbd5e1"/>
                  <path d="M 5,0 C 14,9 9,20 -2,24 C -3,18 0,9 5,0 Z" fill="#cbd5e1"/>
                  <path d="M 0,5 C -9,14 -20,9 -24,-2 C -18,-3 -9,0 0,5 Z" fill="#cbd5e1"/>
                  <path d="M -5,0 C -14,-9 -9,-20 2,-24 C 3,-18 0,-9 -5,0 Z" fill="#cbd5e1"/>
                  <path d="M 4,-4 C 16,-5 20,7 16,18 C 11,13 6,6 4,-4 Z" fill="#94a3b8"/>
                  <path d="M 4,4 C 5,16 -7,20 -18,16 C -13,11 -6,6 4,4 Z" fill="#94a3b8"/>
                  <path d="M -4,4 C -16,5 -20,-7 -16,-18 C -11,-13 -6,-6 -4,4 Z" fill="#94a3b8"/>
                  <path d="M -4,-4 C -5,-16 7,-20 18,-16 C 13,-11 6,-6 -4,-4 Z" fill="#94a3b8"/>
                </g>
                <!-- Extended Angled Pointer Callout to EAF RPM -->
                <polyline points="20,28 45,45 80,45" fill="none" stroke="#64748b" stroke-width="1.2" stroke-dasharray="2 2"/>
                <text x="84" y="49" fill="#cbd5e1" font-size="13.5" font-weight="600" id="extractRpmSvgText">EAF: 1140 RPM</text>
              </g>

              <!-- 5. Bottom-Right Supply Snail Blower -->
              <g transform="translate(355, 255)">
                <path d="M -36,0 C -36,-24 -18,-40 12,-40 L 52,-40 L 52,-12 L 38,-12 C 42,16 26,40 0,40 C -24,40 -36,20 -36,0 Z" fill="url(#snailGrad)" stroke="#38455c" stroke-width="2"/>
                <circle cx="0" cy="0" r="30" fill="#131720" stroke="#252d3d" stroke-width="1.5"/>

                <!-- Backward-curved 8-Blade Centrifugal Impeller -->
                <g id="supplyFanSpinner" class="fan-impeller">
                  <circle cx="0" cy="0" r="6" fill="#475569"/>
                  <path d="M 0,-5 C 9,-14 20,-9 24,2 C 18,3 9,0 0,-5 Z" fill="#cbd5e1"/>
                  <path d="M 5,0 C 14,9 9,20 -2,24 C -3,18 0,9 5,0 Z" fill="#cbd5e1"/>
                  <path d="M 0,5 C -9,14 -20,9 -24,-2 C -18,-3 -9,0 0,5 Z" fill="#cbd5e1"/>
                  <path d="M -5,0 C -14,-9 -9,-20 2,-24 C 3,-18 0,-9 -5,0 Z" fill="#cbd5e1"/>
                  <path d="M 4,-4 C 16,-5 20,7 16,18 C 11,13 6,6 4,-4 Z" fill="#94a3b8"/>
                  <path d="M 4,4 C 5,16 -7,20 -18,16 C -13,11 -6,6 4,4 Z" fill="#94a3b8"/>
                  <path d="M -4,4 C -16,5 -20,-7 -16,-18 C -11,-13 -6,-6 -4,4 Z" fill="#94a3b8"/>
                  <path d="M -4,-4 C -5,-16 7,-20 18,-16 C 13,-11 6,-6 -4,-4 Z" fill="#94a3b8"/>
                </g>
                <!-- Extended Pointer Callout to SAF RPM -->
                <polyline points="0,40 0,55 -55,55" fill="none" stroke="#64748b" stroke-width="1.2" stroke-dasharray="2 2"/>
                <text x="-60" y="59" text-anchor="end" fill="#cbd5e1" font-size="13.5" font-weight="600" id="supplyRpmSvgText">SAF: 1200 RPM</text>
              </g>

              <!-- 6. Electric Reheater Serpentine Coil (Refined & Compact: 30x32px, 4 loops) -->
              <g id="heaterGroup">
                <!-- Warm Glow Aura Background (Compact) -->
                <ellipse id="heaterAura" cx="431" cy="255" rx="20" ry="17" fill="url(#heaterRadialGlow)" opacity="0"/>
                <!-- 4-loop Serpentine Coil Element (Compact, Refined) -->
                <path id="heaterCoil" class="heater-coil"
                  d="M 416,239 
                     L 416,271 A 5,5 0 0,0 426,271 
                     L 426,239 A 5,5 0 0,1 436,239 
                     L 436,271 A 5,5 0 0,0 446,271 
                     L 446,239" />
              </g>

              <!-- 7. Rotary Heat Exchanger (Scaled Up: r=80, Diameter 160px) -->
              <g id="rotorGroup">
                <!-- Outer Bezel -->
                <circle cx="270" cy="175" r="80" fill="#111620" stroke="#252f40" stroke-width="3.5"/>
                <!-- Multi-color Gradient Recovery Gauge Arc (Rotated -90deg, transform-origin at 270px 175px) -->
                <circle id="rotorGaugeArc" cx="270" cy="175" r="72" fill="none" stroke="url(#gaugeGrad)" stroke-width="5" stroke-dasharray="390 62" stroke-linecap="round" style="transition: stroke-dasharray 0.8s ease-out; transform: rotate(-90deg); transform-origin: 270px 175px;"/>

                <!-- Rotating Radial Vanes Matrix -->
                <g id="rotorWheel" class="rotor-spin-group">
                  <line x1="270" y1="103" x2="270" y2="247" stroke="#334155" stroke-width="1.2"/>
                  <line x1="198" y1="175" x2="342" y2="175" stroke="#334155" stroke-width="1.2"/>
                  <line x1="219" y1="124" x2="321" y2="226" stroke="#334155" stroke-width="1.2"/>
                  <line x1="219" y1="226" x2="321" y2="124" stroke="#334155" stroke-width="1.2"/>
                  <line x1="242" y1="107" x2="298" y2="243" stroke="#334155" stroke-width="1"/>
                  <line x1="298" y1="107" x2="242" y2="243" stroke="#334155" stroke-width="1"/>
                  <line x1="202" y1="147" x2="338" y2="203" stroke="#334155" stroke-width="1"/>
                  <line x1="202" y1="203" x2="338" y2="147" stroke="#334155" stroke-width="1"/>
                  <!-- Concentric Aluminum Matrix Ribs -->
                  <circle cx="270" cy="175" r="60" fill="none" stroke="#1e293b" stroke-width="15" stroke-dasharray="2 3"/>
                </g>

                <!-- Central Digital Efficiency Dial (Bold 30px & 11px) -->
                <circle cx="270" cy="175" r="48" fill="#141924" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5"/>
                <text x="270" y="178" text-anchor="middle" fill="#ffffff" font-size="30" font-weight="900" id="rotorPctText">87%</text>
                <text x="270" y="196" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="700" letter-spacing="1.2">RECOVERY</text>
              </g>

              <!-- 8. BOLD HIGH-VISIBILITY SENSOR TYPOGRAPHY (Clear of All Stream Lines) -->
              <!-- Top-Left: Outdoor Air (Placed Cleanly Above Duct Pipe) -->
              <g>
                <text x="12" y="28" class="channel-title">Outdoor Air</text>
                <text x="12" y="52" class="temp-outdoor" id="outdoorTempSvg">-2.5°C</text>
                <text x="105" y="51" class="sensor-tag">Fresh</text>
              </g>

              <!-- Top-Right: Exhaust Air (Placed Cleanly Above Duct Pipe) -->
              <g>
                <text x="528" y="28" text-anchor="end" class="channel-title">Exhaust Air</text>
                <text x="528" y="52" text-anchor="end" class="temp-exhaust" id="exhaustTempSvg">3.8°C</text>
                <text x="435" y="51" text-anchor="end" class="sensor-tag">Discharge</text>
              </g>

              <!-- Bottom-Left: Extract Air (Temp Above Duct, Humidity/CO2 Below Duct) -->
              <g>
                <text x="12" y="206" class="channel-title">Extract Air</text>
                <text x="12" y="230" class="temp-extract" id="extractTempSvg">22.0°C</text>
                <text x="12" y="314" class="sensor-sub" id="extractRhSvg">48% RH</text>
                <text x="82" y="314" class="sensor-sub" id="extractCo2Svg">580 ppm CO₂</text>
              </g>

              <!-- Bottom-Right: Supply Air (Temp Above Duct, Flow Below Duct) -->
              <g>
                <text x="528" y="206" text-anchor="end" class="channel-title">Supply Air</text>
                <text x="528" y="230" text-anchor="end" class="temp-supply" id="supplyTempSvg">20.5°C</text>
                <text x="528" y="314" text-anchor="end" class="sensor-sub" id="supplyFlowSvg">160 m³/h</text>
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

              <!-- iOS-Style Toggles -->
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

    // iOS Toggles (100% Clickable with Guaranteed Optimistic Response)
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
    } else if (climate && climate.attributes && climate.attributes.temperature !== undefined) {
      targetTemp = parseFloat(climate.attributes.temperature) || 21.0;
    }
    const tempValElem = root.getElementById('tempVal');
    if (tempValElem) tempValElem.textContent = `${targetTemp.toFixed(1)}°C`;

    // Mode Badge
    const presetMode = climate && climate.attributes ? climate.attributes.preset_mode : null;
    const hvacAction = climate && climate.attributes ? climate.attributes.hvac_action : null;
    const currentMode = this._optimistic.preset || presetMode || hvacAction || (climate ? climate.state : 'Auto');
    const badge = root.getElementById('modeBadge');
    if (badge) {
      const displayMode = (currentMode || 'Auto').charAt(0).toUpperCase() + (currentMode || 'Auto').slice(1);
      badge.textContent = displayMode;
    }

    // 2. Discover and Populate Temperatures
    const outdoorId = this._config.outdoor_temp_entity || this._findEntity([
      'sensor.systemair_outdoor_air_temperature',
      /outdoor.*temp/i,
      /fresh.*temp/i
    ]);
    const supplyId = this._config.supply_temp_entity || this._findEntity([
      'sensor.systemair_supply_air_temperature',
      /supply.*temp/i
    ]);
    const extractId = this._config.extract_temp_entity || this._findEntity([
      'sensor.systemair_extract_air_temperature',
      /extract.*temp/i
    ]);
    const exhaustId = this._config.exhaust_temp_entity || this._findEntity([
      'sensor.systemair_exhaust_air_temperature',
      /exhaust.*temp/i
    ]);

    const outdoorVal = this._getNum(outdoorId, -2.5);
    const supplyVal  = this._getNum(supplyId, 20.5);
    const extractVal = this._getNum(extractId, 22.0);
    const exhaustVal = this._getNum(exhaustId, 3.8);

    const outElem = root.getElementById('outdoorTempSvg');
    if (outElem) outElem.textContent = outdoorVal !== null ? `${outdoorVal.toFixed(1)}°C` : '--';

    const supElem = root.getElementById('supplyTempSvg');
    if (supElem) supElem.textContent = supplyVal !== null ? `${supplyVal.toFixed(1)}°C` : '--';

    const extElem = root.getElementById('extractTempSvg');
    if (extElem) extElem.textContent = extractVal !== null ? `${extractVal.toFixed(1)}°C` : '--';

    const exhElem = root.getElementById('exhaustTempSvg');
    if (exhElem) exhElem.textContent = exhaustVal !== null ? `${exhaustVal.toFixed(1)}°C` : '--';

    // 3. Dynamic Supply Air Color Gradient (Warmer red into the house)
    const colors = this._getSupplyColors(supplyVal);
    const host = this;
    host.style.setProperty('--supply-flow-start', colors.start);
    host.style.setProperty('--supply-flow-end', colors.end);
    host.style.setProperty('--supply-flow-glow', colors.glow);

    // 4. Heat Recovery Efficiency Calculation & Gauge
    const effId = this._config.efficiency_entity || this._findEntity([
      'sensor.systemair_heat_recovery_efficiency',
      /heat_recovery_efficiency/i,
      /efficiency/i,
      /recovery/i
    ]);
    let effVal = this._getNum(effId, null);
    if (effVal === null && outdoorVal !== null && extractVal !== null && supplyVal !== null) {
      const deltaT = extractVal - outdoorVal;
      if (Math.abs(deltaT) > 1.5) {
        const calculated = ((supplyVal - outdoorVal) / deltaT) * 100;
        effVal = Math.max(0, Math.min(99, Math.round(calculated)));
      }
    }
    const finalEff = effVal !== null ? Math.round(effVal) : 87;
    const effElem = root.getElementById('rotorPctText');
    if (effElem) effElem.textContent = `${finalEff}%`;

    // Dynamic SVG Gauge Arc Length (Circumference for r=72 is 2 * PI * 72 = 452.39)
    const gaugeArc = root.getElementById('rotorGaugeArc');
    if (gaugeArc) {
      const totalCircumference = 452.39;
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
    if (safElem) safElem.textContent = `SAF: ${Math.round(safRpm)} RPM`;

    const eafElem = root.getElementById('extractRpmSvgText');
    if (eafElem) eafElem.textContent = `EAF: ${Math.round(eafRpm)} RPM`;

    // Speed of Fan Spin Animations
    const safSpinner = root.getElementById('supplyFanSpinner');
    if (safSpinner) {
      const dur = safRpm > 100 ? Math.max(0.3, Math.min(3.0, 1800 / safRpm)) : 0;
      safSpinner.style.animationDuration = `${dur.toFixed(2)}s`;
      safSpinner.style.animationPlayState = safRpm > 100 ? 'running' : 'paused';
    }
    const eafSpinner = root.getElementById('extractFanSpinner');
    if (eafSpinner) {
      const dur = eafRpm > 100 ? Math.max(0.3, Math.min(3.0, 1800 / eafRpm)) : 0;
      eafSpinner.style.animationDuration = `${dur.toFixed(2)}s`;
      eafSpinner.style.animationPlayState = eafRpm > 100 ? 'running' : 'paused';
    }

    // 6. Airflow, Humidity, CO2
    const flowId = this._config.airflow_entity || this._findEntity([
      'sensor.systemair_supply_fan_airflow',
      /supply.*airflow/i,
      /airflow/i
    ]);
    const flowVal = this._getNum(flowId, 160);
    const flowElem = root.getElementById('supplyFlowSvg');
    if (flowElem) flowElem.textContent = `${Math.round(flowVal)} m³/h`;

    const rhId = this._config.rh_entity || this._findEntity([
      'sensor.systemair_extract_air_humidity',
      /extract.*humidity/i,
      /humidity/i
    ]);
    const rhVal = this._getNum(rhId, 48);
    const rhElem = root.getElementById('extractRhSvg');
    if (rhElem) rhElem.textContent = `${Math.round(rhVal)}% RH`;

    const co2Id = this._config.co2_entity || this._findEntity([
      'sensor.systemair_co2',
      /co2/i
    ]);
    const co2Val = this._getNum(co2Id, 580);
    const co2Elem = root.getElementById('extractCo2Svg');
    if (co2Elem) co2Elem.textContent = `${Math.round(co2Val)} ppm CO₂`;

    // 7. Heater Active State & Coil Glow
    const heaterId = this._config.heater_entity || this._findEntity([
      'switch.systemair_heater',
      'switch.systemair_reheater',
      'switch.heater',
      /^switch\..*heater/i,
      /heater/i
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
    let ecoActive = this._optimistic.eco !== undefined ? this._optimistic.eco : (ecoId && this._hass.states[ecoId] && this._hass.states[ecoId].state === 'on');
    const ecoSwitch = root.getElementById('ecoSwitch');
    if (ecoSwitch) ecoSwitch.classList.toggle('on', ecoActive);

    const freeCoolId = this._config.free_cooling_entity || this._findEntity([
      'switch.systemair_free_cooling',
      'switch.free_cooling',
      /free.*cool/i
    ]);
    let freeCoolActive = this._optimistic.free_cooling !== undefined ? this._optimistic.free_cooling : (freeCoolId && this._hass.states[freeCoolId] && this._hass.states[freeCoolId].state === 'on');
    const freeCoolSwitch = root.getElementById('freeCoolingSwitch');
    if (freeCoolSwitch) freeCoolSwitch.classList.toggle('on', freeCoolActive);

    // 9. Update Active Preset Chip
    const activePreset = (this._optimistic.preset || presetMode || '').toLowerCase();
    root.querySelectorAll('#presetsRow .preset-chip').forEach(chip => {
      const mode = chip.getAttribute('data-mode').toLowerCase();
      chip.classList.toggle('active', mode === activePreset);
    });

    // 10. Update Active Fan Speed Pill
    let fanSpeed = this._optimistic.fan_speed || (climate && climate.attributes ? climate.attributes.fan_mode : null);
    if (!fanSpeed && safRpm) {
      // Map RPM into 1..5 if fan_mode is missing
      if (safRpm < 600) fanSpeed = '1';
      else if (safRpm < 950) fanSpeed = '2';
      else if (safRpm < 1300) fanSpeed = '3';
      else if (safRpm < 1650) fanSpeed = '4';
      else fanSpeed = '5';
    }
    const activeSpeed = String(fanSpeed || '3').toLowerCase();
    root.querySelectorAll('#fanPills .pill').forEach(pill => {
      const sp = pill.getAttribute('data-speed').toLowerCase();
      pill.classList.toggle('active', sp === activeSpeed);
    });
  }

  // --- User Interaction Handlers with Instant Optimistic UI ---
  _changeTargetTemp(delta) {
    if (!this._hass) return;
    const climateId = this._config.climate_entity || this._findEntity([/^climate\.systemair/]);
    if (!climateId) return;

    const climate = this._hass.states[climateId];
    const current = this._optimistic.targetTemp !== undefined
      ? this._optimistic.targetTemp
      : (climate && climate.attributes ? parseFloat(climate.attributes.temperature) || 21.0 : 21.0);

    const next = Math.max(12.0, Math.min(30.0, Math.round((current + delta) * 2) / 2));
    this._optimistic.targetTemp = next;
    this._updateValues();

    if (this._stepTimer) clearTimeout(this._stepTimer);
    this._stepTimer = setTimeout(() => {
      this._hass.callService('climate', 'set_temperature', {
        entity_id: climateId,
        temperature: next,
      }).then(() => {
        setTimeout(() => { delete this._optimistic.targetTemp; }, 4000);
      }).catch(err => console.warn('Temp set failed', err));
    }, 450);
  }

  _setFanSpeed(speed) {
    if (!this._hass) return;
    const climateId = this._config.climate_entity || this._findEntity([/^climate\.systemair/]);
    this._optimistic.fan_speed = speed;
    this._updateValues();

    if (!climateId) return;
    this._hass.callService('climate', 'set_fan_mode', {
      entity_id: climateId,
      fan_mode: speed,
    }).then(() => {
      setTimeout(() => { delete this._optimistic.fan_speed; }, 4000);
    }).catch(err => console.warn('Fan mode set failed', err));
  }

  _setPresetMode(preset) {
    if (!this._hass) return;
    const climateId = this._config.climate_entity || this._findEntity([/^climate\.systemair/]);
    this._optimistic.preset = preset;
    this._updateValues();

    if (!climateId) return;
    this._hass.callService('climate', 'set_preset_mode', {
      entity_id: climateId,
      preset_mode: preset,
    }).then(() => {
      setTimeout(() => { delete this._optimistic.preset; }, 4000);
    }).catch(err => console.warn('Preset set failed', err));
  }

  _toggleSwitch(type) {
    if (!this._hass) return;
    let entityId = null;
    if (type === 'heater') {
      entityId = this._config.heater_entity || this._findEntity([
        'switch.systemair_heater',
        'switch.systemair_reheater',
        'switch.heater',
        /^switch\..*heater/i,
        /heater/i
      ]);
    } else if (type === 'eco') {
      entityId = this._config.eco_entity || this._findEntity(['switch.systemair_eco_mode', 'switch.eco_mode', /eco/i]);
    } else if (type === 'free_cooling') {
      entityId = this._config.free_cooling_entity || this._findEntity(['switch.systemair_free_cooling', 'switch.free_cooling', /free.*cool/i]);
    }

    // ALWAYS toggle optimistic state immediately so user sees instant feedback
    const curState = this._optimistic[type] !== undefined
      ? this._optimistic[type]
      : (entityId && this._hass.states[entityId] ? this._hass.states[entityId].state === 'on' : false);
    const nextState = !curState;
    this._optimistic[type] = nextState;
    this._updateValues();

    if (entityId && this._hass.states[entityId]) {
      this._hass.callService('switch', nextState ? 'turn_on' : 'turn_off', {
        entity_id: entityId,
      }).then(() => {
        setTimeout(() => { delete this._optimistic[type]; }, 4000);
      }).catch(err => console.warn('Switch service failed', err));
    } else if (type === 'heater') {
      // Fallback: check climate HVAC mode if no switch entity found
      const climateId = this._config.climate_entity || this._findEntity([/^climate\.systemair/]);
      if (climateId) {
        this._hass.callService('climate', 'set_hvac_mode', {
          entity_id: climateId,
          hvac_mode: nextState ? 'heat' : 'fan_only',
        }).then(() => {
          setTimeout(() => { delete this._optimistic[type]; }, 4000);
        }).catch(err => console.warn('Climate service fallback failed', err));
      }
    }
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
