/**
 * Systemair Recuperator Lovelace Card
 * Custom Home Assistant card for Systemair SAVE ventilation units with heat recovery.
 * Fully matching visual mockup aesthetics: edge-to-edge large schematic, fluid airflows,
 * realistic snail blowers, dynamic supply air thermal gradient, active serpentine reheater,
 * bold high-visibility typography, native climate preset switching, and responsive controls.
 * Version: 1.0.33
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
      climate_entity: null,
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

  _getClimateId() {
    if (this._config.climate_entity && this._hass && this._hass.states[this._config.climate_entity]) {
      return this._config.climate_entity;
    }
    return this._findEntity([
      /^climate\.systemair_vtr/,
      /^climate\.systemair/,
      /^climate\./
    ]);
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

        /* Header Bar (Compacted to ensure Target Temp NEVER overflows) */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2px 2px 2px;
          gap: 6px;
          flex-wrap: nowrap;
          overflow: hidden;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex-shrink: 1;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 10px #22c55e;
          animation: pulseGlow 2.5s infinite;
          flex-shrink: 0;
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
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mode-badge {
          font-size: 0.74rem;
          font-weight: 600;
          color: #4ade80;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 12px;
          padding: 2px 8px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .mode-badge::before {
          content: "";
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #4ade80;
        }

        .header-right {
          flex-shrink: 0;
          margin-left: auto;
        }

        /* Target Temp Stepper (Fixed: Fits cleanly inside card bounds) */
        .temp-stepper {
          display: inline-flex;
          align-items: center;
          background: rgba(0, 0, 0, 0.42);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 10px;
          padding: 2px 4px;
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
          border-radius: 6px;
          transition: all 0.2s;
        }
        .temp-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }
        .temp-val {
          font-size: 0.98rem;
          font-weight: 800;
          color: #f8fafc;
          padding: 0 4px;
          min-width: 48px;
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
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
          transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .ios-switch.on {
          background: #3b82f6;
          border-color: #60a5fa;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
        }
        .ios-switch.on.orange {
          background: #ff9800;
          border-color: #ffb74d;
          box-shadow: 0 0 10px rgba(255, 152, 0, 0.4);
        }
        .ios-switch.on .thumb {
          transform: translateX(19px);
        }

        /* Presets Horizontal Row (100% Fit, Zero Overflow) */
        .presets-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px;
        }
        .preset-chip {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 8px 4px;
          text-align: center;
          font-size: 0.84rem;
          font-weight: 600;
          color: #cbd5e1;
          cursor: pointer;
          transition: all 0.2s;
          user-select: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .preset-chip:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.16);
        }
        .preset-chip.active {
          color: #ffffff;
          background: rgba(59, 130, 246, 0.22);
          border-color: #3b82f6;
          box-shadow: 0 0 14px rgba(59, 130, 246, 0.4);
          font-weight: 700;
        }

        /* Micro-screens adjustment */
        @media (max-width: 480px) {
          .toggles-group { gap: 10px; }
          .deck-row { flex-direction: column; align-items: flex-start; }
          .presets-row { grid-template-columns: repeat(5, 1fr); }
          .temp-outdoor, .temp-exhaust, .temp-extract, .temp-supply { font-size: 24px; }
        }
      </style>

      <ha-card>
        <div class="ambient-glow glow-left"></div>
        <div class="ambient-glow glow-right" id="ambientRight"></div>

        <div class="card-content">
          <!-- Header Bar -->
          <div class="header">
            <div class="header-left">
              <span class="status-dot"></span>
              <span class="title">${this._config.title || 'Systemair SAVE'}</span>
              <span class="mode-badge" id="modeBadge">Auto</span>
            </div>
            <div class="header-right">
              <div class="temp-stepper">
                <button class="temp-btn" id="tempDown">−</button>
                <span class="temp-val" id="tempVal">21.0°C</span>
                <button class="temp-btn" id="tempUp">+</button>
              </div>
            </div>
          </div>

          <!-- Edge-to-Edge Schematic Box (ViewBox 540x350) -->
          <div class="schematic-box">
            <svg class="schematic" viewBox="0 0 540 350" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <!-- Duct Collar Linear Gradients -->
                <linearGradient id="ductGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#2a3444"/>
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

              <!-- 3. Multi-layer Flow Streamlines -->
              <!-- Channel A: Outdoor Air (Fresh) into House as Supply Air -->
              <g id="supplyStreamGroup">
                <!-- Underglow Tracks -->
                <path d="M 0,86 C 160,86 210,135 270,175 C 330,215 380,264 540,264" fill="none" stroke="#0ea5e9" stroke-width="18" stroke-opacity="0.12" stroke-linecap="round"/>
                <path d="M 0,86 C 160,86 210,135 270,175 C 330,215 380,264 540,264" fill="none" stroke="#38bdf8" stroke-width="8" stroke-opacity="0.25" stroke-linecap="round"/>
                <!-- Upper Stream: Outdoor Fresh (Cool Cyan) -->
                <path d="M 0,86 C 160,86 210,135 270,175" class="flow-stream flow-outdoor" stroke-width="4.5" stroke-dasharray="14 10"/>
                <!-- Lower Stream: Supply Air into house (Tempered Amber/Orange/Red) -->
                <path d="M 270,175 C 330,215 380,264 540,264" class="flow-stream flow-supply" stroke-width="5" stroke-dasharray="14 10"/>
                <path d="M 270,175 C 330,215 380,264 540,264" class="flow-stream-fast" stroke="rgba(255, 255, 255, 0.45)" stroke-width="2" stroke-dasharray="6 14"/>
              </g>

              <!-- Channel B: Extract Air (Stale Warm) Discharged Outside as Exhaust Air -->
              <g id="exhaustStreamGroup">
                <!-- Underglow Tracks -->
                <path d="M 0,264 C 160,264 210,215 270,175 C 330,135 380,86 540,86" fill="none" stroke="#f59e0b" stroke-width="18" stroke-opacity="0.1" stroke-linecap="round"/>
                <path d="M 0,264 C 160,264 210,215 270,175 C 330,135 380,86 540,86" fill="none" stroke="#fbbf24" stroke-width="8" stroke-opacity="0.22" stroke-linecap="round"/>
                <!-- Extract Stream (Warm Amber/Yellow) -->
                <path d="M 0,264 C 160,264 210,215 270,175" class="flow-stream flow-extract" stroke-width="4.5" stroke-dasharray="14 10"/>
                <!-- Exhaust Stream (Cool Blue/Cyan) -->
                <path d="M 270,175 C 330,135 380,86 540,86" class="flow-stream flow-exhaust" stroke-width="4.5" stroke-dasharray="14 10"/>
                <path d="M 0,264 C 160,264 210,215 270,175 C 330,135 380,86 540,86" class="flow-stream-fast" stroke="rgba(255, 255, 255, 0.35)" stroke-width="1.8" stroke-dasharray="5 15"/>
              </g>

              <!-- 4. Top-Right Exhaust Snail Blower -->
              <g transform="translate(425, 95)">
                <path d="M -36,0 C -36,-24 -18,-40 12,-40 L 52,-40 L 52,-12 L 38,-12 C 42,16 26,40 0,40 C -24,40 -36,20 -36,0 Z" fill="url(#snailGrad)" stroke="#38455c" stroke-width="2"/>
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

              <!-- Central Filter Remaining Life Badge (Cleanly Integrated Under Rotary Recuperator) -->
              <g id="filterRemainingGroup">
                <rect x="155" y="270" width="230" height="22" rx="6" fill="#0f141c" stroke="#253043" stroke-width="1"/>
                <text x="270" y="285" text-anchor="middle" fill="#94a3b8" font-size="11.5" font-weight="600">
                  Filter remaining life: <tspan id="filterDaysSvg" fill="#38bdf8" font-weight="700">-- days</tspan>
                </text>
              </g>

              <!-- 8. BOLD HIGH-VISIBILITY SENSOR TYPOGRAPHY (Clear of All Stream Lines) -->
              <!-- Top-Left: Outdoor Air (Fresh label removed) -->
              <g>
                <text x="12" y="28" class="channel-title">Outdoor Air</text>
                <text x="12" y="52" class="temp-outdoor" id="outdoorTempSvg">-2.5°C</text>
              </g>

              <!-- Top-Right: Exhaust Air (Discharge label removed, with Airflow Volume) -->
              <g>
                <text x="528" y="28" text-anchor="end" class="channel-title">Exhaust Air</text>
                <text x="528" y="52" text-anchor="end" class="temp-exhaust" id="exhaustTempSvg">17.8°C</text>
                <text x="528" y="74" text-anchor="end" class="sensor-sub" id="exhaustFlowSvg">78 m³/h</text>
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
                  <button class="pill" data-speed="off">Off</button>
                  <button class="pill" data-speed="low">Low</button>
                  <button class="pill" data-speed="medium">Med</button>
                  <button class="pill" data-speed="high">Hi</button>
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

    // Preset Chips with Immediate Optimistic Feedback (Strictly via Climate)
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

    // 1. Discover Real Climate Entity & Target Temp
    const climateId = this._getClimateId();
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
      'sensor.systemair_vtr_300_b_r_outside_air_temperature',
      'sensor.systemair_outdoor_air_temperature',
      /out(door|side).*temp/i,
      /fresh.*temp/i
    ]);
    const supplyId = this._config.supply_temp_entity || this._findEntity([
      'sensor.systemair_vtr_300_b_r_supply_air_temperature',
      'sensor.systemair_supply_air_temperature',
      /supply.*temp/i
    ]);
    const exhaustId = this._config.exhaust_temp_entity || this._findEntity([
      'sensor.systemair_vtr_300_b_r_exhaust_air_temperature',
      'sensor.systemair_exhaust_air_temperature',
      /exhaust.*temp/i
    ]);
    const extractId = this._config.extract_temp_entity || this._findEntity([
      'sensor.systemair_vtr_300_b_r_extract_air_temperature',
      'sensor.systemair_extract_air_temperature',
      /extract.*temp/i
    ]);

    const outdoorTemp = this._getNum(outdoorId, -2.5);
    const supplyTemp  = this._getNum(supplyId, 20.5);
    const exhaustTemp = this._getNum(exhaustId, 17.8);
    const extractTemp = this._getNum(extractId, 22.0);

    const outElem = root.getElementById('outdoorTempSvg');
    if (outElem) outElem.textContent = outdoorTemp !== null ? `${outdoorTemp.toFixed(1)}°C` : '--°C';

    const supElem = root.getElementById('supplyTempSvg');
    if (supElem) supElem.textContent = supplyTemp !== null ? `${supplyTemp.toFixed(1)}°C` : '--°C';

    const exhElem = root.getElementById('exhaustTempSvg');
    if (exhElem) exhElem.textContent = exhaustTemp !== null ? `${exhaustTemp.toFixed(1)}°C` : '--°C';

    const extElem = root.getElementById('extractTempSvg');
    if (extElem) extElem.textContent = extractTemp !== null ? `${extractTemp.toFixed(1)}°C` : '--°C';

    // 3. Dynamic Thermal Gradient on Supply Duct
    const supColors = this._getSupplyColors(supplyTemp !== null ? supplyTemp : 21.0);
    this.style.setProperty('--supply-flow-start', supColors.start);
    this.style.setProperty('--supply-flow-end', supColors.end);
    this.style.setProperty('--supply-flow-glow', supColors.glow);

    // 4. Heat Exchanger Efficiency / Recovery Calculation
    let eff = null;
    const effId = this._config.efficiency_entity || this._findEntity([
      'sensor.systemair_vtr_300_b_r_thermal_efficiency',
      'sensor.systemair_efficiency',
      /efficiency/i,
      /recovery/i
    ]);
    if (effId) {
      eff = this._getNum(effId, null);
    }
    if (eff === null && outdoorTemp !== null && extractTemp !== null && supplyTemp !== null) {
      const denom = extractTemp - outdoorTemp;
      if (Math.abs(denom) > 1.5) {
        eff = ((supplyTemp - outdoorTemp) / denom) * 100;
        eff = Math.max(0, Math.min(99, eff));
      }
    }
    const finalEff = eff !== null ? Math.round(eff) : 87;
    const rotorText = root.getElementById('rotorPctText');
    if (rotorText) rotorText.textContent = `${finalEff}%`;

    const rotorArc = root.getElementById('rotorGaugeArc');
    if (rotorArc) {
      const circumference = 2 * Math.PI * 72; // ~452.38
      const fillLen = (finalEff / 100) * circumference;
      const gapLen = Math.max(0, circumference - fillLen);
      rotorArc.setAttribute('stroke-dasharray', `${fillLen.toFixed(1)} ${gapLen.toFixed(1)}`);
    }

    // 5. Fan RPM Callouts & Impeller Spinner Speeds
    const safRpmId = this._config.saf_rpm_entity || this._findEntity([
      'sensor.systemair_vtr_300_b_r_supply_fan_speed',
      'sensor.systemair_saf_rpm',
      /saf.*rpm/i,
      /supply.*fan.*speed/i,
      /saf.*speed/i
    ]);
    const eafRpmId = this._config.eaf_rpm_entity || this._findEntity([
      'sensor.systemair_vtr_300_b_r_extract_fan_speed',
      'sensor.systemair_eaf_rpm',
      /eaf.*rpm/i,
      /extract.*fan.*speed/i,
      /eaf.*speed/i
    ]);

    const safRpm = this._getNum(safRpmId, 1200);
    const eafRpm = this._getNum(eafRpmId, 1140);

    const safElem = root.getElementById('supplyRpmSvgText');
    if (safElem) safElem.textContent = safRpm !== null ? `SAF: ${Math.round(safRpm)} RPM` : 'SAF: --';

    const eafElem = root.getElementById('extractRpmSvgText');
    if (eafElem) eafElem.textContent = eafRpm !== null ? `EAF: ${Math.round(eafRpm)} RPM` : 'EAF: --';

    const supSpinner = root.getElementById('supplyFanSpinner');
    if (supSpinner) {
      const dur = safRpm && safRpm > 100 ? Math.max(0.3, 1200 / safRpm).toFixed(2) : 0;
      supSpinner.style.animationDuration = `${dur}s`;
      supSpinner.style.animationPlayState = (safRpm && safRpm > 100) ? 'running' : 'paused';
    }
    const extSpinner = root.getElementById('extractFanSpinner');
    if (extSpinner) {
      const dur = eafRpm && eafRpm > 100 ? Math.max(0.3, 1140 / eafRpm).toFixed(2) : 0;
      extSpinner.style.animationDuration = `${dur}s`;
      extSpinner.style.animationPlayState = (eafRpm && eafRpm > 100) ? 'running' : 'paused';
    }

    // 6. Airflow Volumes, CO2, Humidity
    const supplyFlowId = this._config.supply_airflow_entity || this._findEntity([
      'sensor.systemair_vtr_300_b_r_supply_air_flow',
      'sensor.systemair_supply_airflow',
      'sensor.systemair_supply_air_flow',
      /supply.*air.*flow/i,
      /supply.*flow/i
    ]);
    const supplyFlow = this._getNum(supplyFlowId, null);
    const flowElem = root.getElementById('supplyFlowSvg');
    if (flowElem) flowElem.textContent = supplyFlow !== null ? `${Math.round(supplyFlow)} m³/h` : '81 m³/h';

    // Exhaust Airflow Volume (sensor.systemair_exhaust_airflow ~78 m³/h)
    const exhaustFlowId = this._config.exhaust_airflow_entity || this._findEntity([
      'sensor.systemair_exhaust_airflow',
      'sensor.systemair_vtr_300_b_r_exhaust_air_flow',
      'sensor.systemair_vtr_300_b_r_extract_air_flow',
      'sensor.systemair_extract_air_flow',
      /exhaust.*(air)?flow/i,
      /extract.*(air)?flow/i,
    ]);
    const exhaustFlow = this._getNum(exhaustFlowId, null);
    const exhFlowElem = root.getElementById('exhaustFlowSvg');
    if (exhFlowElem) exhFlowElem.textContent = exhaustFlow !== null ? `${Math.round(exhaustFlow)} m³/h` : '78 m³/h';

    const rhId = this._config.humidity_entity || this._findEntity([
      'sensor.systemair_vtr_300_b_r_relative_humidity',
      'sensor.systemair_humidity',
      /relative.*humidity/i,
      /humidity/i
    ]);
    const rhVal = this._getNum(rhId, null);
    const rhElem = root.getElementById('extractRhSvg');
    if (rhElem) rhElem.textContent = rhVal !== null ? `${Math.round(rhVal)}% RH` : '48% RH';

    const co2Id = this._config.co2_entity || this._findEntity([
      'sensor.systemair_vtr_300_b_r_carbon_dioxide',
      'sensor.systemair_co2',
      /co2/i,
      /carbon.*dioxide/i
    ]);
    const co2Val = this._getNum(co2Id, null);
    const co2Elem = root.getElementById('extractCo2Svg');
    if (co2Elem) co2Elem.textContent = co2Val !== null ? `${Math.round(co2Val)} ppm CO₂` : '580 ppm CO₂';

    // 7. Physical Heating Status vs Heater Switch Toggle
    // The coil on diagram glows ONLY when the physical heating element is energized
    const activeHeatingId = this._config.heating_active_entity || this._findEntity([
      'binary_sensor.systemair_vtr_300_b_r_heater_active',
      'binary_sensor.systemair_vtr_300_b_r_heating_active',
      /^binary_sensor\..*heater.*active/i,
      /^binary_sensor\..*heating.*active/i,
    ]);
    const heatingDemandId = this._config.heating_demand_entity || this._findEntity([
      'sensor.systemair_vtr_300_b_r_heating_demand',
      'sensor.systemair_vtr_300_b_r_heater_output_value',
      /^sensor\..*heating_demand/i,
      /^sensor\..*heater_output/i,
    ]);

    let isHeatingPhysically = false;
    if (activeHeatingId && this._hass.states[activeHeatingId]) {
      isHeatingPhysically = this._hass.states[activeHeatingId].state === 'on';
    } else if (heatingDemandId && this._hass.states[heatingDemandId]) {
      const demand = parseFloat(this._hass.states[heatingDemandId].state);
      isHeatingPhysically = !isNaN(demand) && demand > 0;
    } else if (climate && climate.attributes && climate.attributes.hvac_action) {
      isHeatingPhysically = climate.attributes.hvac_action === 'heating';
    }

    const heaterCoil = root.getElementById('heaterCoil');
    if (heaterCoil) heaterCoil.classList.toggle('active', isHeatingPhysically);

    const heaterAura = root.getElementById('heaterAura');
    if (heaterAura) heaterAura.setAttribute('opacity', isHeatingPhysically ? '0.85' : '0');

    // The iOS toggle switch controls whether the heater is configured/enabled
    const heaterSwitchId = this._config.heater_switch_entity || this._findEntity([
      'switch.ventiliatsionnaia_systemair_vtr_300_b_r_heater',
      'switch.systemair_vtr_300_b_r_heater',
      'switch.systemair_heater',
      'switch.systemair_reheater',
      /^switch\..*heater/i,
    ]);
    let heaterSwitchOn = false;
    if (this._optimistic.heater !== undefined) {
      heaterSwitchOn = this._optimistic.heater;
    } else if (heaterSwitchId && this._hass.states[heaterSwitchId]) {
      heaterSwitchOn = this._hass.states[heaterSwitchId].state === 'on';
    }
    const heaterSwitch = root.getElementById('heaterSwitch');
    if (heaterSwitch) heaterSwitch.classList.toggle('on', heaterSwitchOn);

    // 8. Eco Mode & Free Cooling Toggles
    const ecoId = this._config.eco_entity || this._findEntity([
      'switch.systemair_vtr_300_b_r_eco_mode',
      'switch.systemair_eco_mode',
      'switch.eco_mode',
      /eco/i
    ]);
    let ecoActive = this._optimistic.eco !== undefined ? this._optimistic.eco : (ecoId && this._hass.states[ecoId] && this._hass.states[ecoId].state === 'on');
    const ecoSwitch = root.getElementById('ecoSwitch');
    if (ecoSwitch) ecoSwitch.classList.toggle('on', ecoActive);

    const freeCoolId = this._config.free_cooling_entity || this._findEntity([
      'switch.systemair_vtr_300_b_r_free_cooling',
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

    // 10. Update Active Fan Speed Pill (Off, Low, Med, Hi)
    let fanSpeed = this._optimistic.fan_speed || (climate && climate.attributes ? climate.attributes.fan_mode : null);
    if (climate && climate.state === 'off') {
      fanSpeed = 'off';
    }
    if (!fanSpeed && safRpm !== undefined) {
      if (safRpm < 100) fanSpeed = 'off';
      else if (safRpm < 850) fanSpeed = 'low';
      else if (safRpm < 1250) fanSpeed = 'medium';
      else fanSpeed = 'high';
    }
    let normSpeed = String(fanSpeed || 'medium').toLowerCase();
    if (normSpeed === '1') normSpeed = 'low';
    else if (normSpeed === '2' || normSpeed === 'med') normSpeed = 'medium';
    else if (normSpeed === '3' || normSpeed === 'hi') normSpeed = 'high';
    else if (normSpeed === '0') normSpeed = 'off';

    root.querySelectorAll('#fanPills .pill').forEach(pill => {
      const sp = pill.getAttribute('data-speed').toLowerCase();
      pill.classList.toggle('active', sp === normSpeed);
    });

    // 11. Update Filter Remaining Life
    const filterSensorId = this._config.filter_remaining_entity || this._findEntity([
      'sensor.systemair_vtr_300_b_r_filter_remaining_time',
      'sensor.systemair_filter_remaining_time',
      /^sensor\..*filter.*remaining.*time/i,
      /^sensor\..*filter.*remaining/i,
      /^sensor\..*filter.*time/i,
    ]);
    const filterDaysElem = root.getElementById('filterDaysSvg');
    if (filterDaysElem) {
      let daysText = '-- days';
      let daysColor = '#38bdf8';
      if (filterSensorId && this._hass.states[filterSensorId]) {
        const rawVal = parseFloat(this._hass.states[filterSensorId].state);
        if (!isNaN(rawVal)) {
          const days = rawVal > 1000 ? Math.round(rawVal / 86400) : Math.round(rawVal);
          if (days <= 0) {
            daysText = '0 days';
            daysColor = '#ef4444';
          } else {
            daysText = `${days} days`;
            daysColor = days < 30 ? '#f59e0b' : '#38bdf8';
          }
        }
      }
      filterDaysElem.textContent = daysText;
      filterDaysElem.setAttribute('fill', daysColor);
    }
  }

  // --- User Interaction Handlers (Pure Native Climate Integration) ---
  _changeTargetTemp(delta) {
    if (!this._hass) return;
    const climateId = this._getClimateId();
    if (!climateId) return;

    const climate = this._hass.states[climateId];
    const current = this._optimistic.targetTemp !== undefined
      ? this._optimistic.targetTemp
      : (climate && climate.attributes && climate.attributes.temperature !== undefined ? parseFloat(climate.attributes.temperature) : 21.0);

    const next = Math.max(12, Math.min(30, Math.round((current + delta) * 2) / 2));
    this._optimistic.targetTemp = next;
    this._updateValues();

    clearTimeout(this._stepTimer);
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
    const climateId = this._getClimateId();
    this._optimistic.fan_speed = speed;
    this._updateValues();

    if (!climateId) return;
    this._hass.callService('climate', 'set_fan_mode', {
      entity_id: climateId,
      fan_mode: speed,
    }).then(() => {
      setTimeout(() => { delete this._optimistic.fan_speed; }, 3500);
    }).catch(err => {
      console.warn('Fan mode set failed', err);
      delete this._optimistic.fan_speed;
      this._updateValues();
    });
  }

  _setPresetMode(preset) {
    if (!this._hass) return;
    const climateId = this._getClimateId();
    this._optimistic.preset = preset;
    this._updateValues();

    if (!climateId) {
      console.warn('Systemair card: climate entity not found for set_preset_mode');
      return;
    }

    // Call Home Assistant climate service directly
    this._hass.callService('climate', 'set_preset_mode', {
      entity_id: climateId,
      preset_mode: preset,
    }).then(() => {
      setTimeout(() => { delete this._optimistic.preset; }, 3500);
    }).catch(err => {
      console.warn('Preset set failed', err);
      delete this._optimistic.preset;
      this._updateValues();
    });
  }

  _toggleSwitch(type) {
    if (!this._hass) return;
    let entityId = null;
    if (type === 'heater') {
      entityId = this._config.heater_switch_entity || this._findEntity([
        'switch.ventiliatsionnaia_systemair_vtr_300_b_r_heater',
        'switch.systemair_vtr_300_b_r_heater',
        'switch.systemair_heater',
        'switch.systemair_reheater',
        /^switch\..*heater/i,
      ]);
    } else if (type === 'eco') {
      entityId = this._config.eco_entity || this._findEntity([
        'switch.systemair_vtr_300_b_r_eco_mode',
        'switch.systemair_eco_mode',
        'switch.eco_mode',
        /eco/i
      ]);
    } else if (type === 'free_cooling') {
      entityId = this._config.free_cooling_entity || this._findEntity([
        'switch.systemair_vtr_300_b_r_free_cooling',
        'switch.systemair_free_cooling',
        'switch.free_cooling',
        /free.*cool/i
      ]);
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
      // Fallback: check climate HVAC mode if no direct switch found
      const climateId = this._getClimateId();
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
