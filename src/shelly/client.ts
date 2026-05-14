import { fetchJson, url } from '../util/http.js';
import { Gen1Client } from './gen1-client.js';
import { Gen2Client } from './gen2-client.js';
import type { DeviceEndpoint, NormalizedShellyDevice, ShellyClient } from './types.js';

export type ClientLogger = (level: 'warn' | 'debug', message: string) => void;

export async function createShellyClient(endpoint: DeviceEndpoint, timeoutMs: number, log: ClientLogger = () => {}): Promise<ShellyClient> {
  const protocol = endpoint.protocol ?? 'http';
  const probe = await fetchJson<{ gen?: number }>(url(endpoint.host, '/shelly', protocol), { timeoutMs, credentials: endpoint });
  const gen = endpoint.generation === 'gen1' ? 1 : endpoint.generation === 'gen2' ? 2 : Number(probe.gen ?? 1);
  return gen >= 2
    ? new Gen2Client(endpoint.host, timeoutMs, endpoint, endpoint.name, protocol, log)
    : new Gen1Client(endpoint.host, timeoutMs, endpoint, endpoint.name, protocol);
}

export async function readNormalizedDevice(endpoint: DeviceEndpoint, timeoutMs: number, log: ClientLogger = () => {}): Promise<{ client: ShellyClient; device: NormalizedShellyDevice }> {
  const client = await createShellyClient(endpoint, timeoutMs, log);
  const [info, components] = await Promise.all([client.getDeviceInfo(), client.discoverComponents()]);
  return { client, device: { ...info, name: endpoint.name ?? info.name, components } };
}
