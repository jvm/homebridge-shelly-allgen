import { fetchJson, url } from '../util/http.js';
import { arr, num, obj, str, type Dict } from './parse.js';
import type { CoverCommand, Credentials, LightCommand, ShellyClient, ShellyComponent, ShellyDeviceInfo } from './types.js';

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

    arr(status.relays).forEach((r, i) => {
      out.push({ key: `relay:${i}`, type: 'switch', id: i, name: str(obj(arr(settings.relays)[i])?.name), state: { on: !!r.ison, power: num(r.power), energy: num(r.energy) } });
    });
    arr(status.lights).forEach((l, i) => {
      out.push({ key: `light:${i}`, type: 'light', id: i, name: str(obj(arr(settings.lights)[i])?.name), state: { on: !!l.ison, brightness: num(l.brightness) ?? num(l.gain), power: num(l.power), energy: num(l.energy) } });
    });
    arr(status.rollers).forEach((r, i) => {
      const pos = num(r.current_pos);
      out.push({ key: `roller:${i}`, type: 'cover', id: i, name: str(obj(arr(settings.rollers)[i])?.name), state: { currentPosition: pos, targetPosition: num(r.target_pos), moving: r.state === 'open' ? 'opening' : r.state === 'close' ? 'closing' : 'stopped', closed: pos === 0 } });
    });
    arr(status.inputs).forEach((input, i) => {
      out.push({ key: `input:${i}`, type: 'input', id: i, name: str(obj(arr(settings.inputs)[i])?.name), state: { active: !!input.input, event: str(input.event), eventCount: num(input.event_cnt) } });
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
