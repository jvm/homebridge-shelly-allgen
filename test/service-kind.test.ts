import { describe, expect, it } from 'vitest';
import { isPlugModel, switchServiceType } from '../src/accessories/service-kind.js';
import type { ShellyComponent } from '../src/shelly/types.js';

type SwitchComponent = Extract<ShellyComponent, { type: 'switch' }>;
const relay = (applianceType?: string): SwitchComponent => ({ key: 'relay:0', type: 'switch', id: 0, applianceType, state: { on: false } });

describe('isPlugModel', () => {
  it.each(['SHPLG-S', 'SHPLG-1', 'SHPLG-U1', 'SHPLG2-1', 'SNPL-00112EU', 'SNPL-00116US', 'shplg-s'])('treats %s as a plug', model => {
    expect(isPlugModel(model)).toBe(true);
  });

  it.each(['SHSW-1', 'SHSW-PM', 'SHSW-25', 'SHEM-3', 'SNSW-001P16EU', 'Shelly Gen1'])('does not treat %s as a plug', model => {
    expect(isPlugModel(model)).toBe(false);
  });
});

describe('switchServiceType', () => {
  it('defaults a relay to Switch', () => {
    expect(switchServiceType(relay(), 'SHSW-1')).toBe('switch');
    expect(switchServiceType(relay('general'), 'SHSW-1')).toBe('switch');
  });

  it('maps Gen1 appliance_type outlet to Outlet and lights to Lightbulb, case-insensitively', () => {
    expect(switchServiceType(relay('outlet'), 'SHSW-PM')).toBe('outlet');
    expect(switchServiceType(relay('Outlet'), 'SHSW-PM')).toBe('outlet');
    expect(switchServiceType(relay('lights'), 'SHSW-1')).toBe('light');
    expect(switchServiceType(relay('Lights'), 'SHSW-1')).toBe('light');
  });

  it('maps plug models to Outlet', () => {
    expect(switchServiceType(relay('general'), 'SHPLG-S')).toBe('outlet');
    expect(switchServiceType({ key: 'switch:0', type: 'switch', id: 0, state: { on: false } }, 'SNPL-00112EU')).toBe('outlet');
  });

  it('lets appliance_type lights on a plug win over the plug model', () => {
    expect(switchServiceType(relay('lights'), 'SHPLG-S')).toBe('light');
  });

  it('lets a serviceType override win over everything', () => {
    expect(switchServiceType(relay('outlet'), 'SHPLG-S', 'switch')).toBe('switch');
    expect(switchServiceType(relay(), 'SHSW-1', 'outlet')).toBe('outlet');
    expect(switchServiceType(relay('outlet'), 'SHSW-PM', 'light')).toBe('light');
  });
});
