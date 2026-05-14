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
});
