// Sanitized Gen2+ `Shelly.GetStatus` and `Shelly.GetConfig` payloads, trimmed
// to the fields `Gen2Client.discoverComponents()` reads. Non-component keys
// (ble, cloud, mqtt, sys, wifi, eth) are kept on a couple of fixtures to prove
// they are skipped by the `key.split(':')` guard.

/** Shelly Plus 1PM: a single switch with power metering. */
export const switch1 = {
  status: {
    ble: {},
    cloud: { connected: true },
    'switch:0': {
      id: 0,
      source: 'WS_in',
      output: true,
      apower: 14.2,
      voltage: 231.5,
      current: 0.061,
      aenergy: { total: 1234.5, minute_ts: 1700000000 },
      temperature: { tC: 44.1, tF: 111.4 },
    },
    sys: { mac: 'AABBCCDDEEFF' },
    wifi: { sta_ip: '192.0.2.10' },
  },
  config: {
    'switch:0': { id: 0, name: 'Office Lamp', in_mode: 'follow', initial_state: 'match_input' },
    sys: {},
    wifi: {},
  },
};

/** Shelly Pro 4PM: four switch channels, only some named. */
export const switch4 = {
  status: {
    'switch:0': { id: 0, output: true, apower: 10, voltage: 230, current: 0.04, aenergy: { total: 100 } },
    'switch:1': { id: 1, output: false, apower: 0, voltage: 230, current: 0, aenergy: { total: 0 } },
    'switch:2': { id: 2, output: true, apower: 55.5, voltage: 230, current: 0.24, aenergy: { total: 999 } },
    'switch:3': { id: 3, output: false, apower: 0, voltage: 230, current: 0, aenergy: { total: 12 } },
  },
  config: {
    'switch:0': { id: 0, name: 'Rack' },
    'switch:1': { id: 1, name: null },
    'switch:2': { id: 2, name: 'Pump' },
    'switch:3': { id: 3, name: null },
  },
};

/** Shelly Plus Wall Dimmer: a single light component. */
export const light = {
  status: {
    'light:0': {
      id: 0,
      source: 'WS_in',
      output: true,
      brightness: 60,
      apower: 5.0,
      aenergy: { total: 12.3 },
      temperature: { tC: 38.0 },
    },
  },
  config: {
    'light:0': { id: 0, name: 'Hallway' },
  },
};

/** Shelly Plus 2PM in cover profile: a single cover, mid-travel. */
export const cover = {
  status: {
    'cover:0': {
      id: 0,
      source: 'WS_in',
      state: 'opening',
      apower: 87.0,
      current_pos: 40,
      target_pos: 80,
      pos_control: true,
    },
  },
  config: {
    'cover:0': { id: 0, name: 'Living Room Blind' },
  },
};

/** Cover that is stopped at an unknown position (uncalibrated device). */
export const coverUncalibrated = {
  status: {
    'cover:0': {
      id: 0,
      state: 'stopped',
      apower: 0,
      current_pos: null,
      target_pos: null,
      pos_control: false,
    },
  },
  config: {
    'cover:0': { id: 0, name: null },
  },
};

/** Shelly Plus i4: two of four inputs wired, reporting boolean state. */
export const input = {
  status: {
    'input:0': { id: 0, state: false },
    'input:1': { id: 1, state: true },
  },
  config: {
    'input:0': { id: 0, name: 'Doorbell', type: 'switch', enable: true },
    'input:1': { id: 1, name: null, type: 'switch', enable: true },
  },
};

/** Shelly Plus H&T: temperature and humidity components. */
export const tempHumidity = {
  status: {
    'temperature:0': { id: 0, tC: 21.7, tF: 71.1 },
    'humidity:0': { id: 0, rh: 53.2 },
    devicepower: { battery: { V: 5.9, percent: 100 } },
  },
  config: {
    'temperature:0': { id: 0, name: 'Bedroom' },
    'humidity:0': { id: 0, name: null },
  },
};

/** Mixed device: switch + input + temperature, plus non-component keys. */
export const mixed = {
  status: {
    ble: {},
    'switch:0': { id: 0, output: false, apower: 0, aenergy: { total: 0 } },
    'input:0': { id: 0, state: true },
    'temperature:0': { id: 0, tC: 30.5 },
    sys: {},
  },
  config: {
    'switch:0': { id: 0, name: 'Boiler' },
    'input:0': { id: 0, name: 'Flow Switch' },
    'temperature:0': { id: 0, name: 'Boiler Temp' },
  },
};
