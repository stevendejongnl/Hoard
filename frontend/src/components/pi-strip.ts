import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { PiStats } from '../types';
import { sseClient } from '../sse';

@customElement('pi-strip')
export class PiStrip extends LitElement {
  @state() stats: PiStats | null = null;

  private _unsubscribe: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._unsubscribe = sseClient.subscribe((payload) => {
      if (payload.type === 'pi_stats') {
        this.stats = payload.data;
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  private fmtUptime(s: number): string {
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    return `${hours}h ${minutes}m`;
  }

  render() {
    const s = this.stats;

    const cpuTemp = s?.cpu_temp ?? 0;
    const cpuLoad = s?.cpu_load ?? 0;
    const memUsed = s?.memory_pct ?? 0;
    const diskUsed = s?.disk_pct ?? 0;
    const uptimeSec = s?.uptime_s ?? 0;

    return html`
      <div class="strip">
        <!-- CPU Temp -->
        <div class="cell">
          <span class="value">${cpuTemp.toFixed(1)}°C</span>
          <span class="label">CPU Temp</span>
          <div class="bar-track">
            <div
              class="bar-fill"
              style="width: ${Math.min(100, (cpuTemp / 90) * 100)}%"
            ></div>
          </div>
        </div>

        <!-- CPU Load -->
        <div class="cell">
          <span class="value">${cpuLoad.toFixed(1)}%</span>
          <span class="label">CPU Load</span>
          <div class="bar-track">
            <div
              class="bar-fill"
              style="width: ${Math.min(100, cpuLoad)}%"
            ></div>
          </div>
        </div>

        <!-- Memory -->
        <div class="cell">
          <span class="value">${memUsed.toFixed(1)}%</span>
          <span class="label">Memory</span>
          <div class="bar-track">
            <div
              class="bar-fill"
              style="width: ${Math.min(100, memUsed)}%"
            ></div>
          </div>
        </div>

        <!-- Disk -->
        <div class="cell">
          <span class="value">${diskUsed.toFixed(1)}%</span>
          <span class="label">Disk</span>
          <div class="bar-track">
            <div
              class="bar-fill"
              style="width: ${Math.min(100, diskUsed)}%"
            ></div>
          </div>
        </div>

        <!-- Uptime -->
        <div class="cell no-border">
          <span class="value">${this.fmtUptime(uptimeSec)}</span>
          <span class="label">Uptime</span>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }

    .strip {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius, 8px);
      overflow: hidden;
    }

    .cell {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 14px 18px;
      border-right: 1px solid var(--border);
    }

    .cell.no-border {
      border-right: none;
    }

    .value {
      font-size: 20px;
      font-weight: 300;
      color: var(--text);
      line-height: 1;
    }

    .label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .bar-track {
      height: 2px;
      background: var(--border);
      border-radius: 1px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      background: #444;
      border-radius: 1px;
      transition: width 0.4s ease;
    }

    @media (max-width: 600px) {
      .strip {
        grid-template-columns: repeat(2, 1fr);
      }

      .cell {
        padding: 10px 12px;
        border-right: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
      }

      .cell.no-border {
        border-right: none;
      }

      .value {
        font-size: 16px;
      }

      .bar-track {
        height: 4px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'pi-strip': PiStrip;
  }
}
