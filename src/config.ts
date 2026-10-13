import type { PlatformConfig } from 'homebridge';
import type { DeviceEndpoint } from './shelly/types.js';

export interface DeviceConfig extends DeviceEndpoint {
  /** Overrides the platform-wide `offlineAfterFailures` for this device; 0 disables offline reporting. */
  offlineAfterFailures?: number;
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
  /** Consecutive failed polls before a device reports "No Response"; 0 disables. */
  offlineAfterFailures: number;
  debug: boolean;
}

function positiveInt(raw: unknown, fallback: number, min: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}

function parseDevice(raw: DeviceConfig): DeviceConfig {
  const device: DeviceConfig = { ...raw };
  if (raw.offlineAfterFailures !== undefined) device.offlineAfterFailures = positiveInt(raw.offlineAfterFailures, 3, 0);
  return device;
}

export function parseConfig(config: PlatformConfig): ShellyAllGenConfig {
  return {
    name: String(config.name ?? 'Homebridge Shelly AllGen'),
    discovery: config.discovery !== false,
    devices: Array.isArray(config.devices) ? config.devices.filter((d): d is DeviceConfig => !!d?.host).map(parseDevice) : [],
    pollInterval: positiveInt(config.pollInterval, 5, 5),
    requestTimeout: positiveInt(config.requestTimeout, 5, 1),
    realtime: config.realtime !== false,
    coiot: config.coiot !== false,
    splitChannels: config.splitChannels === true,
    removeStaleAccessories: config.removeStaleAccessories === true,
    include: Array.isArray(config.include) ? config.include.map(String) : [],
    exclude: Array.isArray(config.exclude) ? config.exclude.map(String) : [],
    offlineAfterFailures: positiveInt(config.offlineAfterFailures, 3, 0),
    debug: config.debug === true,
  };
}
