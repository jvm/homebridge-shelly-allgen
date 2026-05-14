import { fetchJson, url } from '../util/http.js';
import { arr, num, obj, str, type Dict } from './parse.js';
import type { CoverCommand, Credentials, LightCommand, ShellyClient, ShellyComponent, ShellyDeviceInfo } from './types.js';

/**
 * Gen1 `/status` meters report lifetime energy in watt-minutes; the normalized
 * model uses watt-hours everywhere. `emeters` already report watt-hours and are
 * passed through unchanged.
 */
function meterWh(wattMinutes: unknown): number | undefined {
  const wm = num(wattMinutes);
  return wm === undefined ? undefined : Math.round(wm / 60);
}

export class Gen1Client implements ShellyClient {
  constructor(
    private readonly host: string,
    private readonly timeoutMs: number,
    private readonly credentials: Credentials = {},
    private readonly configuredName?: string,
    private readonly protocol: 'http' | 'https' = 'http',
  ) {}

  private get<T>(path: string) {
    return fetchJson<T>(url(this.host, path, this.protocol), { timeoutMs: this.timeoutMs, credentials: this.credentials });
  }

  async getDeviceInfo(): Promise<ShellyDeviceInfo> {
    const s = await this.get<Dict>('/shelly');
    return {
      id: String(s.mac ?? this.host),
      mac: String(s.mac ?? ''),
      host: this.host,
      generation: 1,
      model: String(s.type ?? 'Shelly Gen1'),
      name: this.configuredName,
      firmware: String(s.fw ?? ''),
      authEnabled: s.auth === true,
    };
  }

  async getStatus(): Promise<unknown> { return this.get('/status'); }
  async getConfig(): Promise<unknown> { return this.get('/settings'); }

  async discoverComponents(): Promise<ShellyComponent[]> {
    const [status, settings] = await Promise.all([
      this.getStatus() as Promise<Dict>,
      this.getConfig().catch(() => ({})) as Promise<Dict>,
    ]);
    const out: ShellyComponent[] = [];
    // Gen1 reports power/energy per channel in `status.meters[]`, indexed to
    // match the relay/light arrays — not on the relay/light objects themselves.
    const meters = arr(status.meters);
    // A Shelly 2.5 in roller mode still lists its two relays in /status; they
    // are driven by the roller, so don't surface them as standalone switches.
    const rollerMode = str(settings.mode) === 'roller';

    if (!rollerMode) {
      arr(status.relays).forEach((r, i) => {
        const meter = obj(meters[i]);
        out.push({ key: `relay:${i}`, type: 'switch', id: i, name: str(obj(arr(settings.relays)[i])?.name), state: { on: !!r.ison, power: num(meter?.power), energy: meterWh(meter?.total) } });
      });
    }
    arr(status.lights).forEach((l, i) => {
      const meter = obj(meters[i]);
      out.push({ key: `light:${i}`, type: 'light', id: i, name: str(obj(arr(settings.lights)[i])?.name), state: { on: !!l.ison, brightness: num(l.brightness) ?? num(l.gain), power: num(meter?.power), energy: meterWh(meter?.total) } });
    });
    arr(status.rollers).forEach((r, i) => {
      const pos = num(r.current_pos);
      out.push({ key: `roller:${i}`, type: 'cover', id: i, name: str(obj(arr(settings.rollers)[i])?.name), state: { currentPosition: pos, targetPosition: num(r.target_pos), moving: r.state === 'open' ? 'opening' : r.state === 'close' ? 'closing' : 'stopped', closed: pos === 0 } });
    });
    arr(status.inputs).forEach((input, i) => {
      out.push({ key: `input:${i}`, type: 'input', id: i, name: str(obj(arr(settings.inputs)[i])?.name), state: { active: !!input.input, event: str(input.event), eventCount: num(input.event_cnt) } });
    });
    // Shelly EM / 3EM expose per-channel CT-clamp measurements in `emeters[]`.
    // These are standalone meters (no relay/light), so they become `meter`
    // components. `total` / `total_returned` are already watt-hours.
    arr(status.emeters).forEach((m, i) => {
      out.push({
        key: `emeter:${i}`,
        type: 'meter',
        id: i,
        name: str(obj(arr(settings.emeters)[i])?.name),
        state: {
          power: num(m.power),
          voltage: num(m.voltage),
          current: num(m.current),
          powerFactor: num(m.pf),
          energy: num(m.total),
          energyReturned: num(m.total_returned),
        },
      });
    });

    const tmp = obj(status.tmp);
    if (tmp?.tC !== undefined) out.push({ key: 'sensor:temperature', type: 'sensor', id: 0, sensorKind: 'temperature', state: { value: num(tmp.tC) ?? null, unit: 'celsius' } });
    const hum = obj(status.hum);
    if (hum?.value !== undefined) out.push({ key: 'sensor:humidity', type: 'sensor', id: 1, sensorKind: 'humidity', state: { value: num(hum.value) ?? null, unit: 'percent' } });
    const sensor = obj(status.sensor);
    if (sensor?.state !== undefined) out.push({ key: 'sensor:contact', type: 'sensor', id: 2, sensorKind: 'contact', state: { value: typeof sensor.state === 'string' ? sensor.state : !!sensor.state } });
    if (status.flood !== undefined) out.push({ key: 'sensor:flood', type: 'sensor', id: 3, sensorKind: 'flood', state: { value: !!status.flood } });
    const gas = obj(status.gas_sensor);
    if (gas) {
      const concentration = obj(status.concentration);
      const ppm = num(concentration?.ppm);
      out.push({ key: 'sensor:gas', type: 'sensor', id: 4, name: 'Natural Gas', sensorKind: 'gas', state: { value: gas.alarm_state !== 'none' || gas.sensor_state !== 'normal', unit: ppm !== undefined ? `${ppm} ppm` : undefined } });
    }
    return out;
  }

  async setSwitch(id: number, on: boolean): Promise<void> { await this.get(`/relay/${id}?turn=${on ? 'on' : 'off'}`); }
  async setLight(id: number, command: LightCommand): Promise<void> {
    const p = new URLSearchParams();
    if (command.on !== undefined) p.set('turn', command.on ? 'on' : 'off');
    if (command.brightness !== undefined) p.set('brightness', String(Math.round(command.brightness)));
    await this.get(`/light/${id}?${p.toString()}`);
  }
  async setCover(id: number, command: CoverCommand): Promise<void> {
    const q = command.action === 'position' ? `go=to_pos&roller_pos=${command.position ?? 0}` : `go=${command.action}`;
    await this.get(`/roller/${id}?${q}`);
  }
}
