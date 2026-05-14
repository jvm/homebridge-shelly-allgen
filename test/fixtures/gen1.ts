// Sanitized Gen1 `/status` and `/settings` payloads, trimmed to the fields
// `Gen1Client.discoverComponents()` actually reads. Shapes mirror real Shelly
// Gen1 REST responses; housekeeping fields (wifi_sta, update, ram_*, ...) are omitted.

/** Shelly 1PM: one relay plus a device temperature sensor. */
export const relay = {
  status: {
    relays: [{ ison: true, has_timer: false, overpower: false, source: 'http' }],
    meters: [{ power: 12.34, is_valid: true, total: 5678 }],
    tmp: { tC: 45.2, tF: 113.4, is_valid: true },
    temperature: 45.2,
  },
  settings: {
    relays: [{ name: 'Office Heater', appliance_type: 'general' }],
  },
};

/**
 * Shelly Dimmer 2: one light component reporting brightness in white mode.
 * Power/energy live in `meters[]`, indexed to match the `lights[]` array.
 */
export const light = {
  status: {
    lights: [{ ison: true, mode: 'white', brightness: 75, source: 'http' }],
    meters: [{ power: 8.5, is_valid: true, total: 4242 }],
    tmp: { tC: 50.1, is_valid: true },
  },
  settings: {
    lights: [{ name: 'Hallway' }],
  },
};

/**
 * Shelly 2.5 in roller mode. On fw v1.14.0 hardware `/status` reports
 * `relays: []` in roller mode, so the `relays` entries below are a synthetic
 * defensive case: they prove `settings.mode === 'roller'` suppresses any
 * relays a firmware might still report, leaving only the roller exposed.
 */
export const roller = {
  status: {
    relays: [
      { ison: false, source: 'input' },
      { ison: false, source: 'input' },
    ],
    rollers: [{
      state: 'stop',
      power: 0,
      is_valid: true,
      current_pos: 50,
      last_direction: 'open',
      calibrating: false,
      positioning: true,
    }],
    meters: [{ power: 0, is_valid: true }, { power: 0, is_valid: true }],
  },
  settings: {
    mode: 'roller',
    rollers: [{ name: 'Living Room Blind' }],
  },
};

/** Shelly RGBW2 in color mode: brightness falls back to `gain` when absent. */
export const rgbw2Color = {
  status: {
    lights: [{ ison: true, mode: 'color', red: 255, green: 0, blue: 0, white: 0, gain: 80, effect: 0 }],
    meters: [{ power: 1.2, is_valid: true }],
  },
  settings: {
    lights: [{ name: 'Accent Strip' }],
  },
};

/** Shelly RGBW2 in white mode: four independent white channels. */
export const rgbw2White = {
  status: {
    lights: [
      { ison: true, mode: 'white', brightness: 100 },
      { ison: false, mode: 'white', brightness: 50 },
      { ison: false, mode: 'white', brightness: 0 },
      { ison: true, mode: 'white', brightness: 25 },
    ],
    meters: [
      { power: 2.1, is_valid: true },
      { power: 0, is_valid: true },
      { power: 0, is_valid: true },
      { power: 0.5, is_valid: true },
    ],
  },
  settings: {
    lights: [{ name: 'Ch 1' }, { name: 'Ch 2' }, {}, {}],
  },
};

/**
 * Shelly EM: a relay plus two `emeters` channels.
 * `discoverComponents()` does not yet parse `emeters` (see TODO.md, Energy
 * metering) — this fixture exists so a regression test pins the current
 * behaviour and flags the gap when EM support lands.
 */
export const em = {
  status: {
    relays: [{ ison: false, source: 'input' }],
    emeters: [
      { power: 120.5, pf: 0.9, current: 0.52, voltage: 230.1, is_valid: true, total: 1000, total_returned: 5 },
      { power: 0, pf: 0, current: 0, voltage: 230.0, is_valid: true, total: 0, total_returned: 0 },
    ],
  },
  settings: {
    relays: [{ name: 'Mains' }],
  },
};

/** Shelly Gas: normal state, no alarm. */
export const gasIdle = {
  status: {
    gas_sensor: { sensor_state: 'normal', self_test_state: 'completed', alarm_state: 'none' },
    concentration: { ppm: 0, is_valid: true },
  },
  settings: {},
};

/** Shelly Gas: active alarm with a concentration reading. */
export const gasAlarm = {
  status: {
    gas_sensor: { sensor_state: 'normal', self_test_state: 'completed', alarm_state: 'mild' },
    concentration: { ppm: 180, is_valid: true },
  },
  settings: {},
};

/** Shelly H&T: temperature and humidity sensors. */
export const tempHumidity = {
  status: {
    tmp: { tC: 22.5, tF: 72.5, is_valid: true },
    hum: { value: 48.5, is_valid: true },
    bat: { value: 95, voltage: 4.1 },
  },
  settings: {},
};

/** Shelly Door/Window 2: contact sensor reporting a string state. */
export const contact = {
  status: {
    sensor: { state: 'open', is_valid: true },
    lux: { value: 120, illumination: 'twilight', is_valid: true },
    bat: { value: 88, voltage: 5.9 },
  },
  settings: {},
};

/** Shelly Flood: leak sensor plus a device temperature reading. */
export const flood = {
  status: {
    flood: false,
    tmp: { tC: 20.1, tF: 68.2, is_valid: true },
    bat: { value: 72, voltage: 2.9 },
  },
  settings: {},
};

/** Shelly 1 with a physical input but no name configured. */
export const input = {
  status: {
    relays: [{ ison: false, source: 'input' }],
    inputs: [{ input: 1, event: 'S', event_cnt: 3 }],
  },
  settings: {
    relays: [{}],
    inputs: [{}],
  },
};
