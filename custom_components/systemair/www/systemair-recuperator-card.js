/**
 * Systemair Recuperator Lovelace Card
 * Custom Home Assistant card for Systemair SAVE ventilation units with heat recovery.
 * Fully matching visual mockup aesthetics: zero-waste minimal margin layout, dynamic thermal
 * gradient for all 4 airflows (blue to red), multi-ribbon volumetric fluid particle streams,
 * realistic snail blowers, active reheater only when heating is physically active, bold typography,
 * direct climate more-info on rotor, full unit-off state handling, top power consumption badge,
 * and interactive controls.
 * Version: 1.0.44
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
      climate: 'climate.systemair',
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
      climate: 'climate.systemair',
      outdoor_temp_entity: '',
      exhaust_temp_entity: '',
      exhaust_flow_entity: '',
      extract_temp_entity: '',
      extract_humidity_entity: '',
      extract_co2_entity: '',
      supply_temp_entity: '',
      supply_flow_entity: '',
      saf_rpm_entity: '',
      eaf_rpm_entity: '',
      heat_recovery_entity: '',
      power_entity: '',
      heater_switch: '',
      eco_switch: '',
      free_cooling_switch: '',
      filter_entity: '',
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
      if (!p) continue;
      if (typeof p === 'string' && states[p]) return p;
      if (p instanceof RegExp) {
        const found = Object.keys(states).find(id => p.test(id));
        if (found) return found;
      }
    }
    return null;
  }

  _resolveEntity(configKeys) {
    const keys = Array.isArray(configKeys) ? configKeys : [configKeys];
    for (const k of keys) {
      if (this._config && this._config[k]) {
        const val = this._config[k];
        if (typeof val === 'string' && val.trim().length > 0) {
          return val.trim();
        }
      }
    }
    return null;
  }

  _getClimateId() {
    return this._resolveEntity(['climate', 'climate_entity']) || this._findEntity([
      /^climate\.systemair_vtr/,
      /^climate\.systemair/,
      /^climate\./
    ]);
  }

  _getSwitchEntity(type) {
    if (type === 'heater') {
      return this._resolveEntity(['heater_switch', 'heater_entity', 'reheater_switch', 'reheater_entity']);
    }
    if (type === 'eco') {
      return this._resolveEntity(['eco_switch', 'eco_entity', 'eco_mode_switch']);
    }
    if (type === 'free_cooling') {
      return this._resolveEntity(['free_cooling_switch', 'free_cooling_entity']);
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

        /* HEADER PANEL */
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
          transition: all 0.3s ease;
        }
        .status-dot.off {
          background: #64748b;
          box-shadow: none;
          animation: none;
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
          transition: all 0.3s ease;
        }
        .mode-badge::before {
          content: "";
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #4ade80;
          transition: background 0.3s ease;
        }
        .mode-badge.off {
          color: #94a3b8;
          background: rgba(148, 163, 184, 0.12);
          border-color: rgba(148, 163, 184, 0.25);
        }
        .mode-badge.off::before {
          background: #94a3b8;
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
          filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.45));
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

        /* Multi-Ribbon Volumetric Fluid Flow Streams */
        .flow-glow {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: opacity 0.4s ease;
        }
        .flow-line {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: opacity 0.4s ease;
        }
        #supplyStreamGroup {
          --flow-dur-1: calc(2.2s * var(--saf-speed-factor, 1));
          --flow-dur-2: calc(1.6s * var(--saf-speed-factor, 1));
          --flow-dur-3: calc(2.8s * var(--saf-speed-factor, 1));
        }
        #exhaustStreamGroup {
          --flow-dur-1: calc(2.2s * var(--eaf-speed-factor, 1));
          --flow-dur-2: calc(1.6s * var(--eaf-speed-factor, 1));
          --flow-dur-3: calc(2.8s * var(--eaf-speed-factor, 1));
        }
        .flow-particles-1 {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          animation: flowMotion1 var(--flow-dur-1, 2.2s) linear infinite;
          transition: opacity 0.4s ease;
        }
        .flow-particles-2 {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          animation: flowMotion2 var(--flow-dur-2, 1.6s) linear infinite;
          transition: opacity 0.4s ease;
        }
        .flow-particles-3 {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          animation: flowMotion3 var(--flow-dur-3, 2.8s) linear infinite;
          transition: opacity 0.4s ease;
        }
        @keyframes flowMotion1 {
          from { stroke-dashoffset: 55; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes flowMotion2 {
          from { stroke-dashoffset: 44; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes flowMotion3 {
          from { stroke-dashoffset: 56; }
          to { stroke-dashoffset: 0; }
        }

        /* Unit-Off State: Instantly stop animations, hide flying particles, dim flows */
        svg.schematic.unit-off .flow-particles-1,
        svg.schematic.unit-off .flow-particles-2,
        svg.schematic.unit-off .flow-particles-3 {
          animation: none !important;
          opacity: 0 !important;
        }
        svg.schematic.unit-off .flow-glow {
          opacity: 0.04 !important;
        }
        svg.schematic.unit-off .flow-line {
          opacity: 0.18 !important;
        }
        svg.schematic.unit-off .fan-impeller {
          animation: none !important;
          opacity: 0.45;
        }
        svg.schematic.unit-off .rotor-spin-group {
          animation: none !important;
        }
        svg.schematic.unit-off #rotorGaugeArc {
          opacity: 0.25;
        }
        svg.schematic.unit-off #heaterCoil {
          stroke: #334155 !important;
          filter: none !important;
          animation: none !important;
        }
        svg.schematic.unit-off #heaterAura {
          opacity: 0 !important;
        }

        .fan-impeller {
          transform-origin: 0px 0px;
          will-change: transform;
        }
        @keyframes fanSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .rotor-spin-group {
          transform-origin: 270px 175px;
          will-change: transform;
        }
        @keyframes rotorSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .heater-coil {
          stroke: #475569;
          stroke-width: 3.5;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: stroke 0.4s ease, filter 0.4s ease;
        }
        .heater-coil.active {
          stroke: #ff7a18;
          filter: drop-shadow(0 0 8px rgba(255, 122, 24, 0.95)) drop-shadow(0 0 16px rgba(255, 77, 0, 0.6));
          animation: heaterPulse 2s ease-in-out infinite;
        }
        @keyframes heaterPulse {
          0%, 100% { stroke: #ff7a18; }
          50% { stroke: #ff3b30; }
        }

        .channel-title {
          font-size: 15px;
          font-weight: 700;
          fill: #f1f5f9;
          letter-spacing: -0.01em;
        }
        .sensor-sub {
          font-size: 14px;
          font-weight: 600;
          fill: #94a3b8;
          letter-spacing: 0.01em;
        }
        .temp-val-svg {
          font-size: 28px;
          font-weight: 900;
          transition: fill 0.5s ease;
        }

        /* FOOTER CONTROLS PANEL */
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

        /* Row 2: 3-Column Centered Toggles */
        .toggles-grid {
          display: flex;
          justify-content: space-around;
          align-items: center;
          gap: 8px;
          width: 100%;
          box-sizing: border-box;
        }
        .toggle-col {
          flex: 1;
          max-width: 160px;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          user-select: none;
          cursor: pointer;
          padding: 2px 0;
          border-radius: 6px;
          transition: background 0.15s ease;
        }
        .toggle-col:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .toggle-label {
          font-size: 0.76rem;
          font-weight: 600;
          color: #cbd5e1;
          white-space: nowrap;
          text-align: center;
          line-height: 1.1;
          pointer-events: none;
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
          pointer-events: none;
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
          background: #3b82f6;
          border-color: #60a5fa;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
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
              <g><rect x="0" y="56" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/><line x1="60" y1="56" x2="60" y2="116" stroke="#475569" stroke-width="3"/><line id="outdoorDuctLine" class="outdoor-flow" x1="10" y1="59" x2="10" y2="113" stroke="#38bdf8" stroke-width="2"/></g>
              <g><rect x="470" y="56" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/><line x1="480" y1="56" x2="480" y2="116" stroke="#475569" stroke-width="3"/><line id="exhaustDuctLine" class="exhaust-flow" x1="530" y1="59" x2="530" y2="113" stroke="#60a5fa" stroke-width="2"/></g>
              <g><rect x="0" y="234" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/><line x1="60" y1="234" x2="60" y2="294" stroke="#475569" stroke-width="3"/><line id="extractDuctLine" class="extract-flow" x1="10" y1="237" x2="10" y2="291" stroke="#fbbf24" stroke-width="2"/></g>
              <g><rect x="470" y="234" width="70" height="60" rx="8" fill="url(#ductGrad)" stroke="#334155" stroke-width="1.6"/><line x1="480" y1="234" x2="480" y2="294" stroke="#475569" stroke-width="3"/><line id="supplyDuctLine" class="supply-flow" x1="530" y1="237" x2="530" y2="291" stroke="#ff3b30" stroke-width="2"/></g>

              <!-- Multi-Ribbon Volumetric Fluid Flow Streams (3-Layer Multi-Ribbon Streamlines) -->
              <g id="supplyStreamGroup">
                <!-- 1. Outdoor Fresh Air (Top-Left Intake) -->
                <!-- Ambient Volumetric Flow Body (Fills duct channel) -->
                <path d="M 0,86 C 160,86 210,135 270,175" class="flow-glow outdoor-flow" stroke="#38bdf8" stroke-width="36" stroke-opacity="0.18"/>

                <!-- Upper Streamline Ribbon & High-Speed Particles -->
                <path d="M 0,74 C 160,74 210,123 260,163" class="flow-line outdoor-flow" stroke="#38bdf8" stroke-width="1.8" stroke-opacity="0.4"/>
                <path d="M 0,74 C 160,74 210,123 260,163" class="flow-particles-2 outdoor-flow" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="2 20"/>

                <!-- Core Streamline Ribbon & Dense Luminous Particle Beads -->
                <path d="M 0,86 C 160,86 210,135 270,175" class="flow-line outdoor-flow" stroke="#38bdf8" stroke-width="3.5" stroke-opacity="0.6"/>
                <path d="M 0,86 C 160,86 210,135 270,175" class="flow-particles-1 outdoor-flow" stroke="#38bdf8" stroke-width="4" stroke-dasharray="3.5 24"/>
                <path d="M 0,86 C 160,86 210,135 270,175" class="flow-particles-2" stroke="rgba(255, 255, 255, 0.65)" stroke-width="1.8" stroke-dasharray="2 16"/>

                <!-- Lower Streamline Ribbon & Staggered Particles -->
                <path d="M 0,98 C 160,98 210,147 280,187" class="flow-line outdoor-flow" stroke="#38bdf8" stroke-width="1.8" stroke-opacity="0.4"/>
                <path d="M 0,98 C 160,98 210,147 280,187" class="flow-particles-3 outdoor-flow" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="2 28"/>

                <!-- 2. Supply Air to Rooms (Bottom-Right Discharge) -->
                <!-- Ambient Volumetric Flow Body -->
                <path d="M 270,175 C 330,215 380,264 540,264" class="flow-glow supply-flow" stroke="#ff3b30" stroke-width="36" stroke-opacity="0.18"/>

                <!-- Upper Streamline Ribbon & Particles -->
                <path d="M 260,163 C 330,203 380,252 540,252" class="flow-line supply-flow" stroke="#ff3b30" stroke-width="1.8" stroke-opacity="0.4"/>
                <path d="M 260,163 C 330,203 380,252 540,252" class="flow-particles-2 supply-flow" stroke="#ff3b30" stroke-width="2.5" stroke-dasharray="2 20"/>

                <!-- Core Streamline Ribbon & Particles -->
                <path d="M 270,175 C 330,215 380,264 540,264" class="flow-line supply-flow" stroke="#ff3b30" stroke-width="3.5" stroke-opacity="0.6"/>
                <path d="M 270,175 C 330,215 380,264 540,264" class="flow-particles-1 supply-flow" stroke="#ff3b30" stroke-width="4" stroke-dasharray="3.5 24"/>
                <path d="M 270,175 C 330,215 380,264 540,264" class="flow-particles-2" stroke="rgba(255, 255, 255, 0.65)" stroke-width="1.8" stroke-dasharray="2 16"/>

                <!-- Lower Streamline Ribbon & Particles -->
                <path d="M 280,187 C 330,227 380,276 540,276" class="flow-line supply-flow" stroke="#ff3b30" stroke-width="1.8" stroke-opacity="0.4"/>
                <path d="M 280,187 C 330,227 380,276 540,276" class="flow-particles-3 supply-flow" stroke="#ff3b30" stroke-width="2.5" stroke-dasharray="2 28"/>
              </g>

              <g id="exhaustStreamGroup">
                <!-- 3. Extract Air from Rooms (Bottom-Left Intake) -->
                <!-- Ambient Volumetric Flow Body -->
                <path d="M 0,264 C 160,264 210,215 270,175" class="flow-glow extract-flow" stroke="#fbbf24" stroke-width="36" stroke-opacity="0.18"/>

                <!-- Upper Streamline Ribbon & Particles -->
                <path d="M 0,252 C 160,252 210,203 260,163" class="flow-line extract-flow" stroke="#fbbf24" stroke-width="1.8" stroke-opacity="0.4"/>
                <path d="M 0,252 C 160,252 210,203 260,163" class="flow-particles-2 extract-flow" stroke="#fbbf24" stroke-width="2.5" stroke-dasharray="2 20"/>

                <!-- Core Streamline Ribbon & Particles -->
                <path d="M 0,264 C 160,264 210,215 270,175" class="flow-line extract-flow" stroke="#fbbf24" stroke-width="3.5" stroke-opacity="0.6"/>
                <path d="M 0,264 C 160,264 210,215 270,175" class="flow-particles-1 extract-flow" stroke="#fbbf24" stroke-width="4" stroke-dasharray="3.5 24"/>
                <path d="M 0,264 C 160,264 210,215 270,175" class="flow-particles-2" stroke="rgba(255, 255, 255, 0.65)" stroke-width="1.8" stroke-dasharray="2 16"/>

                <!-- Lower Streamline Ribbon & Particles -->
                <path d="M 0,276 C 160,276 210,227 280,187" class="flow-line extract-flow" stroke="#fbbf24" stroke-width="1.8" stroke-opacity="0.4"/>
                <path d="M 0,276 C 160,276 210,227 280,187" class="flow-particles-3 extract-flow" stroke="#fbbf24" stroke-width="2.5" stroke-dasharray="2 28"/>

                <!-- 4. Exhaust Air to Outside (Top-Right Discharge) -->
                <!-- Ambient Volumetric Flow Body -->
                <path d="M 270,175 C 330,135 380,86 540,86" class="flow-glow exhaust-flow" stroke="#60a5fa" stroke-width="36" stroke-opacity="0.18"/>

                <!-- Upper Streamline Ribbon & Particles -->
                <path d="M 260,163 C 330,123 380,74 540,74" class="flow-line exhaust-flow" stroke="#60a5fa" stroke-width="1.8" stroke-opacity="0.4"/>
                <path d="M 260,163 C 330,123 380,74 540,74" class="flow-particles-2 exhaust-flow" stroke="#60a5fa" stroke-width="2.5" stroke-dasharray="2 20"/>

                <!-- Core Streamline Ribbon & Particles -->
                <path d="M 270,175 C 330,135 380,86 540,86" class="flow-line exhaust-flow" stroke="#60a5fa" stroke-width="3.5" stroke-opacity="0.6"/>
                <path d="M 270,175 C 330,135 380,86 540,86" class="flow-particles-1 exhaust-flow" stroke="#60a5fa" stroke-width="4" stroke-dasharray="3.5 24"/>
                <path d="M 270,175 C 330,135 380,86 540,86" class="flow-particles-2" stroke="rgba(255, 255, 255, 0.65)" stroke-width="1.8" stroke-dasharray="2 16"/>

                <!-- Lower Streamline Ribbon & Particles -->
                <path d="M 280,187 C 330,147 380,98 540,98" class="flow-line exhaust-flow" stroke="#60a5fa" stroke-width="1.8" stroke-opacity="0.4"/>
                <path d="M 280,187 C 330,147 380,98 540,98" class="flow-particles-3 exhaust-flow" stroke="#60a5fa" stroke-width="2.5" stroke-dasharray="2 28"/>
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
                <g id="supplyFanRpmGroup" class="clickable">
                  <polyline points="0,40 0,55 -55,55" fill="none" stroke="#64748b" stroke-width="1.2" stroke-dasharray="2 2"/>
                  <text x="-60" y="59" text-anchor="end" fill="#cbd5e1" font-size="13.5" font-weight="600" id="supplyRpmSvgText">SAF: -- RPM</text>
                </g>
              </g>

              <!-- Electric Reheater Coil (Only glows when heating is physically active) -->
              <g id="heaterGroup" class="clickable">
                <ellipse id="heaterAura" cx="431" cy="255" rx="20" ry="17" fill="url(#heaterRadialGlow)" opacity="0"/>
                <path id="heaterCoil" class="heater-coil"
                  d="M 416,239 L 416,271 A 5,5 0 0,0 426,271 L 426,239 A 5,5 0 0,1 436,239 L 436,271 A 5,5 0 0,0 446,271 L 446,239" />
              </g>

              <!-- Rotary Heat Exchanger (Central Circle - Clickable to open Climate more-info) -->
              <g id="rotorGroup" class="clickable" title="Open Climate Control">
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

              <!-- Top Power Consumption Badge (Symmetric to bottom Filter badge) -->
              <g id="powerConsumptionGroup" class="clickable" title="Open Power Sensor">
                <rect x="155" y="5" width="230" height="21" rx="5" fill="#0f141c" stroke="#253043" stroke-width="1"/>
                <text x="270" y="20" text-anchor="middle" fill="#94a3b8" font-size="11.5" font-weight="600">
                  Power consumption: <tspan id="powerUsageSvg" fill="#10b981" font-weight="700">-- W</tspan>
                </text>
              </g>

              <!-- Central Filter Remaining Life Badge -->
              <g id="filterRemainingGroup" class="clickable" title="Open Filter Sensor">
                <rect x="155" y="324" width="230" height="21" rx="5" fill="#0f141c" stroke="#253043" stroke-width="1"/>
                <text x="270" y="339" text-anchor="middle" fill="#94a3b8" font-size="11.5" font-weight="600">
                  Filter remaining life: <tspan id="filterDaysSvg" fill="#38bdf8" font-weight="700">-- days</tspan>
                </text>
              </g>

              <!-- SENSOR TYPOGRAPHY (Top Layer) -->
              <!-- Top-Right EAF RPM Callout -->
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

            <!-- Row 2: 3-Column Centered Toggles -->
            <div class="toggles-grid">
              <div class="toggle-col" id="heaterCol" title="Toggle Reheater Enabled">
                <div class="ios-switch orange" id="heaterSwitch"><div class="thumb"></div></div>
                <span class="toggle-label" id="heaterLabel">Heater</span>
              </div>
              <div class="toggle-col" id="ecoCol" title="Toggle Eco Mode">
                <div class="ios-switch" id="ecoSwitch"><div class="thumb"></div></div>
                <span class="toggle-label" id="ecoLabel">Eco Mode</span>
              </div>
              <div class="toggle-col" id="freeCoolingCol" title="Toggle Free Cooling">
                <div class="ios-switch" id="freeCoolingSwitch"><div class="thumb"></div></div>
                <span class="toggle-label" id="freeCoolingLabel">Free Cooling</span>
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

    // Central Rotor Circle -> Direct more-info on Climate entity!
    const rotorEl = root.getElementById('rotorGroup');
    if (rotorEl) {
      rotorEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const climateId = this._getClimateId();
        if (climateId && this._hass?.states[climateId]) {
          this._fireMoreInfo(climateId);
        }
      });
    }

    // Toggle Column Clicks (Full Column Clickable)
    root.getElementById('heaterCol').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleSwitch('heater');
    });
    root.getElementById('ecoCol').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleSwitch('eco');
    });
    root.getElementById('freeCoolingCol').addEventListener('click', (e) => {
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

    // 1. Climate Entity & Target Temp
    const climateId = this._getClimateId();
    const climate = climateId ? this._hass.states[climateId] : null;
    this._setEntityTarget(root.getElementById('headerClimateGroup'), climateId);
    this._setEntityTarget(root.getElementById('rotorGroup'), climateId);

    const tempVal = root.getElementById('tempVal');
    const modeBadge = root.getElementById('modeBadge');
    const statusDot = root.querySelector('.status-dot');

    // Determine if unit is OFF
    const isClimateOff = climate && (climate.state === 'off' || climate.attributes?.hvac_action === 'off');
    let currentFanMode = this._optimistic.fan_mode || (climate ? climate.attributes?.fan_mode : null) || 'low';
    const isFanOff = (currentFanMode === 'off' || currentFanMode === '0');
    const isUnitOff = Boolean(isClimateOff || isFanOff);

    // Apply Unit-Off class to SVG schematic
    const svgSchematic = root.querySelector('svg.schematic');
    if (svgSchematic) {
      svgSchematic.classList.toggle('unit-off', isUnitOff);
    }

    if (statusDot) {
      statusDot.classList.toggle('off', isUnitOff);
    }

    let activePreset = this._optimistic.preset_mode || (climate ? climate.attributes?.preset_mode : null) || 'auto';

    if (isUnitOff) {
      modeBadge.textContent = 'Off';
      modeBadge.classList.add('off');
    } else {
      modeBadge.textContent = activePreset.charAt(0).toUpperCase() + activePreset.slice(1);
      modeBadge.classList.remove('off');
    }

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

    // 2. Outdoor Air Temp & Dynamic Colors
    const outdoorSensor = this._resolveEntity(['outdoor_temp_entity', 'outdoor_temp']);
    this._setEntityTarget(root.getElementById('outdoorAirGroup'), outdoorSensor);

    const outdoorTemp = this._getNum(outdoorSensor, null);
    const outdoorEl = root.getElementById('outdoorTempSvg');
    if (outdoorSensor) {
      const outdoorColor = this._getTempColor(outdoorTemp !== null ? outdoorTemp : 10.0);
      outdoorEl.textContent = outdoorTemp !== null ? `${outdoorTemp.toFixed(1)}°C` : '--°C';
      outdoorEl.style.fill = outdoorColor;
      outdoorEl.style.display = '';
      root.querySelectorAll('.outdoor-flow').forEach(el => el.style.stroke = outdoorColor);
    } else {
      outdoorEl.style.display = 'none';
    }

    // 3. Exhaust Air Temp & Dynamic Colors
    const exhaustSensor = this._resolveEntity(['exhaust_temp_entity', 'exhaust_temp']);
    const exhaustFlowSensor = this._resolveEntity(['exhaust_flow_entity', 'exhaust_flow']);
    this._setEntityTarget(root.getElementById('exhaustAirGroup'), exhaustSensor || exhaustFlowSensor);

    const exhaustTemp = this._getNum(exhaustSensor, null);
    const exhaustEl = root.getElementById('exhaustTempSvg');
    if (exhaustSensor) {
      const exhaustColor = this._getTempColor(exhaustTemp !== null ? exhaustTemp : 18.0);
      exhaustEl.textContent = exhaustTemp !== null ? `${exhaustTemp.toFixed(1)}°C` : '--°C';
      exhaustEl.style.fill = exhaustColor;
      exhaustEl.style.display = '';
      root.querySelectorAll('.exhaust-flow').forEach(el => el.style.stroke = exhaustColor);
    } else {
      exhaustEl.style.display = 'none';
    }

    const exhaustFlowEl = root.getElementById('exhaustFlowSvg');
    if (exhaustFlowSensor) {
      const rawExhaustFlow = this._getNum(exhaustFlowSensor, null);
      const exhaustFlow = isUnitOff ? 0 : rawExhaustFlow;
      exhaustFlowEl.textContent = exhaustFlow !== null ? `${Math.round(exhaustFlow)} m³/h` : '-- m³/h';
      exhaustFlowEl.style.display = '';
    } else {
      exhaustFlowEl.style.display = 'none';
    }

    // 4. Extract Air Temp, Humidity & CO2
    const extractSensor = this._resolveEntity(['extract_temp_entity', 'extract_temp']);
    const extractRhSensor = this._resolveEntity(['extract_humidity_entity', 'extract_rh_entity', 'humidity_entity']);
    const extractCo2Sensor = this._resolveEntity(['extract_co2_entity', 'co2_entity']);
    this._setEntityTarget(root.getElementById('extractAirGroup'), extractSensor);
    this._setEntityTarget(root.getElementById('extractRhSvg'), extractRhSensor);
    this._setEntityTarget(root.getElementById('extractCo2Svg'), extractCo2Sensor);

    const extractTemp = this._getNum(extractSensor, null);
    const extractEl = root.getElementById('extractTempSvg');
    if (extractSensor) {
      const extractColor = this._getTempColor(extractTemp !== null ? extractTemp : 21.0);
      extractEl.textContent = extractTemp !== null ? `${extractTemp.toFixed(1)}°C` : '--°C';
      extractEl.style.fill = extractColor;
      extractEl.style.display = '';
      root.querySelectorAll('.extract-flow').forEach(el => el.style.stroke = extractColor);
    } else {
      extractEl.style.display = 'none';
    }

    const extractRhEl = root.getElementById('extractRhSvg');
    if (extractRhSensor) {
      const extractRh = this._getNum(extractRhSensor, null);
      extractRhEl.textContent = extractRh !== null ? `${Math.round(extractRh)}% RH` : '--% RH';
      extractRhEl.style.display = '';
    } else {
      extractRhEl.style.display = 'none';
    }

    const extractCo2El = root.getElementById('extractCo2Svg');
    if (extractCo2Sensor) {
      const extractCo2 = this._getNum(extractCo2Sensor, null);
      extractCo2El.textContent = extractCo2 !== null ? `${Math.round(extractCo2)} ppm CO₂` : '-- ppm CO₂';
      extractCo2El.style.display = '';
    } else {
      extractCo2El.style.display = 'none';
    }

    // 5. Supply Air Temp & Dynamic Colors
    const supplySensor = this._resolveEntity(['supply_temp_entity', 'supply_temp']);
    const supplyFlowSensor = this._resolveEntity(['supply_flow_entity', 'supply_flow']);
    this._setEntityTarget(root.getElementById('supplyAirGroup'), supplySensor || supplyFlowSensor);

    const supplyTemp = this._getNum(supplySensor, null);
    const supplyEl = root.getElementById('supplyTempSvg');
    if (supplySensor) {
      const supplyColor = this._getTempColor(supplyTemp !== null ? supplyTemp : 20.0);
      supplyEl.textContent = supplyTemp !== null ? `${supplyTemp.toFixed(1)}°C` : '--°C';
      supplyEl.style.fill = supplyColor;
      supplyEl.style.display = '';
      root.querySelectorAll('.supply-flow').forEach(el => el.style.stroke = supplyColor);
    } else {
      supplyEl.style.display = 'none';
    }

    const supplyFlowEl = root.getElementById('supplyFlowSvg');
    if (supplyFlowSensor) {
      const rawSupplyFlow = this._getNum(supplyFlowSensor, null);
      const supplyFlow = isUnitOff ? 0 : rawSupplyFlow;
      supplyFlowEl.textContent = supplyFlow !== null ? `${Math.round(supplyFlow)} m³/h` : '-- m³/h';
      supplyFlowEl.style.display = '';
    } else {
      supplyFlowEl.style.display = 'none';
    }

    // 6. Centrifugal Fan Tachometers (RPM) & Spin Animation
    const safRpmSensor = this._resolveEntity(['saf_rpm_entity', 'supply_rpm_entity', 'supply_fan_rpm_entity']);
    const eafRpmSensor = this._resolveEntity(['eaf_rpm_entity', 'extract_rpm_entity', 'extract_fan_rpm_entity']);
    this._setEntityTarget(root.getElementById('supplyFanGroup'), safRpmSensor);
    this._setEntityTarget(root.getElementById('extractFanGroup'), eafRpmSensor);
    this._setEntityTarget(root.getElementById('extractFanRpmGroup'), eafRpmSensor);

    const rawSafRpm = this._getNum(safRpmSensor, null);
    const rawEafRpm = this._getNum(eafRpmSensor, null);
    const safRpm = isUnitOff ? 0 : rawSafRpm;
    const eafRpm = isUnitOff ? 0 : rawEafRpm;

    const safRpmGroup = root.getElementById('supplyFanRpmGroup');
    if (safRpmGroup) {
      if (safRpmSensor) {
        root.getElementById('supplyRpmSvgText').textContent = `SAF: ${safRpm !== null ? Math.round(safRpm) : '--'} RPM`;
        safRpmGroup.style.display = '';
      } else {
        safRpmGroup.style.display = 'none';
      }
    }

    const eafRpmGroup = root.getElementById('extractFanRpmGroup');
    if (eafRpmGroup) {
      if (eafRpmSensor) {
        root.getElementById('extractRpmSvgText').textContent = `EAF: ${eafRpm !== null ? Math.round(eafRpm) : '--'} RPM`;
        eafRpmGroup.style.display = '';
      } else {
        eafRpmGroup.style.display = 'none';
      }
    }

    const safSpinner = root.getElementById('supplyFanSpinner');
    const eafSpinner = root.getElementById('extractFanSpinner');
    if (!isUnitOff) {
      const safSpeed = (safRpm && safRpm > 50) ? Math.max(0.4, 1800 / safRpm).toFixed(2) : '1.5';
      const eafSpeed = (eafRpm && eafRpm > 50) ? Math.max(0.4, 1800 / eafRpm).toFixed(2) : '1.5';
      safSpinner.style.animation = `fanSpin ${safSpeed}s linear infinite`;
      eafSpinner.style.animation = `fanSpin ${eafSpeed}s linear infinite`;
    } else {
      safSpinner.style.animation = 'none';
      eafSpinner.style.animation = 'none';
    }

    // Dynamic Airflow Stream Speeds based on Fan RPM
    const supplyStreamGroup = root.getElementById('supplyStreamGroup');
    if (supplyStreamGroup) {
      let safFactor = 1.0;
      if (!isUnitOff && safRpm && safRpm > 50) {
        safFactor = Math.min(3.0, Math.max(0.4, 1200 / safRpm));
      } else if (!isUnitOff && currentFanMode === 'low') {
        safFactor = 1.6;
      } else if (!isUnitOff && (currentFanMode === 'high' || currentFanMode === 'boost')) {
        safFactor = 0.65;
      }
      supplyStreamGroup.style.setProperty('--saf-speed-factor', safFactor.toFixed(2));
    }

    const exhaustStreamGroup = root.getElementById('exhaustStreamGroup');
    if (exhaustStreamGroup) {
      let eafFactor = 1.0;
      if (!isUnitOff && eafRpm && eafRpm > 50) {
        eafFactor = Math.min(3.0, Math.max(0.4, 1200 / eafRpm));
      } else if (!isUnitOff && currentFanMode === 'low') {
        eafFactor = 1.6;
      } else if (!isUnitOff && (currentFanMode === 'high' || currentFanMode === 'boost')) {
        eafFactor = 0.65;
      }
      exhaustStreamGroup.style.setProperty('--eaf-speed-factor', eafFactor.toFixed(2));
    }

    // 7. Rotary Heat Exchanger Dynamic Efficiency
    const rotorActiveSensor = this._resolveEntity(['heat_recovery_entity', 'rotor_active_entity', 'rotor_entity']);
    const rotorWheel = root.getElementById('rotorWheel');
    const isRotorActive = (!isUnitOff) && (rotorActiveSensor ? (this._getState(rotorActiveSensor) === 'on') : true);

    let eff = 0;
    if (isRotorActive && supplyTemp !== null && outdoorTemp !== null && extractTemp !== null) {
      const deltaExtract = extractTemp - outdoorTemp;
      if (deltaExtract > 1.0) {
        eff = ((supplyTemp - outdoorTemp) / deltaExtract) * 100;
        eff = Math.max(0, Math.min(99, Math.round(eff)));
      }
    }

    root.getElementById('rotorPctText').textContent = isUnitOff ? '0%' : `${eff}%`;
    const gaugeCircumference = 2 * Math.PI * 72;
    const fillLength = isUnitOff ? 0 : (eff / 100) * gaugeCircumference;
    root.getElementById('rotorGaugeArc').setAttribute('stroke-dasharray', `${fillLength.toFixed(1)} ${gaugeCircumference.toFixed(1)}`);

    if (isRotorActive && eff > 0 && !isUnitOff) {
      rotorWheel.style.animation = 'rotorSpin 8s linear infinite';
    } else {
      rotorWheel.style.animation = 'none';
    }

    // 8a. Top Power Consumption Badge
    const powerSensor = this._resolveEntity(['power_entity', 'power_sensor', 'power_consumption_entity']);
    const powerGroup = root.getElementById('powerConsumptionGroup');
    if (powerSensor) {
      this._setEntityTarget(powerGroup, powerSensor);
      const rawPower = this._getNum(powerSensor, null);
      let powerDisplay = '-- W';
      if (isUnitOff) {
        powerDisplay = '0 W';
      } else if (rawPower !== null) {
        const stateObj = powerSensor ? this._hass.states[powerSensor] : null;
        const unit = stateObj?.attributes?.unit_of_measurement || 'W';
        if (unit.toLowerCase() === 'kw') {
          powerDisplay = rawPower >= 1 ? `${rawPower.toFixed(2)} kW` : `${Math.round(rawPower * 1000)} W`;
        } else {
          powerDisplay = `${Math.round(rawPower)} W`;
        }
      }
      root.getElementById('powerUsageSvg').textContent = powerDisplay;
      powerGroup.style.display = '';
    } else {
      powerGroup.style.display = 'none';
    }

    // 8b. Filter Remaining Life (Seconds to Days conversion)
    const filterSensor = this._resolveEntity(['filter_entity', 'filter_remaining_entity', 'filter_days_entity']);
    const filterGroup = root.getElementById('filterRemainingGroup');
    if (filterSensor) {
      this._setEntityTarget(filterGroup, filterSensor);
      const filterRaw = this._getNum(filterSensor, null);
      let filterDays = null;
      if (filterRaw !== null) {
        filterDays = filterRaw > 500 ? Math.round(filterRaw / 86400) : Math.round(filterRaw);
      }
      root.getElementById('filterDaysSvg').textContent = filterDays !== null ? `${filterDays} days` : '-- days';
      filterGroup.style.display = '';
    } else {
      filterGroup.style.display = 'none';
    }

    // 9. Reheater Coil (Heating State directly from Climate)
    const heaterSwitch = this._getSwitchEntity('heater');
    this._setEntityTarget(root.getElementById('heaterGroup'), heaterSwitch || climateId);

    const heaterCol = root.getElementById('heaterCol');
    let isHeaterEnabled = false;
    if (heaterSwitch) {
      isHeaterEnabled = (!isUnitOff) && ((this._optimistic.heater !== undefined)
        ? this._optimistic.heater
        : (this._getState(heaterSwitch) === 'on'));
      root.getElementById('heaterSwitch').classList.toggle('on', isHeaterEnabled);
      heaterCol.style.display = '';
    } else {
      heaterCol.style.display = 'none';
    }

    // Is the heater physically heating RIGHT NOW?
    const climateAction = (climate?.attributes?.hvac_action || climate?.attributes?.action || '').toLowerCase();
    const isHeatingActive = (!isUnitOff) && (
      heaterSwitch ? isHeaterEnabled : true
    ) && (
      climateAction === 'heating' || (climate?.state === 'heat' && climateAction !== 'idle' && climateAction !== 'fan')
    );

    const coil = root.getElementById('heaterCoil');
    const aura = root.getElementById('heaterAura');
    if (isHeatingActive) {
      coil.classList.add('active');
      aura.style.opacity = '1';
    } else {
      coil.classList.remove('active');
      aura.style.opacity = '0';
    }

    // 10. Eco Mode & Free Cooling Switches
    const ecoSwitch = this._getSwitchEntity('eco');
    const ecoCol = root.getElementById('ecoCol');
    if (ecoSwitch) {
      const isEcoOn = (this._optimistic.eco !== undefined)
        ? this._optimistic.eco
        : (this._getState(ecoSwitch) === 'on');
      root.getElementById('ecoSwitch').classList.toggle('on', isEcoOn);
      ecoCol.style.display = '';
    } else {
      ecoCol.style.display = 'none';
    }

    const freeCoolingSwitch = this._getSwitchEntity('free_cooling');
    const freeCoolingCol = root.getElementById('freeCoolingCol');
    if (freeCoolingSwitch) {
      const isFreeCoolingOn = (this._optimistic.free_cooling !== undefined)
        ? this._optimistic.free_cooling
        : (this._getState(freeCoolingSwitch) === 'on');
      root.getElementById('freeCoolingSwitch').classList.toggle('on', isFreeCoolingOn);
      freeCoolingCol.style.display = '';
    } else {
      freeCoolingCol.style.display = 'none';
    }

    const togglesGrid = root.querySelector('.toggles-grid');
    if (togglesGrid) {
      togglesGrid.style.display = (!heaterSwitch && !ecoSwitch && !freeCoolingSwitch) ? 'none' : '';
    }

    // 11. Fan Speed Pills
    root.querySelectorAll('#fanPills .pill').forEach(btn => {
      const sp = btn.getAttribute('data-speed');
      btn.classList.toggle('active', sp === currentFanMode);
    });

    // 12. Presets Row
    root.querySelectorAll('#presetsRow .preset-chip').forEach(chip => {
      const m = chip.getAttribute('data-mode');
      chip.classList.toggle('active', (!isUnitOff) && (m === activePreset));
    });
  }

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

    if (speed === 'off') {
      this._hass.callService('climate', 'set_fan_mode', {
        entity_id: climateId,
        fan_mode: 'off',
      });
    } else {
      this._hass.callService('climate', 'set_fan_mode', {
        entity_id: climateId,
        fan_mode: speed,
      });
    }
    setTimeout(() => {
      delete this._optimistic.fan_mode;
      this._updateValues();
    }, 4500);
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
    const entityId = this._getSwitchEntity(type);
    let curState = false;

    if (this._optimistic[type] !== undefined) {
      curState = this._optimistic[type];
    } else if (entityId && this._hass && this._hass.states[entityId]) {
      curState = (this._hass.states[entityId].state === 'on');
    }

    const newState = !curState;
    this._optimistic[type] = newState;
    this._updateValues();

    if (entityId && this._hass) {
      const service = newState ? 'turn_on' : 'turn_off';
      const [domain] = entityId.split('.');
      this._hass.callService(domain || 'switch', service, { entity_id: entityId });
    }

    setTimeout(() => {
      delete this._optimistic[type];
      this._updateValues();
    }, 3500);
  }
}

// Visual Card Editor using standard Home Assistant <ha-form> with autocomplete pickers
const CARD_EDITOR_SCHEMA = [
  {
    name: 'title',
    label: 'Заголовок карточки',
    selector: { text: {} },
  },
  {
    name: 'climate',
    label: 'Сущность климата (Climate)',
    selector: { entity: { domain: 'climate' } },
  },
  // Air Temperatures & Flows
  {
    name: 'outdoor_temp_entity',
    label: 'Уличный воздух: Температура (Duct 1)',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'supply_temp_entity',
    label: 'Приточный воздух: Температура (Duct 4)',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'supply_flow_entity',
    label: 'Приточный воздух: Расход (m³/h)',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'extract_temp_entity',
    label: 'Вытяжной воздух из комнат: Температура (Duct 3)',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'extract_humidity_entity',
    label: 'Вытяжной воздух: Влажность (% RH)',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'extract_co2_entity',
    label: 'Вытяжной воздух: Уровень CO₂ (ppm)',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'exhaust_temp_entity',
    label: 'Удаляемый воздух на улицу: Температура (Duct 2)',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'exhaust_flow_entity',
    label: 'Удаляемый воздух на улицу: Расход (m³/h)',
    selector: { entity: { domain: 'sensor' } },
  },
  // Power & Fans & Filter
  {
    name: 'power_entity',
    label: 'Датчик потребляемой мощности (W / kW)',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'saf_rpm_entity',
    label: 'Обороты приточного вентилятора SAF (RPM)',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'eaf_rpm_entity',
    label: 'Обороты вытяжного вентилятора EAF (RPM)',
    selector: { entity: { domain: 'sensor' } },
  },
  {
    name: 'heat_recovery_entity',
    label: 'Бинарный сенсор работы рекуператора',
    selector: { entity: { domain: ['binary_sensor', 'sensor'] } },
  },
  {
    name: 'filter_entity',
    label: 'Остаток ресурса фильтра',
    selector: { entity: { domain: 'sensor' } },
  },
  // Functional Switches
  {
    name: 'heater_switch',
    label: 'Переключатель Heater (разрешение ТЭНа)',
    selector: { entity: { domain: 'switch' } },
  },
  {
    name: 'eco_switch',
    label: 'Переключатель Eco Mode',
    selector: { entity: { domain: 'switch' } },
  },
  {
    name: 'free_cooling_switch',
    label: 'Переключатель Free Cooling',
    selector: { entity: { domain: 'switch' } },
  },
];

class SystemairRecuperatorCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config ? { ...config } : {};
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;

    if (!this._form) {
      this._form = document.createElement('ha-form');
      this._form.hass = this._hass;
      this._form.data = this._config;
      this._form.schema = CARD_EDITOR_SCHEMA;
      this._form.computeLabel = (s) => s.label || s.name;
      this._form.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this._config = { ...ev.detail.value };
        const event = new CustomEvent('config-changed', {
          bubbles: true,
          composed: true,
          detail: { config: this._config },
        });
        this.dispatchEvent(event);
      });
      this.innerHTML = '';
      this.appendChild(this._form);
    } else {
      this._form.hass = this._hass;
      this._form.data = this._config;
    }
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
