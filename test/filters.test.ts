import { describe, expect, it } from 'vitest';
import { matchesDeviceFilters, matchesGlobalFilters } from '../src/filters.js';
import type { NormalizedShellyDevice, ShellyComponent } from '../src/shelly/types.js';

const em3: NormalizedShellyDevice = {
  id: 'shellyem3-AABBCCDDEEFF', mac: 'AABBCCDDEEFF', host: '192.0.2.20', generation: 1, model: 'SHEM-3',
  name: 'Mains', authEnabled: false, components: [],
};
const endpoint = { host: '192.0.2.20', name: 'Mains' };
// A Gen1 3EM reports its contactor relay as `relay:0` (type switch).
const sw0: ShellyComponent = { key: 'relay:0', type: 'switch', id: 0, name: 'Contactor', state: { on: false } };
const gen2Sw0: ShellyComponent = { key: 'switch:0', type: 'switch', id: 0, state: { on: false } };
const meter0: ShellyComponent = { key: 'emeter:0', type: 'meter', id: 0, name: 'Phase A', state: {} };
const meter1: ShellyComponent = { key: 'emeter:1', type: 'meter', id: 1, state: {} };

describe('matchesGlobalFilters', () => {
  const none = { include: [], exclude: [] };

  it('matches everything with no filters', () => {
    expect(matchesGlobalFilters(none, em3, endpoint)).toBe(true);
    expect(matchesGlobalFilters(none, em3, endpoint, sw0)).toBe(true);
  });

  it('includes only devices matching host, MAC, id, model, or name', () => {
    expect(matchesGlobalFilters({ include: ['192.0.2.20'], exclude: [] }, em3, endpoint)).toBe(true);
    expect(matchesGlobalFilters({ include: ['aabbcc'], exclude: [] }, em3, endpoint)).toBe(true);
    expect(matchesGlobalFilters({ include: ['shem-3'], exclude: [] }, em3, endpoint)).toBe(true);
    expect(matchesGlobalFilters({ include: ['mains'], exclude: [] }, em3, endpoint)).toBe(true);
    expect(matchesGlobalFilters({ include: ['192.0.2.99'], exclude: [] }, em3, endpoint)).toBe(false);
  });

  it('excludes case-insensitively', () => {
    expect(matchesGlobalFilters({ include: [], exclude: ['SHEM'] }, em3, endpoint)).toBe(false);
  });

  it('matches component key, name, and type alongside device fields', () => {
    const terms = { include: [], exclude: ['relay:0'] };
    expect(matchesGlobalFilters(terms, em3, endpoint, sw0)).toBe(false);
    expect(matchesGlobalFilters(terms, em3, endpoint, meter0)).toBe(true);
    expect(matchesGlobalFilters({ include: [], exclude: ['phase a'] }, em3, endpoint, meter0)).toBe(false);
    expect(matchesGlobalFilters({ include: [], exclude: ['meter'] }, em3, endpoint, meter1)).toBe(false);
  });

  it('lets exclude win over include', () => {
    expect(matchesGlobalFilters({ include: ['mains'], exclude: ['switch'] }, em3, endpoint, sw0)).toBe(false);
  });

  it('keeps device-level include matches for every component of that device', () => {
    expect(matchesGlobalFilters({ include: ['shem-3'], exclude: [] }, em3, endpoint, meter1)).toBe(true);
  });
});

describe('matchesDeviceFilters', () => {
  it('matches everything when no per-device filters are set', () => {
    expect(matchesDeviceFilters({}, sw0)).toBe(true);
    expect(matchesDeviceFilters({ include: [], exclude: [] }, sw0)).toBe(true);
  });

  it('hides a component by key', () => {
    expect(matchesDeviceFilters({ exclude: ['relay:0'] }, sw0)).toBe(false);
    expect(matchesDeviceFilters({ exclude: ['relay:0'] }, meter0)).toBe(true);
    expect(matchesDeviceFilters({ exclude: ['switch:0'] }, gen2Sw0)).toBe(false);
  });

  it('hides a Gen1 relay by its <type>:<id> alias (Shelly 3EM exclude switch:0)', () => {
    expect(matchesDeviceFilters({ exclude: ['switch:0'] }, sw0)).toBe(false);
    expect(matchesDeviceFilters({ exclude: ['switch:0'] }, meter0)).toBe(true);
    expect(matchesDeviceFilters({ include: ['meter:1'] }, meter1)).toBe(true);
  });

  it('matches component name and type', () => {
    expect(matchesDeviceFilters({ exclude: ['contactor'] }, sw0)).toBe(false);
    expect(matchesDeviceFilters({ include: ['meter'] }, sw0)).toBe(false);
    expect(matchesDeviceFilters({ include: ['meter'] }, meter1)).toBe(true);
  });

  it('ignores device fields such as host and model', () => {
    // The device's own fields never match: a per-device filter is already scoped to that device.
    expect(matchesDeviceFilters({ include: ['shem-3'] }, meter0)).toBe(false);
  });

  it('does not match across field boundaries', () => {
    // Joined, "emeter:0 Phase A meter" would contain "0 phase"; fields are matched one by one.
    expect(matchesDeviceFilters({ exclude: ['0 phase'] }, meter0)).toBe(true);
  });

  it('ignores blank terms instead of matching everything', () => {
    expect(matchesDeviceFilters({ exclude: ['', '  '] }, sw0)).toBe(true);
    expect(matchesDeviceFilters({ include: [''] }, sw0)).toBe(true);
  });

  it('lets exclude win over include', () => {
    expect(matchesDeviceFilters({ include: ['emeter'], exclude: ['emeter:1'] }, meter1)).toBe(false);
    expect(matchesDeviceFilters({ include: ['emeter'], exclude: ['emeter:1'] }, meter0)).toBe(true);
  });
});
