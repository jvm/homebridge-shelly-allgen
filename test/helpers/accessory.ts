// Minimal Homebridge stand-ins for driving ShellyDeviceAccessory in unit tests.
// Services and characteristics are real HAP-NodeJS objects, so onGet/onSet
// handlers, HapStatusError, and optional-characteristic rules behave exactly as
// they do under Homebridge. Only the platform shell and PlatformAccessory
// wrapper are faked.
import * as hap from '@homebridge/hap-nodejs';
import { vi } from 'vitest';
import type { API, PlatformAccessory, PlatformConfig } from 'homebridge';
import { ShellyDeviceAccessory } from '../../src/accessories/device-accessory.js';
import { createEveTypes } from '../../src/accessories/eve.js';
import { parseConfig } from '../../src/config.js';
import type { ShellyAllGenPlatform } from '../../src/platform.js';
import type { NormalizedShellyDevice, ShellyClient, ShellyComponent } from '../../src/shelly/types.js';

export { hap };

/** Wraps a real HAP Accessory with the subset of the PlatformAccessory API the plugin uses. */
export class FakePlatformAccessory {
  readonly hapAccessory: hap.Accessory;
  context: Record<string, unknown> = {};
  constructor(public displayName: string, public UUID = hap.uuid.generate(displayName)) {
    this.hapAccessory = new hap.Accessory(displayName, UUID);
  }
  get services() { return this.hapAccessory.services; }
  addService(...args: Parameters<hap.Accessory['addService']>) { return this.hapAccessory.addService(...args); }
  getService(type: typeof hap.Service) { return this.hapAccessory.getService(type); }
  getServiceById(type: typeof hap.Service, subtype: string) { return this.hapAccessory.getServiceById(type, subtype); }
  removeService(service: hap.Service) { this.hapAccessory.removeService(service); }
}

export function fakePlatform(config: Partial<PlatformConfig> = {}) {
  const api = { hap, version: 2.7, serverVersion: '2.0.0', hapLibraryVersion: () => '1.0.0' } as unknown as API;
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return {
    api,
    log,
    Service: hap.Service,
    Characteristic: hap.Characteristic,
    eve: createEveTypes(api),
    configValues: parseConfig({ platform: 'ShellyAllGen', name: 'Test', realtime: false, ...config } as PlatformConfig),
    coiot: undefined,
  };
}

export type FakePlatform = ReturnType<typeof fakePlatform>;

export function fakeClient(components: ShellyComponent[] = []) {
  return {
    getDeviceInfo: vi.fn(),
    getStatus: vi.fn(),
    getConfig: vi.fn(),
    discoverComponents: vi.fn(async () => components),
    setSwitch: vi.fn(async () => {}),
    setLight: vi.fn(async () => {}),
    setCover: vi.fn(async () => {}),
  } satisfies ShellyClient;
}

export function device(components: ShellyComponent[], overrides: Partial<NormalizedShellyDevice> = {}): NormalizedShellyDevice {
  return {
    id: 'shelly-test', mac: 'AABBCCDDEEFF', host: '192.0.2.10', generation: 1, model: 'SHSW-1',
    firmware: '1.0.0', authEnabled: false, components, ...overrides,
  };
}

export function createAccessory(opts: {
  components: ShellyComponent[];
  accessory?: FakePlatformAccessory;
  platform?: FakePlatform;
  client?: ReturnType<typeof fakeClient>;
  device?: Partial<NormalizedShellyDevice>;
  allowedComponentKeys?: Set<string>;
}) {
  const platform = opts.platform ?? fakePlatform();
  const accessory = opts.accessory ?? new FakePlatformAccessory('Test Device');
  const client = opts.client ?? fakeClient(opts.components);
  const handler = new ShellyDeviceAccessory(
    platform as unknown as ShellyAllGenPlatform,
    accessory as unknown as PlatformAccessory,
    client,
    device(opts.components, opts.device),
    opts.allowedComponentKeys,
  );
  return { platform, accessory, client, handler };
}
