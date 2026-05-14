import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gen1Client } from '../src/shelly/gen1-client.js';
import { Gen2Client } from '../src/shelly/gen2-client.js';
import * as gen1 from './fixtures/gen1.js';
import * as gen2 from './fixtures/gen2.js';

// `discoverComponents()` is the normalization core: each client flattens its
// device-specific status JSON into a uniform ShellyComponent[]. These tests
// drive the real client -> fetchJson -> url path with a fetch mock that routes
// fixture payloads by request path, so no hardware is involved.

const originalFetch = globalThis.fetch;

/** Route fixture payloads by URL pathname; unknown paths 404. */
function mockRoutes(routes: Record<string, unknown>): void {
  const fetchMock = vi.fn(async (target: string | URL) => {
    const { pathname } = new URL(String(target));
    if (pathname in routes) {
      return new Response(JSON.stringify(routes[pathname]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const gen1Client = () => new Gen1Client('192.0.2.10', 1000);
const gen2Client = () => new Gen2Client('192.0.2.10', 1000);

describe('Gen1Client.discoverComponents', () => {
  it('normalizes a relay with its configured name and meter power', async () => {
    mockRoutes({ '/status': gen1.relay.status, '/settings': gen1.relay.settings });
    // meters[].total is watt-minutes (5678) and normalizes to watt-hours (95).
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'relay:0', type: 'switch', id: 0, name: 'Office Heater', state: { on: true, power: 12.34, energy: 95 } },
      { key: 'sensor:temperature', type: 'sensor', id: 0, sensorKind: 'temperature', state: { value: 45.2, unit: 'celsius' } },
    ]);
  });

  it('normalizes a dimmer light with brightness and meter power', async () => {
    mockRoutes({ '/status': gen1.light.status, '/settings': gen1.light.settings });
    // meters[].total is watt-minutes (4242) and normalizes to watt-hours (71).
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'light:0', type: 'light', id: 0, name: 'Hallway', state: { on: true, brightness: 75, power: 8.5, energy: 71 } },
      { key: 'sensor:temperature', type: 'sensor', id: 0, sensorKind: 'temperature', state: { value: 50.1, unit: 'celsius' } },
    ]);
  });

  it('exposes only the roller for a 2.5 in roller mode, not its underlying relays', async () => {
    mockRoutes({ '/status': gen1.roller.status, '/settings': gen1.roller.settings });
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'roller:0', type: 'cover', id: 0, name: 'Living Room Blind', state: { currentPosition: 50, moving: 'stopped', closed: false } },
    ]);
  });

  it('falls back to gain for RGBW2 brightness in color mode', async () => {
    mockRoutes({ '/status': gen1.rgbw2Color.status, '/settings': gen1.rgbw2Color.settings });
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'light:0', type: 'light', id: 0, name: 'Accent Strip', state: { on: true, brightness: 80, power: 1.2 } },
    ]);
  });

  it('normalizes RGBW2 white mode as four independent channels', async () => {
    mockRoutes({ '/status': gen1.rgbw2White.status, '/settings': gen1.rgbw2White.settings });
    const components = await gen1Client().discoverComponents();
    expect(components).toHaveLength(4);
    expect(components.map(c => c.key)).toEqual(['light:0', 'light:1', 'light:2', 'light:3']);
    expect(components.map(c => c.type)).toEqual(['light', 'light', 'light', 'light']);
    expect(components.map(c => c.name)).toEqual(['Ch 1', 'Ch 2', undefined, undefined]);
    expect(components.map(c => (c.state as { brightness?: number }).brightness)).toEqual([100, 50, 0, 25]);
  });

  it('normalizes EM/3EM emeters channels as standalone meter components', async () => {
    mockRoutes({ '/status': gen1.em.status, '/settings': gen1.em.settings });
    // emeters[].total / total_returned are already watt-hours (no conversion);
    // the third channel has no configured name and stays nameless.
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'relay:0', type: 'switch', id: 0, name: 'Mains', state: { on: false } },
      { key: 'emeter:0', type: 'meter', id: 0, name: 'Kitchen', state: { power: 140.37, voltage: 231.52, current: 1.22, powerFactor: 0.5, energy: 5800520, energyReturned: 240.4 } },
      { key: 'emeter:1', type: 'meter', id: 1, name: 'Water Heater', state: { power: 55.74, voltage: 231.46, current: 0.4, powerFactor: 0.61, energy: 4895670.5, energyReturned: 60.7 } },
      { key: 'emeter:2', type: 'meter', id: 2, state: { power: 78.46, voltage: 231.49, current: 0.49, powerFactor: 0.69, energy: 7858567.1, energyReturned: 34.9 } },
    ]);
  });

  it('reports a gas sensor as not-alarmed when idle', async () => {
    mockRoutes({ '/status': gen1.gasIdle.status, '/settings': gen1.gasIdle.settings });
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'sensor:gas', type: 'sensor', id: 4, name: 'Natural Gas', sensorKind: 'gas', state: { value: false, unit: '0 ppm' } },
    ]);
  });

  it('reports a gas sensor as alarmed with a concentration reading', async () => {
    mockRoutes({ '/status': gen1.gasAlarm.status, '/settings': gen1.gasAlarm.settings });
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'sensor:gas', type: 'sensor', id: 4, name: 'Natural Gas', sensorKind: 'gas', state: { value: true, unit: '180 ppm' } },
    ]);
  });

  it('normalizes a temperature + humidity sensor', async () => {
    mockRoutes({ '/status': gen1.tempHumidity.status, '/settings': gen1.tempHumidity.settings });
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'sensor:temperature', type: 'sensor', id: 0, sensorKind: 'temperature', state: { value: 22.5, unit: 'celsius' } },
      { key: 'sensor:humidity', type: 'sensor', id: 1, sensorKind: 'humidity', state: { value: 48.5, unit: 'percent' } },
    ]);
  });

  it('preserves the string state of a contact sensor', async () => {
    mockRoutes({ '/status': gen1.contact.status, '/settings': gen1.contact.settings });
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'sensor:contact', type: 'sensor', id: 2, sensorKind: 'contact', state: { value: 'open' } },
    ]);
  });

  it('normalizes a flood sensor alongside device temperature', async () => {
    mockRoutes({ '/status': gen1.flood.status, '/settings': gen1.flood.settings });
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'sensor:temperature', type: 'sensor', id: 0, sensorKind: 'temperature', state: { value: 20.1, unit: 'celsius' } },
      { key: 'sensor:flood', type: 'sensor', id: 3, sensorKind: 'flood', state: { value: false } },
    ]);
  });

  it('normalizes a physical input with its event count', async () => {
    mockRoutes({ '/status': gen1.input.status, '/settings': gen1.input.settings });
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'relay:0', type: 'switch', id: 0, state: { on: false } },
      { key: 'input:0', type: 'input', id: 0, state: { active: true, event: 'S', eventCount: 3 } },
    ]);
  });

  it('still discovers components when /settings is unavailable', async () => {
    // getConfig() failures are swallowed; components surface without names.
    mockRoutes({ '/status': gen1.relay.status });
    expect(await gen1Client().discoverComponents()).toEqual([
      { key: 'relay:0', type: 'switch', id: 0, state: { on: true, power: 12.34, energy: 95 } },
      { key: 'sensor:temperature', type: 'sensor', id: 0, sensorKind: 'temperature', state: { value: 45.2, unit: 'celsius' } },
    ]);
  });
});

describe('Gen2Client.discoverComponents', () => {
  const rpc = (method: string) => `/rpc/${method}`;
  const routes = (fixture: { status: unknown; config: unknown }) => ({
    [rpc('Shelly.GetStatus')]: fixture.status,
    [rpc('Shelly.GetConfig')]: fixture.config,
  });

  it('normalizes a switch with full power metering and skips non-component keys', async () => {
    mockRoutes(routes(gen2.switch1));
    // ble/cloud/sys/wifi have no `:` and must be skipped by discoverComponents.
    expect(await gen2Client().discoverComponents()).toEqual([
      { key: 'switch:0', type: 'switch', id: 0, name: 'Office Lamp', state: { on: true, power: 14.2, voltage: 231.5, current: 0.061, energy: 1234.5 } },
    ]);
  });

  it('normalizes a multi-channel switch device, leaving unnamed channels nameless', async () => {
    mockRoutes(routes(gen2.switch4));
    const components = await gen2Client().discoverComponents();
    expect(components.map(c => c.key)).toEqual(['switch:0', 'switch:1', 'switch:2', 'switch:3']);
    expect(components.map(c => c.name)).toEqual(['Rack', undefined, 'Pump', undefined]);
    expect(components.map(c => (c.state as { on: boolean }).on)).toEqual([true, false, true, false]);
    expect(components.map(c => (c.state as { power?: number }).power)).toEqual([10, 0, 55.5, 0]);
  });

  it('normalizes a switch that meters returned energy', async () => {
    mockRoutes(routes(gen2.switchWithReturn));
    expect(await gen2Client().discoverComponents()).toEqual([
      { key: 'switch:0', type: 'switch', id: 0, name: 'Solar Feed', state: { on: true, power: -230.4, voltage: 232.9, current: 1.02, energy: 1381873.769, energyReturned: 90455.12 } },
    ]);
  });

  it('normalizes a light component with brightness and energy', async () => {
    mockRoutes(routes(gen2.light));
    expect(await gen2Client().discoverComponents()).toEqual([
      { key: 'light:0', type: 'light', id: 0, name: 'Hallway', state: { on: true, brightness: 60, power: 5.0, energy: 12.3 } },
    ]);
  });

  it('normalizes a cover, mapping state to a moving direction', async () => {
    mockRoutes(routes(gen2.cover));
    expect(await gen2Client().discoverComponents()).toEqual([
      { key: 'cover:0', type: 'cover', id: 0, name: 'Living Room Blind', state: { currentPosition: 40, targetPosition: 80, moving: 'opening' } },
    ]);
  });

  it('handles an uncalibrated cover with null positions', async () => {
    mockRoutes(routes(gen2.coverUncalibrated));
    // null positions normalize to undefined (not 0), leaving position unknown.
    expect(await gen2Client().discoverComponents()).toEqual([
      { key: 'cover:0', type: 'cover', id: 0, state: { moving: 'stopped' } },
    ]);
  });

  it('normalizes inputs with boolean active state', async () => {
    mockRoutes(routes(gen2.input));
    expect(await gen2Client().discoverComponents()).toEqual([
      { key: 'input:0', type: 'input', id: 0, name: 'Doorbell', state: { active: false } },
      { key: 'input:1', type: 'input', id: 1, state: { active: true } },
    ]);
  });

  it('normalizes temperature and humidity components', async () => {
    mockRoutes(routes(gen2.tempHumidity));
    expect(await gen2Client().discoverComponents()).toEqual([
      { key: 'temperature:0', type: 'sensor', id: 0, name: 'Bedroom', sensorKind: 'temperature', state: { value: 21.7, unit: 'celsius' } },
      { key: 'humidity:0', type: 'sensor', id: 0, sensorKind: 'humidity', state: { value: 53.2, unit: 'percent' } },
    ]);
  });

  it('normalizes a mixed device, preserving component order', async () => {
    mockRoutes(routes(gen2.mixed));
    const components = await gen2Client().discoverComponents();
    expect(components.map(c => c.key)).toEqual(['switch:0', 'input:0', 'temperature:0']);
    expect(components.map(c => c.type)).toEqual(['switch', 'input', 'sensor']);
  });

  it('still discovers components when Shelly.GetConfig is unavailable', async () => {
    mockRoutes({ [rpc('Shelly.GetStatus')]: gen2.switch1.status });
    expect(await gen2Client().discoverComponents()).toEqual([
      { key: 'switch:0', type: 'switch', id: 0, state: { on: true, power: 14.2, voltage: 231.5, current: 0.061, energy: 1234.5 } },
    ]);
  });
});
