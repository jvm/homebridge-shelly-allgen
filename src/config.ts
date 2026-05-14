import type { PlatformConfig } from 'homebridge';

export interface DeviceConfig {
  host: string;
  name?: string;
  username?: string;
  password?: string;
  protocol?: 'http' | 'https';
  generation?: 'auto' | 'gen1' | 'gen2';
}

export interface ShellyAllGenConfig {
  name: string;
  discovery: boolean;
  devices: DeviceConfig[];
  pollInterval: number;
  requestTimeout: number;
  realtime: boolean;
  coiot: boolean;
  splitChannels: boolean;
  removeStaleAccessories: boolean;
  include: string[];
  exclude: string[];
  debug: boolean;
}

function positiveInt(raw: unknown, fallback: number, min: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}

export function parseConfig(config: PlatformConfig): ShellyAllGenConfig {
  return {
    name: String(config.name ?? 'Homebridge Shelly AllGen'),
    discovery: config.discovery !== false,
    devices: Array.isArray(config.devices) ? config.devices.filter((d): d is DeviceConfig => !!d?.host) : [],
    pollInterval: positiveInt(config.pollInterval, 5, 5),
    requestTimeout: positiveInt(config.requestTimeout, 5, 1),
    realtime: config.realtime !== false,
    coiot: config.coiot !== false,
    splitChannels: config.splitChannels === true,
    removeStaleAccessories: config.removeStaleAccessories === true,
    include: Array.isArray(config.include) ? config.include.map(String) : [],
    exclude: Array.isArray(config.exclude) ? config.exclude.map(String) : [],
    debug: config.debug === true,
  };
}
