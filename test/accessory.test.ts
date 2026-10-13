import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShellyComponent } from '../src/shelly/types.js';
import { createAccessory, FakePlatformAccessory, hap } from './helpers/accessory.js';

const relay = (id: number, on = false): ShellyComponent => ({ key: `relay:${id}`, type: 'switch', id, state: { on } });
const temperature: ShellyComponent = { key: 'sensor:temperature', type: 'sensor', id: 0, sensorKind: 'temperature', state: { value: 21.5, unit: 'celsius' } };

const handlers: { close(): void }[] = [];
function track<T extends { handler: { close(): void } }>(created: T): T {
  handlers.push(created.handler);
  return created;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  for (const h of handlers.splice(0)) h.close();
  vi.useRealTimers();
});

const nonInfo = (a: FakePlatformAccessory) => a.services.filter(s => s.UUID !== hap.Service.AccessoryInformation.UUID);

describe('stale service pruning', () => {
  it('removes cached services whose component is gone, keeping AccessoryInformation', () => {
    const accessory = new FakePlatformAccessory('Cached');
    accessory.addService(hap.Service.Switch, 'Old', 'relay:1');
    accessory.addService(hap.Service.TemperatureSensor, 'Old temp', 'sensor:temperature');
    track(createAccessory({ accessory, components: [relay(0)] }));
    expect(nonInfo(accessory).map(s => s.subtype)).toEqual(['relay:0']);
    expect(accessory.getService(hap.Service.AccessoryInformation)).toBeDefined();
  });

  it('keeps cached services that still match a component and reuses them', () => {
    const accessory = new FakePlatformAccessory('Cached');
    const cached = accessory.addService(hap.Service.Switch, 'Kept', 'relay:0');
    track(createAccessory({ accessory, components: [relay(0), temperature] }));
    expect(accessory.getServiceById(hap.Service.Switch, 'relay:0')).toBe(cached);
    expect(nonInfo(accessory).map(s => s.subtype).sort()).toEqual(['relay:0', 'sensor:temperature']);
  });

  it('removes a service whose subtype matches but whose type no longer does', () => {
    const accessory = new FakePlatformAccessory('Cached');
    accessory.addService(hap.Service.Lightbulb, 'Was a light', 'relay:0');
    track(createAccessory({ accessory, components: [relay(0)] }));
    expect(nonInfo(accessory).map(s => s.UUID)).toEqual([hap.Service.Switch.UUID]);
  });

  it('prunes components outside the allowed set in splitChannels mode', () => {
    const accessory = new FakePlatformAccessory('Cached');
    accessory.addService(hap.Service.Switch, 'Other channel', 'relay:1');
    track(createAccessory({ accessory, components: [relay(0), relay(1)], allowedComponentKeys: new Set(['relay:0']) }));
    expect(nonInfo(accessory).map(s => s.subtype)).toEqual(['relay:0']);
  });

  it('removes services for components without a HomeKit mapping', () => {
    const accessory = new FakePlatformAccessory('Cached');
    accessory.addService(hap.Service.Switch, 'Input', 'input:0');
    track(createAccessory({ accessory, components: [{ key: 'input:0', type: 'input', id: 0, state: { active: false } }] }));
    expect(nonInfo(accessory)).toEqual([]);
  });
});
