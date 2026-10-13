import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShellyComponent } from '../src/shelly/types.js';
import { createAccessory, fakeClient, fakePlatform, FakePlatformAccessory, hap } from './helpers/accessory.js';

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

describe('offline reporting', () => {
  const COMM_FAILURE = hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE;

  async function poll(times = 1) {
    for (let i = 0; i < times; i++) await vi.advanceTimersByTimeAsync(5000);
  }

  function setup(options: { offlineAfterFailures?: number } = {}) {
    const created = track(createAccessory({ components: [relay(0, true), temperature], options }));
    const sw = created.accessory.getServiceById(hap.Service.Switch, 'relay:0')!;
    const temp = created.accessory.getServiceById(hap.Service.TemperatureSensor, 'sensor:temperature')!;
    return { ...created, sw, temp };
  }

  it('keeps serving state while failures stay below the threshold', async () => {
    const { client, sw } = setup();
    client.discoverComponents.mockRejectedValue(new Error('ETIMEDOUT'));
    await poll(2);
    await expect(sw.getCharacteristic(hap.Characteristic.On).handleGetRequest()).resolves.toBe(true);
  });

  it('throws SERVICE_COMMUNICATION_FAILURE and sets StatusFault after N consecutive failures', async () => {
    const { client, sw, temp } = setup();
    client.discoverComponents.mockRejectedValue(new Error('ETIMEDOUT'));
    await poll(3);
    await expect(sw.getCharacteristic(hap.Characteristic.On).handleGetRequest()).rejects.toBe(COMM_FAILURE);
    await expect(temp.getCharacteristic(hap.Characteristic.CurrentTemperature).handleGetRequest()).rejects.toBe(COMM_FAILURE);
    expect(temp.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(hap.Characteristic.StatusFault.GENERAL_FAULT);
    await expect(temp.getCharacteristic(hap.Characteristic.StatusFault).handleGetRequest()).resolves.toBe(hap.Characteristic.StatusFault.GENERAL_FAULT);
    // Switch does not declare StatusFault, so none is added to it.
    expect(sw.testCharacteristic(hap.Characteristic.StatusFault)).toBe(false);
  });

  it('logs one info line on offline and one on recovery, not per poll', async () => {
    const { client, platform, sw, temp } = setup();
    client.discoverComponents.mockRejectedValue(new Error('ETIMEDOUT'));
    await poll(6);
    expect(platform.log.info.mock.calls.filter(([m]) => String(m).includes('not responding'))).toHaveLength(1);
    client.discoverComponents.mockResolvedValue([relay(0, false), temperature]);
    await poll(3);
    expect(platform.log.info.mock.calls.filter(([m]) => String(m).includes('responding again'))).toHaveLength(1);
    await expect(sw.getCharacteristic(hap.Characteristic.On).handleGetRequest()).resolves.toBe(false);
    expect(temp.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(hap.Characteristic.StatusFault.NO_FAULT);
  });

  it('resets the failure count after a successful poll', async () => {
    const { client, sw } = setup();
    client.discoverComponents.mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x'));
    await poll(3); // fail, fail, succeed
    client.discoverComponents.mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x'));
    await poll(2);
    await expect(sw.getCharacteristic(hap.Characteristic.On).handleGetRequest()).resolves.toBe(true);
  });

  it('never reports offline when offlineAfterFailures is 0', async () => {
    const { client, platform, sw } = setup({ offlineAfterFailures: 0 });
    client.discoverComponents.mockRejectedValue(new Error('ETIMEDOUT'));
    await poll(10);
    await expect(sw.getCharacteristic(hap.Characteristic.On).handleGetRequest()).resolves.toBe(true);
    expect(platform.log.info).not.toHaveBeenCalledWith(expect.stringContaining('not responding'));
  });

  it('recovers on a realtime update', async () => {
    let push: ((u: { componentKey: string; state: unknown }) => void) | undefined;
    const platform = fakePlatform({ realtime: true });
    const client = Object.assign(fakeClient([relay(0, true)]), {
      subscribe: vi.fn(async (handler: typeof push) => { push = handler; return () => {}; }),
    });
    const { accessory } = track(createAccessory({ components: [relay(0, true)], platform, client, device: { generation: 2 } }));
    await vi.advanceTimersByTimeAsync(0);
    client.discoverComponents.mockRejectedValue(new Error('ETIMEDOUT'));
    await poll(3);
    const on = accessory.getServiceById(hap.Service.Switch, 'relay:0')!.getCharacteristic(hap.Characteristic.On);
    await expect(on.handleGetRequest()).rejects.toBe(COMM_FAILURE);
    push!({ componentKey: 'relay:0', state: { on: false } });
    await expect(on.handleGetRequest()).resolves.toBe(false);
    expect(platform.log.info).toHaveBeenCalledWith(expect.stringContaining('responding again'));
  });
});

describe('gas sensor', () => {
  const gas = (value: boolean, fault = false): ShellyComponent => ({ key: 'sensor:gas', type: 'sensor', id: 4, name: 'Natural Gas', sensorKind: 'gas', state: { value, fault, unit: '0 ppm' } });

  it.each([
    ['leak', hap.Service.LeakSensor, hap.Characteristic.LeakDetected],
    ['smoke', hap.Service.SmokeSensor, hap.Characteristic.SmokeDetected],
    ['co', hap.Service.CarbonMonoxideSensor, hap.Characteristic.CarbonMonoxideDetected],
  ] as const)('maps gasSensorType %s to its HomeKit service', async (gasSensorType, service, characteristic) => {
    const { accessory } = track(createAccessory({ components: [gas(true)], options: { gasSensorType } }));
    const svc = accessory.getServiceById(service, 'sensor:gas')!;
    expect(svc).toBeDefined();
    await expect(svc.getCharacteristic(characteristic).handleGetRequest()).resolves.toBe(1);
  });

  it('replaces the cached LeakSensor when gasSensorType changes', () => {
    const accessory = new FakePlatformAccessory('Gas');
    accessory.addService(hap.Service.LeakSensor, 'Natural Gas', 'sensor:gas');
    track(createAccessory({ accessory, components: [gas(false)], options: { gasSensorType: 'co' } }));
    expect(nonInfo(accessory).map(s => s.UUID)).toEqual([hap.Service.CarbonMonoxideSensor.UUID]);
  });

  it('reports warm-up as StatusFault without a gas alarm', async () => {
    const { accessory } = track(createAccessory({ components: [gas(false, true)] }));
    const svc = accessory.getServiceById(hap.Service.LeakSensor, 'sensor:gas')!;
    await expect(svc.getCharacteristic(hap.Characteristic.LeakDetected).handleGetRequest()).resolves.toBe(0);
    await expect(svc.getCharacteristic(hap.Characteristic.StatusFault).handleGetRequest()).resolves.toBe(hap.Characteristic.StatusFault.GENERAL_FAULT);
  });

  it('pushes alarm and fault changes from polling', async () => {
    const { accessory, client } = track(createAccessory({ components: [gas(false, true)] }));
    const svc = accessory.getServiceById(hap.Service.LeakSensor, 'sensor:gas')!;
    client.discoverComponents.mockResolvedValue([gas(true, false)]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(svc.getCharacteristic(hap.Characteristic.LeakDetected).value).toBe(1);
    expect(svc.getCharacteristic(hap.Characteristic.StatusFault).value).toBe(hap.Characteristic.StatusFault.NO_FAULT);
  });
});
