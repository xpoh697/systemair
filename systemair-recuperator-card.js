/**
 * Systemair Recuperator Lovelace Card
 * Custom Home Assistant card for Systemair SAVE ventilation units with heat recovery.
 * Fully matching visual mockup aesthetics: zero-waste minimal margin layout, dynamic thermal
 * gradient for all 4 airflows (blue to red), realistic snail blowers, active reheater,
 * bold high-visibility typography, native climate switching, and interactive more-info support.
 * Version: 1.0.36
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
      outdoor_temp_entity: null,
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
      climate_entity: '',
      outdoor_temp_entity: '',
    };
  }

  static async getConfigElement() {
    return document.createElement('systemair-recuperator-card-editor');
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

  _fireMoreInfo(entityId) {
    if (!entityId || !this._hass || !this._hass.states[entityId]) return;
    const event = new CustomEvent('hass-more-info', {
      bubbles: true,
      composed: true,
      detail: { entityId },
    });
    this.dispatchEvent(event);
  }

  _setEntityTarget(el, entityId) {
    if (!el) return;
    if (entityId && this._hass && this._hass.states[entityId]) {
      el.setAttribute('data-entity-id', entityId);
      el.classList.add('clickable');
    } else {
      el.removeAttribute('data-entity-id');
      el.classList.remove('clickable');
    }
  }

  _interpolateColor(c1, c2, factor) {
    const f = Math.max(0, Math.min(1, factor));
    const r = Math.round(c1[0] + f * (c2[0] - c1[0]));
    const g = Math.round(c1[1] + f * (c2[1] - c1[1]));
    const b = Math.round(c1[2] + f * (c2[2] - c1[2]));
    return `rgb(${r}, ${g}, ${b})`;
  }

  _getTempColor(t) {
    if (t === null || !isFinite(t)) return '#38bdf8';
    if (t <= 0) {
      // Deep Blue (-10°C) to Cyan (0°C)
      const f = Math.max(0, Math.min(1, (t + 10) / 10));
      return this._interpolateColor([37, 99, 235], [6, 182, 212], f);
    } else if (t <= 14) {
      // Cyan (0°C) to Vivid Emerald (14°C)
      const f = t / 14;
      return this._interpolateColor([6, 182, 212], [16, 185, 129], f);
    } else if (t <= 19) {
      // Vivid Emerald (14°C) to Amber Gold (19°C)
      const f = (t - 14) / 5;
      return this._interpolateColor([16, 185, 129], [245, 158, 11], f);
    } else if (t <= 23) {
      // Amber Gold (19°C) to Fiery Orange (23°C)
      const f = (t - 19) / 4;
      return this._interpolateColor([245, 158, 11], [249, 115, 22], f);
    } else {
      // Fiery Orange (23°C) to Bright Coral Red (28°C+)
      const f = Math.min(1, (t - 23) / 5);
      return this._interpolateColor([249, 115, 22], [255, 59, 48], f);
    }
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          --card-bg: linear-gradient(160deg, #181b24 0%, #11141a 100%);
        }
        ha-card {
          background: var(--card-bg);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          box-shadow: 0 20px 45px -12px rgba(0, 0, 0, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.1);
          color: #f1f5f9;
          padding: 3px;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
        }

        .ambient-glow {
          position: absolute;
          width: 300px;
          height: 300px;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          opacity: 0.12;
          z-index: 0;
        }
        .glow-left { top: -60px; left: -60px; background: #06b6d4; }
        .glow-right { bottom: -60px; right: -60px; background: #ff3b30; }

        .card-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        /* HEADER PANEL (Zero-waste Compact Design) */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: linear-gradient(180deg, #1f2533 0%, #151922 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08), 0 3px 10px rgba(0, 0, 0, 0.35);
          padding: 5px 8px;
          gap: 6px;
          flex-wrap: nowrap;
          box-sizing: border-box;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex-shrink: 0;
        }
        .status-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 8px #22c55e;
          animation: pulseGlow 2.5s infinite;
          flex-shrink: 0;
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.25); opacity: 1; box-shadow: 0 0 12px #22c55e; }
        }
        .title {
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #ffffff;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .mode-badge {
          font-size: 0.72rem;
          font-weight: 600;
          color: #4ade80;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 10px;
          padding: 2px 6px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .mode-badge::before {
          content: "";
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #4ade80;
        }

        .header-right {
          flex-shrink: 0;
          margin-left: auto;
        }

        /* Target Temp Stepper */
        .temp-stepper {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: transparent;
          border: none;
          padding: 0;
          box-shadow: none;
          flex-shrink: 0;
        }
        .temp-btn {
          background: #252b37;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #f1f5f9;
          font-size: 1.05rem;
          font-weight: 700;
          width: 28px;
          height: 28px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 7px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
          user-select: none;
        }
        .temp-btn:hover {
          background: #2f3747;
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.16);
        }
        .temp-btn:active {
          transform: scale(0.92);
          background: #1a1f29;
        }
        .temp-val {
          font-size: 1.02rem;
          font-weight: 800;
          color: #f8fafc;
          padding: 0 2px;
          min-width: 44px;
          text-align: center;
          white-space: nowrap;
          letter-spacing: -0.01em;
        }

        .clickable {
          cursor: pointer;
          transition: opacity 0.2s ease, filter 0.2s ease;
        }
        .clickable:hover {
          opacity: 0.82;
          filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.4));
        }

        /* SVG Schematic Container */
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

        .fan-impeller {
          transform-origin: 0px 0px;
          animation: fanSpin 1.2s linear infinite;
          will-change: transform;
        }
        @keyframes fanSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .rotor-spin-group {
          transform-origin: 270px 175px;
          animation: rotorSpin 8s linear infinite;
          will-change: transform;
        }
        @keyframes rotorSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

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
        .temp-val-svg {
          font-size: 28px;
          font-weight: 900;
          transition: fill 0.5s ease;
        }

        /* FOOTER CONTROLS PANEL (Zero-waste 3-Row Layout) */
        .controls-deck {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: linear-gradient(180deg, #1f2533 0%, #151922 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08), 0 3px 10px rgba(0, 0, 0, 0.35);
          padding: 6px 8px;
          box-sizing: border-box;
        }

        /* Row 1: Fan Speed Control */
        .deck-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .fan-speed-group {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          gap: 6px;
        }
        .deck-label {
          font-size: 0.84rem;
          font-weight: 600;
          color: #cbd5e1;
          white-space: nowrap;
        }
        .pills-container {
          display: inline-flex;
          gap: 2px;
          background: rgba(0, 0, 0, 0.38);
          padding: 2px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.07);
        }
        .pill {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 0.82rem;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 7px;
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
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
        }

        /* Row 2: 3-Column Centered Toggles (100% Fit, Zero Overflow) */
        .toggles-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px;
          width: 100%;
        }
        .toggle-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          user-select: none;
        }
        .toggle-label {
          font-size: 0.76rem;
          font-weight: 600;
          color: #cbd5e1;
          white-space: nowrap;
          text-align: center;
          line-height: 1.1;
        }
        .ios-switch {
          width: 34px;
          height: 19px;
          border-radius: 10px;
          background: #252b36;
          border: 1px solid rgba(255, 255, 255, 0.1);
          position: relative;
          transition: background 0.25s, border-color 0.25s, box-shadow 0.25s;
          flex-shrink: 0;
          cursor: pointer;
        }
        .ios-switch .thumb {
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: #ffffff;
          position: absolute;
          top: 1px;
          left: 1px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
          transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .ios-switch.on {
          background: #3b82f6;
          border-color: #60a5fa;
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
        }
        .ios-switch.on.orange {
          background: #ff9800;
          border-color: #ffb74d;
          box-shadow: 0 0 8px rgba(255, 152, 0, 0.4);
        }
        .ios-switch.on .thumb {
          transform: translateX(15px);
        }

        /* Row 3: Presets Grid */
        .presets-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
        }
        .preset-chip {
          background: #252b37;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 9px;
          padding: 6px 2px;
          text-align: center;
          font-size: 0.80rem;
          font-weight: 600;
          color: #cbd5e1;
          cursor: pointer;
          transition: all 0.2s;
          user-select: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        .preset-chip:hover {
          color: #ffffff;
          background: #2e3646;
          border-color: rgba(255, 255, 255, 0.15);
        }
        .preset-chip.active {
          color: #ffffff;
          background: #3b475a;
          border-color: rgba(255, 255, 255, 0.25);
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.15);
          font-weight: 700;
        }
      </style>

      <ha-card>
        <div class="ambient-glow glow-left"></div>
        <div class="ambient-glow glow-right"></div>

        <div class="card-content">
          <!-- Header Bar (Capsule Panel) -->
          <div class="header">
            <div class="header-left clickable" id="headerClimateGroup">
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

          <!-- Schematic Box (ViewBox 540x350) -->
          <div class="schematic-box">
            <svg class="schematic" viewBox="0 0 540 350" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ductGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#2a3444"/>
                  <stop offset="35%" stop-color="#1e2532" stop-opacity="0.7"/>
                  <stop offset="70%" stop-color="#141822" stop-opacity="0.9"/>
                  <stop offset="100%" stop-color="#0f131a" stop-opacity="0.95"/>
                </linearGradient>

                <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#f59e0b"/>
                  <stop offset="50%" stop-color="#10b981"/>
                  <stop offset="100%" stop-color="#3b82f6"/>
                </linearGradient>

                <linearGradient id="snailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#252d3d"/>
                  <stop offset="100%" stop-color="#131720"/>
                </linearGradient>

                <radialGradient id="heaterRadialGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#ff7a18" stop-opacity="0.85"/>
                  <stop offset="50%" stop-color="#ff9800" stop-opacity="0.45"/>
                  <stop offset="100%" stop-color="#ff5722" stop-opacity="0"/>
                </radialGradient>
              </defs>

              <!-- Chassis Frame -->
              <rect x="60" y="15" width="420" height="320" rx="20" fill="#141822" stroke="#252d3d" stroke-width="2.5"/>
              <rect x="67" y="22" width="406" height="306" rx="16" fill="#181d28" stroke="#1f2633" stroke-width="1.5"/>

              <!-- Rib Dividers -->
              <line x1="67" y1="175" x2="190" y2="175" stroke="#273142" stroke-width="2.5"/>
              <line x1="350" y1="175" x2="473" y2="175" stroke="#273142" stroke-width="2.5"/>
              <line x1="270" y1="22" x2="270" y2="95" stroke="#273142" stroke-width="2.5"/>
              <line x1="270" y1="255" x2="270" y2="320" stroke="#273142" stroke-width="2.5"/>

              <!-- Duct Collars with Dynamic Thermal Lines -->
              <g><rect x="0" y="56" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/><line x1="60" y1="56" x2="60" y2="116" stroke="#475569" stroke-width="3"/><line id="outdoorDuctLine" x1="10" y1="59" x2="10" y2="113" stroke="#38bdf8" stroke-width="1.8"/></g>
              <g><rect x="470" y="56" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/><line x1="480" y1="56" x2="480" y2="116" stroke="#475569" stroke-width="3"/><line id="exhaustDuctLine" x1="530" y1="59" x2="530" y2="113" stroke="#60a5fa" stroke-width="1.8"/></g>
              <g><rect x="0" y="234" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/><line x1="60" y1="234" x2="60" y2="294" stroke="#475569" stroke-width="3"/><line id="extractDuctLine" x1="10" y1="237" x2="10" y2="291" stroke="#fbbf24" stroke-width="1.8"/></g>
              <g><rect x="470" y="234" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/><line x1="480" y1="234" x2="480" y2="294" stroke="#475569" stroke-width="3"/><line id="supplyDuctLine" x1="530" y1="237" x2="530" y2="291" stroke="#ff3b30" stroke-width="1.8"/></g>

              <!-- Dynamic Multi-layer Flow Streamlines -->
              <g id="supplyStreamGroup">
                <path id="outdoorUnderglow" d="M 0,86 C 160,86 210,135 270,175" fill="none" stroke="#0ea5e9" stroke-width="18" stroke-opacity="0.15" stroke-linecap="round"/>
                <path id="supplyUnderglow" d="M 270,175 C 330,215 380,264 540,264" fill="none" stroke="#ff3b30" stroke-width="18" stroke-opacity="0.15" stroke-linecap="round"/>
                <!-- Outdoor Fresh Stream (Dynamic Color) -->
                <path id="outdoorStream" d="M 0,86 C 160,86 210,135 270,175" class="flow-stream" stroke="#38bdf8" stroke-width="4.5" stroke-dasharray="14 10"/>
                <!-- Supply Air Stream (Dynamic Color) -->
                <path id="supplyStream" d="M 270,175 C 330,215 380,264 540,264" class="flow-stream" stroke="#ff3b30" stroke-width="5" stroke-dasharray="14 10"/>
                <path d="M 270,175 C 330,215 380,264 540,264" class="flow-stream-fast" stroke="rgba(255, 255, 255, 0.45)" stroke-width="2" stroke-dasharray="6 14"/>
              </g>

              <g id="exhaustStreamGroup">
                <path id="extractUnderglow" d="M 0,264 C 160,264 210,215 270,175" fill="none" stroke="#f59e0b" stroke-width="18" stroke-opacity="0.15" stroke-linecap="round"/>
                <path id="exhaustUnderglow" d="M 270,175 C 330,135 380,86 540,86" fill="none" stroke="#60a5fa" stroke-width="18" stroke-opacity="0.15" stroke-linecap="round"/>
                <!-- Extract Stream (Dynamic Color) -->
                <path id="extractStream" d="M 0,264 C 160,264 210,215 270,175" class="flow-stream" stroke="#fbbf24" stroke-width="4.5" stroke-dasharray="14 10"/>
                <!-- Exhaust Stream (Dynamic Color) -->
                <path id="exhaustStream" d="M 270,175 C 330,135 380,86 540,86" class="flow-stream" stroke="#60a5fa" stroke-width="4.5" stroke-dasharray="14 10"/>
                <path d="M 0,264 C 160,264 210,215 270,175" class="flow-stream-fast" stroke="rgba(255, 255, 255, 0.35)" stroke-width="1.8" stroke-dasharray="5 15"/>
              </g>

              <!-- Exhaust Fan (EAF Snail Volute & Rotor) -->
              <g transform="translate(425, 95)" id="extractFanGroup" class="clickable">
                <path d="M -36,0 C -36,-24 -18,-40 12,-40 L 52,-40 L 52,-12 L 38,-12 C 42,16 26,40 0,40 C -24,40 -36,20 -36,0 Z" fill="url(#snailGrad)" stroke="#38455c" stroke-width="2"/>
                <circle cx="0" cy="0" r="30" fill="#131720" stroke="#252d3d" stroke-width="1.5"/>
                <g id="extractFanSpinner" class="fan-impeller">
                  <circle cx="0" cy="0" r="6" fill="#475569"/>
                  <path d="M 0,-5 C 9,-14 20,-9 24,2 C 18,3 9,0 0,-5 Z" fill="#cbd5e1"/>
                  <path d="M 5,0 C 14,9 9,20 -2,24 C -3,18 0,9 5,0 Z" fill="#cbd5e1"/>
                  <path d="M 0,5 C -9,14 -20,9 -24,-2 C -18,-3 -9,0 0,5 Z" fill="#cbd5e1"/>
                  <path d="M -5,0 C -14,-9 -9,-20 2,-24 C 3,-18 0,-9 -5,0 Z" fill="#cbd5e1"/>
                </g>
              </g>

              <!-- Supply Fan (SAF Snail Volute & Rotor) -->
              <g transform="translate(355, 255)" id="supplyFanGroup" class="clickable">
                <path d="M -36,0 C -36,-24 -18,-40 12,-40 L 52,-40 L 52,-12 L 38,-12 C 42,16 26,40 0,40 C -24,40 -36,20 -36,0 Z" fill="url(#snailGrad)" stroke="#38455c" stroke-width="2"/>
                <circle cx="0" cy="0" r="30" fill="#131720" stroke="#252d3d" stroke-width="1.5"/>
                <g id="supplyFanSpinner" class="fan-impeller">
                  <circle cx="0" cy="0" r="6" fill="#475569"/>
                  <path d="M 0,-5 C 9,-14 20,-9 24,2 C 18,3 9,0 0,-5 Z" fill="#cbd5e1"/>
                  <path d="M 5,0 C 14,9 9,20 -2,24 C -3,18 0,9 5,0 Z" fill="#cbd5e1"/>
                  <path d="M 0,5 C -9,14 -20,9 -24,-2 C -18,-3 -9,0 0,5 Z" fill="#cbd5e1"/>
                  <path d="M -5,0 C -14,-9 -9,-20 2,-24 C 3,-18 0,-9 -5,0 Z" fill="#cbd5e1"/>
                </g>
                <polyline points="0,40 0,55 -55,55" fill="none" stroke="#64748b" stroke-width="1.2" stroke-dasharray="2 2"/>
                <text x="-60" y="59" text-anchor="end" fill="#cbd5e1" font-size="13.5" font-weight="600" id="supplyRpmSvgText">SAF: 1200 RPM</text>
              </g>

              <!-- Electric Reheater Coil -->
              <g id="heaterGroup" class="clickable">
                <ellipse id="heaterAura" cx="431" cy="255" rx="20" ry="17" fill="url(#heaterRadialGlow)" opacity="0"/>
                <path id="heaterCoil" class="heater-coil"
                  d="M 416,239 L 416,271 A 5,5 0 0,0 426,271 L 426,239 A 5,5 0 0,1 436,239 L 436,271 A 5,5 0 0,0 446,271 L 446,239" />
              </g>

              <!-- Rotary Heat Exchanger -->
              <g id="rotorGroup" class="clickable">
                <circle cx="270" cy="175" r="80" fill="#111620" stroke="#252f40" stroke-width="3.5"/>
                <circle id="rotorGaugeArc" cx="270" cy="175" r="72" fill="none" stroke="url(#gaugeGrad)" stroke-width="5" stroke-dasharray="390 62" stroke-linecap="round" style="transition: stroke-dasharray 0.8s ease-out; transform: rotate(-90deg); transform-origin: 270px 175px;"/>
                <g id="rotorWheel" class="rotor-spin-group">
                  <line x1="270" y1="103" x2="270" y2="247" stroke="#334155" stroke-width="1.2"/>
                  <line x1="198" y1="175" x2="342" y2="175" stroke="#334155" stroke-width="1.2"/>
                  <line x1="219" y1="124" x2="321" y2="226" stroke="#334155" stroke-width="1.2"/>
                  <line x1="219" y1="226" x2="321" y2="124" stroke="#334155" stroke-width="1.2"/>
                  <circle cx="270" cy="175" r="60" fill="none" stroke="#1e293b" stroke-width="15" stroke-dasharray="2 3"/>
                </g>
                <circle cx="270" cy="175" r="48" fill="#141924" stroke="rgba(255, 255, 255, 0.12)" stroke-width="1.5"/>
                <text x="270" y="178" text-anchor="middle" fill="#ffffff" font-size="30" font-weight="900" id="rotorPctText">--%</text>
                <text x="270" y="196" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="700" letter-spacing="1.2">RECOVERY</text>
              </g>

              <!-- Central Filter Remaining Life Badge (Accurate Days) -->
              <g id="filterRemainingGroup" class="clickable">
                <rect x="155" y="324" width="230" height="21" rx="5" fill="#0f141c" stroke="#253043" stroke-width="1"/>
                <text x="270" y="339" text-anchor="middle" fill="#94a3b8" font-size="11.5" font-weight="600">
                  Filter remaining life: <tspan id="filterDaysSvg" fill="#38bdf8" font-weight="700">-- days</tspan>
                </text>
              </g>

              <!-- SENSOR TYPOGRAPHY (Rendered on Top of Everything) -->
              <!-- Top-Right EAF RPM Callout (Centered strictly below EAF blower, 100% visible, outside rotor) -->
              <g id="extractFanRpmGroup" class="clickable">
                <polyline points="425,130 425,145" fill="none" stroke="#64748b" stroke-width="1.2" stroke-dasharray="2 2"/>
                <text x="425" y="158" text-anchor="middle" fill="#cbd5e1" font-size="12.5" font-weight="700" id="extractRpmSvgText">EAF: 1140 RPM</text>
              </g>

              <!-- Top-Left: Outdoor Air -->
              <g id="outdoorAirGroup" class="clickable">
                <text x="12" y="28" class="channel-title">Outdoor Air</text>
                <text x="12" y="52" class="temp-val-svg" id="outdoorTempSvg">-2.5°C</text>
              </g>

              <!-- Top-Right: Exhaust Air -->
              <g id="exhaustAirGroup" class="clickable">
                <text x="528" y="28" text-anchor="end" class="channel-title">Exhaust Air</text>
                <text x="528" y="52" text-anchor="end" class="temp-val-svg" id="exhaustTempSvg">17.8°C</text>
                <text x="528" y="74" text-anchor="end" class="sensor-sub" id="exhaustFlowSvg">78 m³/h</text>
              </g>

              <!-- Bottom-Left: Extract Air (Stacked Vertically: RH at y=312, CO2 at y=329) -->
              <g id="extractAirGroup" class="clickable">
                <text x="12" y="206" class="channel-title">Extract Air</text>
                <text x="12" y="230" class="temp-val-svg" id="extractTempSvg">22.0°C</text>
                <text x="12" y="312" class="sensor-sub clickable" id="extractRhSvg">48% RH</text>
                <text x="12" y="329" class="sensor-sub clickable" id="extractCo2Svg">580 ppm CO₂</text>
              </g>

              <!-- Bottom-Right: Supply Air -->
              <g id="supplyAirGroup" class="clickable">
                <text x="528" y="206" text-anchor="end" class="channel-title">Supply Air</text>
                <text x="528" y="230" text-anchor="end" class="temp-val-svg" id="supplyTempSvg">20.5°C</text>
                <text x="528" y="314" text-anchor="end" class="sensor-sub" id="supplyFlowSvg">160 m³/h</text>
              </g>
            </svg>
          </div>

          <!-- Controls Deck (Capsule Panel) -->
          <div class="controls-deck">
            <!-- Row 1: Fan Speed Selector -->
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
            </div>

            <!-- Row 2: 3-Column Centered Toggles (100% Fit, Zero Overflow) -->
            <div class="toggles-grid">
              <div class="toggle-col">
                <div class="ios-switch orange" id="heaterSwitch"><div class="thumb"></div></div>
                <span class="toggle-label clickable" id="heaterLabel">Heater</span>
              </div>
              <div class="toggle-col">
                <div class="ios-switch" id="ecoSwitch"><div class="thumb"></div></div>
                <span class="toggle-label clickable" id="ecoLabel">Eco Mode</span>
              </div>
              <div class="toggle-col">
                <div class="ios-switch" id="freeCoolingSwitch"><div class="thumb"></div></div>
                <span class="toggle-label clickable" id="freeCoolingLabel">Free Cooling</span>
              </div>
            </div>

            <!-- Row 3: Presets Grid -->
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
    root.getElementById('tempDown').addEventListener('click', (e) => {
      e.stopPropagation();
      this._changeTargetTemp(-0.5);
    });
    root.getElementById('tempUp').addEventListener('click', (e) => {
      e.stopPropagation();
      this._changeTargetTemp(+0.5);
    });

    // Fan Speed Pills
    root.querySelectorAll('#fanPills .pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const speed = e.currentTarget.getAttribute('data-speed');
        this._setFanSpeed(speed);
      });
    });

    // Presets Row
    root.querySelectorAll('#presetsRow .preset-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = e.currentTarget.getAttribute('data-mode');
        this._setPresetMode(mode);
      });
    });

    // iOS Toggles (Switch Clicks are Strictly Isolated from more-info)
    root.getElementById('heaterSwitch').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleSwitch('heater');
    });
    root.getElementById('ecoSwitch').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleSwitch('eco');
    });
    root.getElementById('freeCoolingSwitch').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleSwitch('free_cooling');
    });

    // Generic Event Delegation for [data-entity-id] Elements (more-info)
    root.addEventListener('click', (e) => {
      const path = e.composedPath();
      for (const el of path) {
        if (el && el.getAttribute && el.getAttribute('data-entity-id')) {
          const entityId = el.getAttribute('data-entity-id');
          if (entityId) {
            this._fireMoreInfo(entityId);
            break;
          }
        }
      }
    });
  }

  _updateValues() {
    if (!this._hass || !this.shadowRoot) return;
    const root = this.shadowRoot;

    // 1. Discover Real Climate Entity & Target Temp
    const climateId = this._getClimateId();
    const climate = climateId ? this._hass.states[climateId] : null;
    this._setEntityTarget(root.getElementById('headerClimateGroup'), climateId);

    const tempVal = root.getElementById('tempVal');
    const modeBadge = root.getElementById('modeBadge');

    let currentTargetTemp = 21.0;
    if (this._optimistic.target_temperature !== undefined) {
      currentTargetTemp = this._optimistic.target_temperature;
    } else if (climate && climate.attributes) {
      if (typeof climate.attributes.temperature === 'number') {
        currentTargetTemp = climate.attributes.temperature;
      } else if (typeof climate.attributes.target_temperature_high === 'number') {
        currentTargetTemp = climate.attributes.target_temperature_high;
      }
    }
    tempVal.textContent = `${currentTargetTemp.toFixed(1)}°C`;

    let activePreset = this._optimistic.preset_mode || (climate ? climate.attributes?.preset_mode : null) || 'auto';
    modeBadge.textContent = activePreset.charAt(0).toUpperCase() + activePreset.slice(1);

    // 2. Discover Outdoor Air Temp & Dynamic Colors
    const outdoorSensor = (this._config.outdoor_temp_entity && this._hass.states[this._config.outdoor_temp_entity])
      ? this._config.outdoor_temp_entity
      : this._findEntity([
          /^sensor\.systemair_vtr.*outside_air_temperature/,
          /^sensor\.systemair.*outside_air_temperature/,
          /^sensor\.systemair.*outdoor_temperature/,
          /^sensor\..*outside_temperature/,
          /^sensor\..*outdoor_temperature/
        ]);
    this._setEntityTarget(root.getElementById('outdoorAirGroup'), outdoorSensor);

    const outdoorTemp = this._getNum(outdoorSensor, -2.5);
    const outdoorColor = this._getTempColor(outdoorTemp);
    root.getElementById('outdoorTempSvg').textContent = outdoorTemp !== null ? `${outdoorTemp.toFixed(1)}°C` : '--°C';
    root.getElementById('outdoorTempSvg').style.fill = outdoorColor;
    root.getElementById('outdoorStream').style.stroke = outdoorColor;
    root.getElementById('outdoorUnderglow').style.stroke = outdoorColor;
    root.getElementById('outdoorDuctLine').style.stroke = outdoorColor;

    // 3. Discover Exhaust Air Temp & Dynamic Colors
    const exhaustSensor = this._findEntity([
      /^sensor\.systemair_vtr.*exhaust_air_temperature/,
      /^sensor\.systemair.*exhaust_air_temperature/,
      /^sensor\..*exhaust_temperature/
    ]);
    const exhaustFlowSensor = this._findEntity([
      /^sensor\.systemair_vtr.*exhaust_airflow/,
      /^sensor\.systemair.*exhaust_airflow/,
      /^sensor\..*exhaust_airflow/
    ]);
    this._setEntityTarget(root.getElementById('exhaustAirGroup'), exhaustSensor || exhaustFlowSensor);

    const exhaustTemp = this._getNum(exhaustSensor, 17.8);
    const exhaustFlow = this._getNum(exhaustFlowSensor, 78);
    const exhaustColor = this._getTempColor(exhaustTemp);
    root.getElementById('exhaustTempSvg').textContent = exhaustTemp !== null ? `${exhaustTemp.toFixed(1)}°C` : '--°C';
    root.getElementById('exhaustTempSvg').style.fill = exhaustColor;
    root.getElementById('exhaustFlowSvg').textContent = exhaustFlow !== null ? `${Math.round(exhaustFlow)} m³/h` : '-- m³/h';
    root.getElementById('exhaustStream').style.stroke = exhaustColor;
    root.getElementById('exhaustUnderglow').style.stroke = exhaustColor;
    root.getElementById('exhaustDuctLine').style.stroke = exhaustColor;

    // 4. Discover Extract Air Temp & Dynamic Colors
    const extractSensor = this._findEntity([
      /^sensor\.systemair_vtr.*extract_air_temperature/,
      /^sensor\.systemair.*extract_air_temperature/,
      /^sensor\..*extract_temperature/
    ]);
    const extractRhSensor = this._findEntity([
      /^sensor\.systemair_vtr.*extract_air_relative_humidity/,
      /^sensor\.systemair.*relative_humidity/,
      /^sensor\..*humidity/
    ]);
    const extractCo2Sensor = this._findEntity([
      /^sensor\.systemair_vtr.*co2_level/,
      /^sensor\.systemair.*co2/,
      /^sensor\..*co2/
    ]);
    this._setEntityTarget(root.getElementById('extractAirGroup'), extractSensor);
    this._setEntityTarget(root.getElementById('extractRhSvg'), extractRhSensor);
    this._setEntityTarget(root.getElementById('extractCo2Svg'), extractCo2Sensor);

    const extractTemp = this._getNum(extractSensor, 22.0);
    const extractRh = this._getNum(extractRhSensor, 48);
    const extractCo2 = this._getNum(extractCo2Sensor, 580);
    const extractColor = this._getTempColor(extractTemp);
    root.getElementById('extractTempSvg').textContent = extractTemp !== null ? `${extractTemp.toFixed(1)}°C` : '--°C';
    root.getElementById('extractTempSvg').style.fill = extractColor;
    root.getElementById('extractRhSvg').textContent = extractRh !== null ? `${Math.round(extractRh)}% RH` : '--% RH';
    root.getElementById('extractCo2Svg').textContent = extractCo2 !== null ? `${Math.round(extractCo2)} ppm CO₂` : '-- ppm CO₂';
    root.getElementById('extractStream').style.stroke = extractColor;
    root.getElementById('extractUnderglow').style.stroke = extractColor;
    root.getElementById('extractDuctLine').style.stroke = extractColor;

    // 5. Discover Supply Air Temp & Dynamic Colors
    const supplySensor = this._findEntity([
      /^sensor\.systemair_vtr.*supply_air_temperature/,
      /^sensor\.systemair.*supply_air_temperature/,
      /^sensor\..*supply_temperature/
    ]);
    const supplyFlowSensor = this._findEntity([
      /^sensor\.systemair_vtr.*supply_airflow/,
      /^sensor\.systemair.*supply_airflow/,
      /^sensor\..*supply_airflow/
    ]);
    this._setEntityTarget(root.getElementById('supplyAirGroup'), supplySensor || supplyFlowSensor);

    const supplyTemp = this._getNum(supplySensor, 20.5);
    const supplyFlow = this._getNum(supplyFlowSensor, 160);
    const supplyColor = this._getTempColor(supplyTemp);
    root.getElementById('supplyTempSvg').textContent = supplyTemp !== null ? `${supplyTemp.toFixed(1)}°C` : '--°C';
    root.getElementById('supplyTempSvg').style.fill = supplyColor;
    root.getElementById('supplyFlowSvg').textContent = supplyFlow !== null ? `${Math.round(supplyFlow)} m³/h` : '-- m³/h';
    root.getElementById('supplyStream').style.stroke = supplyColor;
    root.getElementById('supplyUnderglow').style.stroke = supplyColor;
    root.getElementById('supplyDuctLine').style.stroke = supplyColor;

    // 6. Centrifugal Fan Tachometers (RPM) & Spin Animation
    const safRpmSensor = this._findEntity([
      /^sensor\.systemair_vtr.*supply_air_fan_rpm/,
      /^sensor\.systemair.*supply.*fan_rpm/,
      /^sensor\..*supply.*fan.*rpm/
    ]);
    const eafRpmSensor = this._findEntity([
      /^sensor\.systemair_vtr.*extract_air_fan_rpm/,
      /^sensor\.systemair.*extract.*fan_rpm/,
      /^sensor\..*extract.*fan.*rpm/
    ]);
    this._setEntityTarget(root.getElementById('supplyFanGroup'), safRpmSensor);
    this._setEntityTarget(root.getElementById('extractFanGroup'), eafRpmSensor);
    this._setEntityTarget(root.getElementById('extractFanRpmGroup'), eafRpmSensor);

    const safRpm = this._getNum(safRpmSensor, 1200);
    const eafRpm = this._getNum(eafRpmSensor, 1140);
    root.getElementById('supplyRpmSvgText').textContent = `SAF: ${safRpm !== null ? Math.round(safRpm) : '--'} RPM`;
    root.getElementById('extractRpmSvgText').textContent = `EAF: ${eafRpm !== null ? Math.round(eafRpm) : '--'} RPM`;

    const safSpinner = root.getElementById('supplyFanSpinner');
    const eafSpinner = root.getElementById('extractFanSpinner');
    if (safRpm && safRpm > 50) {
      safSpinner.style.animation = `fanSpin ${Math.max(0.4, 1800 / safRpm).toFixed(2)}s linear infinite`;
    } else {
      safSpinner.style.animation = 'none';
    }
    if (eafRpm && eafRpm > 50) {
      eafSpinner.style.animation = `fanSpin ${Math.max(0.4, 1800 / eafRpm).toFixed(2)}s linear infinite`;
    } else {
      eafSpinner.style.animation = 'none';
    }

    // 7. Rotary Heat Exchanger Dynamic Efficiency
    const rotorActiveSensor = this._findEntity([
      /^binary_sensor\.systemair_vtr.*heat_recovery_active/,
      /^binary_sensor\.systemair.*heat_recovery_active/
    ]);
    this._setEntityTarget(root.getElementById('rotorGroup'), rotorActiveSensor || climateId);

    const rotorWheel = root.getElementById('rotorWheel');
    const isRotorActive = rotorActiveSensor ? (this._getState(rotorActiveSensor) === 'on') : true;

    let eff = 0;
    if (isRotorActive && supplyTemp !== null && outdoorTemp !== null && extractTemp !== null) {
      const deltaExtract = extractTemp - outdoorTemp;
      if (deltaExtract > 1.0) {
        eff = ((supplyTemp - outdoorTemp) / deltaExtract) * 100;
        eff = Math.max(0, Math.min(99, Math.round(eff)));
      }
    }

    root.getElementById('rotorPctText').textContent = `${eff}%`;
    const gaugeCircumference = 2 * Math.PI * 72;
    const fillLength = (eff / 100) * gaugeCircumference;
    root.getElementById('rotorGaugeArc').setAttribute('stroke-dasharray', `${fillLength.toFixed(1)} ${gaugeCircumference.toFixed(1)}`);

    if (isRotorActive && eff > 0) {
      rotorWheel.style.animation = 'rotorSpin 8s linear infinite';
    } else {
      rotorWheel.style.animation = 'none';
    }

    // 8. Filter Remaining Life (Seconds to Days conversion)
    const filterSensor = this._findEntity([
      /^sensor\.systemair_vtr.*filter_remaining_time/,
      /^sensor\.systemair.*filter_remaining_time/,
      /^sensor\..*filter_remaining/
    ]);
    this._setEntityTarget(root.getElementById('filterRemainingGroup'), filterSensor);

    const filterRaw = this._getNum(filterSensor, null);
    let filterDays = null;
    if (filterRaw !== null) {
      filterDays = filterRaw > 500 ? Math.round(filterRaw / 86400) : Math.round(filterRaw);
    }
    root.getElementById('filterDaysSvg').textContent = filterDays !== null ? `${filterDays} days` : '-- days';

    // 9. Reheater Coil
    const heaterSwitch = this._findEntity([
      /^switch\.systemair.*heater/,
      /^switch\.systemair_vtr.*heater/
    ]);
    this._setEntityTarget(root.getElementById('heaterGroup'), heaterSwitch);
    this._setEntityTarget(root.getElementById('heaterLabel'), heaterSwitch);

    const isHeaterOn = (this._optimistic.heater !== undefined)
      ? this._optimistic.heater
      : (this._getState(heaterSwitch) === 'on');

    const coil = root.getElementById('heaterCoil');
    const aura = root.getElementById('heaterAura');
    if (isHeaterOn) {
      coil.classList.add('active');
      aura.style.opacity = '1';
    } else {
      coil.classList.remove('active');
      aura.style.opacity = '0';
    }
    root.getElementById('heaterSwitch').classList.toggle('on', isHeaterOn);

    // 10. Eco Mode & Free Cooling Switches
    const ecoSwitch = this._findEntity([/^switch\.systemair.*eco_mode/, /^switch\.systemair_vtr.*eco_mode/]);
    const freeCoolingSwitch = this._findEntity([/^switch\.systemair.*free_cooling/, /^switch\.systemair_vtr.*free_cooling/]);
    this._setEntityTarget(root.getElementById('ecoLabel'), ecoSwitch);
    this._setEntityTarget(root.getElementById('freeCoolingLabel'), freeCoolingSwitch);

    const isEcoOn = (this._optimistic.eco !== undefined)
      ? this._optimistic.eco
      : (this._getState(ecoSwitch) === 'on');
    root.getElementById('ecoSwitch').classList.toggle('on', isEcoOn);

    const isFreeCoolingOn = (this._optimistic.free_cooling !== undefined)
      ? this._optimistic.free_cooling
      : (this._getState(freeCoolingSwitch) === 'on');
    root.getElementById('freeCoolingSwitch').classList.toggle('on', isFreeCoolingOn);

    // 11. Fan Speed Pills
    let currentFanMode = this._optimistic.fan_mode || (climate ? climate.attributes?.fan_mode : null) || 'low';
    root.querySelectorAll('#fanPills .pill').forEach(btn => {
      const sp = btn.getAttribute('data-speed');
      btn.classList.toggle('active', sp === currentFanMode);
    });

    // 12. Presets Row
    root.querySelectorAll('#presetsRow .preset-chip').forEach(chip => {
      const m = chip.getAttribute('data-mode');
      chip.classList.toggle('active', m === activePreset);
    });
  }

  // --- Actions & Service Calls ---
  _changeTargetTemp(delta) {
    const climateId = this._getClimateId();
    if (!climateId || !this._hass) return;
    const climate = this._hass.states[climateId];
    let cur = this._optimistic.target_temperature;
    if (cur === undefined) {
      cur = (climate && climate.attributes && typeof climate.attributes.temperature === 'number')
        ? climate.attributes.temperature
        : 21.0;
    }
    const newTemp = Math.round((cur + delta) * 2) / 2;
    if (newTemp < 12 || newTemp > 30) return;

    this._optimistic.target_temperature = newTemp;
    this._updateValues();

    clearTimeout(this._stepTimer);
    this._stepTimer = setTimeout(() => {
      this._hass.callService('climate', 'set_temperature', {
        entity_id: climateId,
        temperature: newTemp,
      });
      setTimeout(() => {
        delete this._optimistic.target_temperature;
        this._updateValues();
      }, 3500);
    }, 450);
  }

  _setFanSpeed(speed) {
    const climateId = this._getClimateId();
    if (!climateId || !this._hass) return;
    this._optimistic.fan_mode = speed;
    this._updateValues();

    this._hass.callService('climate', 'set_fan_mode', {
      entity_id: climateId,
      fan_mode: speed,
    });
    setTimeout(() => {
      delete this._optimistic.fan_mode;
      this._updateValues();
    }, 3500);
  }

  _setPresetMode(preset) {
    const climateId = this._getClimateId();
    if (!climateId || !this._hass) return;
    this._optimistic.preset_mode = preset;
    this._updateValues();

    this._hass.callService('climate', 'set_preset_mode', {
      entity_id: climateId,
      preset_mode: preset,
    });
    setTimeout(() => {
      delete this._optimistic.preset_mode;
      this._updateValues();
    }, 3500);
  }

  _toggleSwitch(type) {
    let entityId = null;
    let curState = false;

    if (type === 'heater') {
      entityId = this._findEntity([/^switch\.systemair.*heater/, /^switch\.systemair_vtr.*heater/]);
      curState = (this._optimistic.heater !== undefined)
        ? this._optimistic.heater
        : (this._getState(entityId) === 'on');
      this._optimistic.heater = !curState;
    } else if (type === 'eco') {
      entityId = this._findEntity([/^switch\.systemair.*eco_mode/, /^switch\.systemair_vtr.*eco_mode/]);
      curState = (this._optimistic.eco !== undefined)
        ? this._optimistic.eco
        : (this._getState(entityId) === 'on');
      this._optimistic.eco = !curState;
    } else if (type === 'free_cooling') {
      entityId = this._findEntity([/^switch\.systemair.*free_cooling/, /^switch\.systemair_vtr.*free_cooling/]);
      curState = (this._optimistic.free_cooling !== undefined)
        ? this._optimistic.free_cooling
        : (this._getState(entityId) === 'on');
      this._optimistic.free_cooling = !curState;
    }

    this._updateValues();

    if (entityId && this._hass) {
      const service = !curState ? 'turn_on' : 'turn_off';
      this._hass.callService('switch', service, { entity_id: entityId });
    }

    setTimeout(() => {
      if (type === 'heater') delete this._optimistic.heater;
      if (type === 'eco') delete this._optimistic.eco;
      if (type === 'free_cooling') delete this._optimistic.free_cooling;
      this._updateValues();
    }, 3500);
  }
}

// Visual Card Editor (systemair-recuperator-card-editor)
class SystemairRecuperatorCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._hass) return;
    this.innerHTML = `
      <div style="padding: 12px 4px; display: flex; flex-direction: column; gap: 14px;">
        <div>
          <label style="font-weight: 600; display: block; margin-bottom: 6px;">Title</label>
          <input type="text" id="inputTitle" value="${this._config.title || 'Systemair SAVE'}" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid #475569; background: #1e293b; color: #fff; box-sizing: border-box;"/>
        </div>
        <div>
          <label style="font-weight: 600; display: block; margin-bottom: 6px;">Outdoor Temperature Entity (Optional External Sensor)</label>
          <input type="text" id="inputOutdoorTemp" placeholder="e.g. sensor.street_temperature" value="${this._config.outdoor_temp_entity || ''}" style="width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid #475569; background: #1e293b; color: #fff; box-sizing: border-box;"/>
          <small style="color: #94a3b8; display: block; margin-top: 4px;">If specified, this sensor will be used for displaying Outdoor Air temperature and calculating heat recovery efficiency.</small>
        </div>
      </div>
    `;

    this.querySelector('#inputTitle').addEventListener('input', (e) => {
      this._config = { ...this._config, title: e.target.value };
      this._fireChanged();
    });
    this.querySelector('#inputOutdoorTemp').addEventListener('input', (e) => {
      this._config = { ...this._config, outdoor_temp_entity: e.target.value };
      this._fireChanged();
    });
  }

  _fireChanged() {
    const event = new CustomEvent('config-changed', {
      bubbles: true,
      composed: true,
      detail: { config: this._config },
    });
    this.dispatchEvent(event);
  }
}

customElements.define('systemair-recuperator-card', SystemairRecuperatorCard);
customElements.define('systemair-recuperator-card-editor', SystemairRecuperatorCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'systemair-recuperator-card',
  name: 'Systemair Recuperator Card',
  description: 'Custom Lovelace card for Systemair SAVE ventilation units with heat recovery.',
  preview: true,
});
