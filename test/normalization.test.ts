import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import { Gen2Client } from '../src/shelly/gen2-client.js';

describe('Gen2Client', () => {
  it('constructs', () => {
    expect(new Gen2Client('example.local', 1000)).toBeTruthy();
  });
});

describe('parseConfig', () => {
  it('falls back to defaults when poll/timeout are non-numeric', () => {
    const cfg = parseConfig({ platform: 'ShellyAllGen', name: 'X', pollInterval: 'abc', requestTimeout: 'xyz' } as never);
    expect(cfg.pollInterval).toBe(5);
    expect(cfg.requestTimeout).toBe(5);
  });

  it('defaults realtime and coiot to true and accepts opt-out', () => {
    const defaults = parseConfig({ platform: 'ShellyAllGen', name: 'X' } as never);
    expect(defaults.realtime).toBe(true);
    expect(defaults.coiot).toBe(true);
    const off = parseConfig({ platform: 'ShellyAllGen', name: 'X', realtime: false, coiot: false } as never);
    expect(off.realtime).toBe(false);
    expect(off.coiot).toBe(false);
  });

  it('clamps to minimum values', () => {
    const cfg = parseConfig({ platform: 'ShellyAllGen', name: 'X', pollInterval: 1, requestTimeout: 0 } as never);
    expect(cfg.pollInterval).toBe(5);
    expect(cfg.requestTimeout).toBe(1);
  });

  it('drops device entries missing a host', () => {
    const cfg = parseConfig({ platform: 'ShellyAllGen', name: 'X', devices: [{ host: 'a' }, { name: 'no-host' }, null] } as never);
    expect(cfg.devices).toEqual([{ host: 'a' }]);
  });

  it('defaults offlineAfterFailures to 3 and accepts 0 to disable', () => {
    expect(parseConfig({ platform: 'ShellyAllGen', name: 'X' } as never).offlineAfterFailures).toBe(3);
    expect(parseConfig({ platform: 'ShellyAllGen', name: 'X', offlineAfterFailures: 0 } as never).offlineAfterFailures).toBe(0);
    expect(parseConfig({ platform: 'ShellyAllGen', name: 'X', offlineAfterFailures: 'nope' } as never).offlineAfterFailures).toBe(3);
  });

  it('parses a per-device offlineAfterFailures override', () => {
    const cfg = parseConfig({ platform: 'ShellyAllGen', name: 'X', devices: [{ host: 'a', offlineAfterFailures: 0 }, { host: 'b' }] } as never);
    expect(cfg.devices[0].offlineAfterFailures).toBe(0);
    expect(cfg.devices[1]).not.toHaveProperty('offlineAfterFailures');
  });

  it('parses per-device include/exclude as string lists', () => {
    const cfg = parseConfig({ platform: 'ShellyAllGen', name: 'X', devices: [{ host: 'a', exclude: ['switch:0', 1] }, { host: 'b', include: 'nope' }] } as never);
    expect(cfg.devices[0].exclude).toEqual(['switch:0', '1']);
    expect(cfg.devices[1].include).toEqual([]);
  });

  it('defaults gasSensorType to leak and accepts smoke/co', () => {
    expect(parseConfig({ platform: 'ShellyAllGen', name: 'X' } as never).gasSensorType).toBe('leak');
    expect(parseConfig({ platform: 'ShellyAllGen', name: 'X', gasSensorType: 'co' } as never).gasSensorType).toBe('co');
    expect(parseConfig({ platform: 'ShellyAllGen', name: 'X', gasSensorType: 'smoke' } as never).gasSensorType).toBe('smoke');
    expect(parseConfig({ platform: 'ShellyAllGen', name: 'X', gasSensorType: 'methane' } as never).gasSensorType).toBe('leak');
  });

  it('defaults outletInUseWatts to 2 and rejects negative values', () => {
    expect(parseConfig({ platform: 'ShellyAllGen', name: 'X' } as never).outletInUseWatts).toBe(2);
    expect(parseConfig({ platform: 'ShellyAllGen', name: 'X', outletInUseWatts: 0.5 } as never).outletInUseWatts).toBe(0.5);
    expect(parseConfig({ platform: 'ShellyAllGen', name: 'X', outletInUseWatts: -1 } as never).outletInUseWatts).toBe(2);
  });

  it('parses per-device serviceType, dropping auto and unknown values', () => {
    const cfg = parseConfig({ platform: 'ShellyAllGen', name: 'X', devices: [{ host: 'a', serviceType: 'outlet' }, { host: 'b', serviceType: 'auto' }, { host: 'c', serviceType: 'fan' }] } as never);
    expect(cfg.devices.map(d => d.serviceType)).toEqual(['outlet', undefined, undefined]);
  });

  it('parses a per-device names map, dropping blank and non-string entries', () => {
    const cfg = parseConfig({ platform: 'ShellyAllGen', name: 'X', devices: [{ host: 'a', names: { 'emeter:0': ' Phase A ', 'emeter:1': '', 'emeter:2': 3 } }, { host: 'b', names: ['x'] }] } as never);
    expect(cfg.devices[0].names).toEqual({ 'emeter:0': 'Phase A' });
    expect(cfg.devices[1].names).toEqual({});
  });
});
