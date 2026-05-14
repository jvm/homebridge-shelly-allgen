import WebSocket from 'ws';
import { fetchJson, url } from '../util/http.js';
import { num } from './parse.js';
import type { CoverCommand, Credentials, LightCommand, ShellyClient, ShellyComponent, ShellyDeviceInfo, ShellyUpdate } from './types.js';

export class Gen2Client implements ShellyClient {
  constructor(
    private readonly host: string,
    private readonly timeoutMs: number,
    private readonly credentials: Credentials = {},
    private readonly configuredName?: string,
    private readonly protocol: 'http' | 'https' = 'http',
    private readonly onLog: (level: 'warn' | 'debug', message: string) => void = () => {},
  ) {}

  async rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v === undefined || v === null) continue;
      qs.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    return fetchJson<T>(url(this.host, `/rpc/${method}${qs.size ? `?${qs}` : ''}`, this.protocol), { timeoutMs: this.timeoutMs, credentials: this.credentials });
  }

  async getDeviceInfo(): Promise<ShellyDeviceInfo> {
    const s = await fetchJson<Record<string, unknown>>(url(this.host, '/shelly', this.protocol), { timeoutMs: this.timeoutMs, credentials: this.credentials });
    return {
      id: String(s.id ?? s.mac ?? this.host),
      mac: String(s.mac ?? ''),
      host: this.host,
      generation: Number(s.gen ?? 2) as 2,
      model: String(s.model ?? s.app ?? 'Shelly Gen2+'),
      name: this.configuredName,
      firmware: String(s.ver ?? s.fw_id ?? ''),
      authEnabled: s.auth_en === true,
    };
  }

  async getStatus(): Promise<unknown> { return this.rpc('Shelly.GetStatus'); }
  async getConfig(): Promise<unknown> { return this.rpc('Shelly.GetConfig'); }

  async discoverComponents(): Promise<ShellyComponent[]> {
    const [status, config] = await Promise.all([
      this.getStatus() as Promise<Record<string, Record<string, unknown>>>,
      this.getConfig().catch(() => ({})) as Promise<Record<string, Record<string, unknown> | undefined>>,
    ]);
    const out: ShellyComponent[] = [];
    for (const [key, s] of Object.entries(status)) {
      const [type, idText] = key.split(':');
      const id = Number(idText);
      if (!Number.isFinite(id)) continue;
      const name = typeof config[key]?.name === 'string' ? config[key]!.name as string : undefined;
      // `aenergy.total` is consumed energy (Wh); `ret_aenergy.total` is energy
      // returned to the grid (Wh), present on metering-capable components.
      const aenergyTotal = num((s.aenergy as Record<string, unknown> | undefined)?.total);
      const retEnergyTotal = num((s.ret_aenergy as Record<string, unknown> | undefined)?.total);
      if (type === 'switch') out.push({ key, type: 'switch', id, name, state: { on: !!s.output, power: num(s.apower), voltage: num(s.voltage), current: num(s.current), energy: aenergyTotal, energyReturned: retEnergyTotal } });
      if (type === 'light') out.push({ key, type: 'light', id, name, state: { on: !!s.output, brightness: num(s.brightness), power: num(s.apower), energy: aenergyTotal, energyReturned: retEnergyTotal } });
      if (type === 'cover') {
        const moving = s.state === 'opening' || s.state === 'closing' ? s.state : 'stopped';
        out.push({ key, type: 'cover', id, name, state: { currentPosition: num(s.current_pos), targetPosition: num(s.target_pos), moving } });
      }
      if (type === 'input') out.push({ key, type: 'input', id, name, state: { active: !!s.state } });
      if (type === 'temperature') out.push({ key, type: 'sensor', id, name, sensorKind: 'temperature', state: { value: num(s.tC ?? s.temperature) ?? null, unit: 'celsius' } });
      if (type === 'humidity') out.push({ key, type: 'sensor', id, name, sensorKind: 'humidity', state: { value: num(s.rh) ?? null, unit: 'percent' } });
    }
    return out;
  }

  async setSwitch(id: number, on: boolean): Promise<void> { await this.rpc('Switch.Set', { id, on }); }
  async setLight(id: number, command: LightCommand): Promise<void> { await this.rpc('Light.Set', { id, on: command.on, brightness: command.brightness }); }
  async setCover(id: number, command: CoverCommand): Promise<void> {
    if (command.action === 'open') await this.rpc('Cover.Open', { id });
    else if (command.action === 'close') await this.rpc('Cover.Close', { id });
    else if (command.action === 'stop') await this.rpc('Cover.Stop', { id });
    else await this.rpc('Cover.GoToPosition', { id, pos: command.position ?? 0 });
  }

  async subscribe(handler: (update: ShellyUpdate) => void, onClose?: () => void): Promise<() => void> {
    // Match the device's HTTP protocol: ws:// for http, wss:// for https. Shelly Gen2+ exposes
    // ws://<host>/rpc by default; WSS is opt-in and the cert is self-signed, so don't reject it.
    const scheme = this.protocol === 'https' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${this.host}/rpc`, scheme === 'wss' ? { rejectUnauthorized: false } : undefined);
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      ws.removeAllListeners();
      try { ws.close(); } catch { /* ignore */ }
    };
    ws.on('message', data => {
      try {
        const frame = JSON.parse(String(data));
        if (frame.method === 'NotifyStatus' || frame.method === 'NotifyFullStatus') {
          for (const [k, v] of Object.entries(frame.params ?? {})) if (k.includes(':')) handler({ componentKey: k, state: v });
        }
        if (frame.method === 'NotifyEvent') {
          for (const e of frame.params?.events ?? []) handler({ componentKey: e.component, state: e, event: e.event });
        }
      } catch (error) {
        this.onLog('debug', `Malformed WS frame from ${this.host}: ${String(error)}`);
      }
    });
    ws.once('close', () => {
      const wasOpen = !closed;
      cleanup();
      if (wasOpen) onClose?.();
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', error => {
        const message = error instanceof Error ? error.message : String(error);
        this.onLog('debug', `WS error for ${this.host}: ${message}`);
        cleanup();
        reject(new Error(message));
      });
    });
    return cleanup;
  }
}
