import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { API, Logging, PlatformConfig } from 'homebridge';
import { ShellyAllGenPlatform } from '../src/platform.js';
import type { ShellyComponent } from '../src/shelly/types.js';
import { device, fakeClient, FakePlatformAccessory, hap } from './helpers/accessory.js';

const outletRelay: ShellyComponent = { key: 'relay:0', type: 'switch', id: 0, applianceType: 'outlet', state: { on: true, power: 10 } };

/** Record the service UUIDs each accessory carried at the moment Homebridge was asked to save it. */
function setup() {
  const saved: { call: 'register' | 'update'; services: string[] }[] = [];
  const snapshot = (call: 'register' | 'update') => (...args: unknown[]) => {
    const accessories = args.at(-1) as FakePlatformAccessory[];
    for (const a of accessories) saved.push({ call, services: a.services.map(s => s.UUID) });
  };
  const api = {
    hap,
    version: 2.7,
    serverVersion: '2.0.0',
    hapLibraryVersion: () => '1.0.0',
    platformAccessory: FakePlatformAccessory,
    on: vi.fn(),
    registerPlatformAccessories: vi.fn(snapshot('register')),
    updatePlatformAccessories: vi.fn(snapshot('update')),
    unregisterPlatformAccessories: vi.fn(),
  };
  const log = Object.assign(vi.fn(), { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() });
  const platform = new ShellyAllGenPlatform(log as unknown as Logging, { platform: 'ShellyAllGen', name: 'Test', realtime: false } as PlatformConfig, api as unknown as API);
  const register = (platform as unknown as { registerDeviceAccessory: (...a: unknown[]) => void }).registerDeviceAccessory.bind(platform);
  return { platform, api, saved, register };
}

let platformUnderTest: ShellyAllGenPlatform | undefined;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  const handlers = (platformUnderTest as unknown as { handlers?: Map<string, { close(): void }> })?.handlers;
  for (const h of handlers?.values() ?? []) h.close();
  platformUnderTest = undefined;
  vi.useRealTimers();
});

describe('accessory registration', () => {
  it('registers a new accessory only after its services are configured', () => {
    const { platform, api, saved, register } = setup();
    platformUnderTest = platform;
    register(fakeClient([outletRelay]), device([outletRelay], { model: 'SHSW-PM' }), { host: '192.0.2.10' });
    expect(api.registerPlatformAccessories).toHaveBeenCalledTimes(1);
    expect(api.updatePlatformAccessories).not.toHaveBeenCalled();
    expect(saved[0].services).toEqual([hap.Service.AccessoryInformation.UUID, hap.Service.Outlet.UUID]);
  });

  it('saves a restored accessory after pruning, without re-registering it', () => {
    const { platform, api, saved, register } = setup();
    platformUnderTest = platform;
    const cached = new FakePlatformAccessory('Cached', hap.uuid.generate('shelly:AABBCCDDEEFF'));
    cached.addService(hap.Service.Switch, 'Old', 'relay:0');
    platform.configureAccessory(cached as never);
    register(fakeClient([outletRelay]), device([outletRelay], { model: 'SHSW-PM' }), { host: '192.0.2.10' });
    expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
    expect(saved).toEqual([{ call: 'update', services: [hap.Service.AccessoryInformation.UUID, hap.Service.Outlet.UUID] }]);
  });

  it('names splitChannels accessories with sibling-aware suffixes and stores a single-component context', () => {
    const { platform, register } = setup();
    platformUnderTest = platform;
    const relays: ShellyComponent[] = [0, 1].map(id => ({ key: `relay:${id}`, type: 'switch', id, state: { on: false } }));
    const dev = device(relays, { name: 'Hall', model: 'SHSW-25' });
    for (const c of relays) register(fakeClient(relays), dev, { host: '192.0.2.10' }, c);
    const accessories = [...(platform as unknown as { accessories: Map<string, FakePlatformAccessory> }).accessories.values()];
    expect(accessories.map(a => a.services[1].getCharacteristic(hap.Characteristic.Name).value)).toEqual(['Hall Switch 1', 'Hall Switch 2']);
    expect(accessories.map(a => (a.context.device as { components: ShellyComponent[] }).components.map(c => c.key))).toEqual([['relay:0'], ['relay:1']]);
  });
});
