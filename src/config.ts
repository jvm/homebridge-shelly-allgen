import type { PlatformConfig } from 'homebridge';
import type { DeviceEndpoint } from './shelly/types.js';

export const GAS_SENSOR_TYPES = ['leak', 'smoke', 'co'] as const;
export type GasSensorType = typeof GAS_SENSOR_TYPES[number];

export interface DeviceConfig extends DeviceEndpoint {
  /** Overrides the platform-wide `offlineAfterFailures` for this device; 0 disables offline reporting. */
  offlineAfterFailures?: number;
  /** Substrings matched against this device's component key/name/type; when set, only matching components are exposed. */
  include?: string[];
  /** Substrings matched against this device's component key/name/type; matching components are hidden. */
  exclude?: string[];
}

function stringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(String) : [];
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
  /** HomeKit service for Shelly Gas sensors: LeakSensor, SmokeSensor, or CarbonMonoxideSensor. */
  gasSensorType: GasSensorType;
  debug: boolean;
}

function positiveInt(raw: unknown, fallback: number, min: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[]): T | undefined {
  return allowed.find(v => v === raw);
}

function parseDevice(raw: DeviceConfig): DeviceConfig {
  const device: DeviceConfig = { ...raw };
  if (raw.include !== undefined) device.include = stringList(raw.include);
  if (raw.exclude !== undefined) device.exclude = stringList(raw.exclude);
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
    include: stringList(config.include),
    exclude: stringList(config.exclude),
    offlineAfterFailures: positiveInt(config.offlineAfterFailures, 3, 0),
    gasSensorType: oneOf(config.gasSensorType, GAS_SENSOR_TYPES) ?? 'leak',
    debug: config.debug === true,
  };
}
