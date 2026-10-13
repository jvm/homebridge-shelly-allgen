# Homebridge Shelly AllGen

Homebridge dynamic platform plugin for local Shelly Gen1 and Gen2+ devices.

It supports discovery and manual configuration of switches, lights, covers, and common sensors over the local LAN, with polling and optional realtime push updates.

## Install

```sh
npm install -g homebridge-shelly-allgen
```

Then add a `ShellyAllGen` platform block to your Homebridge config (see below) or configure it through the Homebridge UI.

## Development

```sh
npm install
npm run build
npm test
npm run lint
npm run probe -- --host 192.0.2.10
```

## Homebridge config

Minimal config — mDNS discovery on, polling every 5 seconds, realtime push enabled:

```json
{
  "platform": "ShellyAllGen",
  "name": "Homebridge Shelly AllGen",
  "discovery": true,
  "devices": [
    { "host": "192.0.2.10", "generation": "auto" }
  ],
  "pollInterval": 5
}
```

Expanded config — mixed Gen1 and Gen2 devices, authenticated Gen2 over HTTPS, per-channel accessories for a 2-relay switch, an exclude filter for an unwanted input, a 3EM with its contactor relay hidden, and a battery sensor that never reports "No Response":

```json
{
  "platform": "ShellyAllGen",
  "name": "Homebridge Shelly AllGen",
  "discovery": true,
  "devices": [
    { "host": "gen1-relay.example.local", "generation": "gen1", "name": "Relay" },
    { "host": "gen1-cover.example.local", "generation": "gen1", "name": "Cover" },
    {
      "host": "gen2-plug.example.local",
      "generation": "gen2",
      "protocol": "https",
      "username": "admin",
      "password": "REPLACE_ME",
      "name": "Plug"
    },
    { "host": "gen1-3em.example.local", "name": "Mains", "exclude": ["switch:0"], "names": { "emeter:0": "Phase A", "emeter:1": "Phase B", "emeter:2": "Phase C" } },
    { "host": "gen1-1pm.example.local", "serviceType": "outlet" },
    { "host": "gen1-ht.example.local", "offlineAfterFailures": 0 }
  ],
  "pollInterval": 10,
  "realtime": true,
  "coiot": true,
  "splitChannels": true,
  "exclude": ["input:0"],
  "gasSensorType": "co"
}
```

## Options

Platform options:

| Key | Default | Description |
|---|---|---|
| `name` | `Homebridge Shelly AllGen` | Platform display name. |
| `discovery` | `true` | Discover devices over mDNS. |
| `devices` | `[]` | Manual device entries (see below). |
| `pollInterval` | `5` | Polling interval in seconds (minimum 5). |
| `requestTimeout` | `5` | Per-request HTTP timeout in seconds. |
| `offlineAfterFailures` | `3` | Consecutive failed polls before a device shows "No Response". `0` disables. |
| `realtime` | `true` | Gen2+ WebSocket push updates. |
| `coiot` | `true` | Gen1 CoIoT push updates. |
| `include` / `exclude` | `[]` | Substrings matched against host, MAC, device id/model/name, and component key/name/type. |
| `outletInUseWatts` | `2` | An Outlet reports Outlet In Use above this many watts. |
| `gasSensorType` | `leak` | Shelly Gas service: `leak` (LeakSensor), `smoke` (SmokeSensor), or `co` (CarbonMonoxideSensor). |
| `splitChannels` | `false` | One HomeKit accessory per component. |
| `removeStaleAccessories` | `false` | Unregister cached accessories that do not reappear. |
| `debug` | `false` | Verbose logging. |

Per-device options (`devices[]` entries):

| Key | Default | Description |
|---|---|---|
| `host` | — | Hostname or IP, optionally with a port. Required. |
| `name` | device name | Accessory display name. |
| `username` / `password` | — | Credentials for devices with authentication enabled. |
| `protocol` | `http` | `http` or `https`. |
| `generation` | `auto` | `auto`, `gen1`, or `gen2`. |
| `include` / `exclude` | — | Substrings matched against this device's components only: key (`relay:0`, `emeter:1`), `<type>:<id>` alias (`switch:0` also matches a Gen1 `relay:0`), name, and type. |
| `names` | — | Service display names by component key or `<type>:<id>` alias, e.g. `{ "emeter:0": "Phase A" }`. Overrides generated names and channel names set on the Shelly. |
| `serviceType` | `auto` | Service for this device's relays/switches: `auto`, `switch`, `outlet`, or `light`. |
| `offlineAfterFailures` | platform value | Per-device override. Use `0` for sleeping battery sensors. |

## Supported devices

The plugin reads the standard Shelly HTTP/JSON-RPC component model, so any Gen1 device exposing `/status` or any Gen2+ device exposing `Shelly.GetStatus` is recognized. The following components map to HomeKit services:

| Generation | Component | HomeKit service |
|---|---|---|
| Gen1 | `relays[]` | Switch, Outlet, or Lightbulb (see below) |
| Gen1 | `lights[]` (brightness / gain) | Lightbulb |
| Gen1 | `rollers[]` | WindowCovering |
| Gen1 | `emeters[]` (EM / 3EM channels) | Eve Consumption |
| Gen1 | `tmp.tC`, `hum.value`, `sensor.state`, `flood` | TemperatureSensor / HumiditySensor / ContactSensor / LeakSensor |
| Gen1 | `gas_sensor` (Shelly Gas) | LeakSensor, SmokeSensor, or CarbonMonoxideSensor (`gasSensorType`) |
| Gen2+ | `switch:N` | Switch or Outlet (see below) |
| Gen2+ | `light:N` (on/brightness) | Lightbulb |
| Gen2+ | `cover:N` | WindowCovering |
| Gen2+ | `temperature:N`, `humidity:N` | TemperatureSensor / HumiditySensor |

Metered `relays[]` / `lights[]` / `switch:N` components additionally carry Eve power/energy characteristics on their Switch/Outlet/Lightbulb service (see Feature notes).

### Relay service mapping

Relays and switches pick their HomeKit service in this order:

1. The device's `serviceType` option, when it is not `auto`.
2. Gen1 relay `appliance_type` from `/settings`: `outlet` → Outlet, `lights` → Lightbulb (on/off only).
3. Plug models → Outlet: Gen1 `SHPLG-*` (Plug, Plug S, Plug US, Plug 2) and the Gen2 Plus Plug family `SNPL-*`.
4. Otherwise → Switch.

An Outlet sets Outlet In Use when its power reading is above `outletInUseWatts` (default 2 W). An outlet without a power reading uses its On state.

When an existing accessory changes service type (for example on upgrade to 0.3.0, or after a `serviceType` change), the old service is removed. Scenes and automations that used it must be set up again. Set `"serviceType": "switch"` to keep a plug as a Switch.

Validated device classes include representative Gen1 relay, plug, metering, gas sensor, roller, and light devices, plus Gen2+ plug/switch devices.

## Feature notes

- Basic HTTP authentication is refused over cleartext HTTP; configure `protocol: "https"` or rely on Digest (the Gen2+ default).
- Gen2+ WSS realtime accepts self-signed certificates (`rejectUnauthorized: false`) because Shelly ships self-signed certs by default. Certificate pinning is not configurable.
- Gen1 battery-powered sensors are polled at the configured interval. They sleep between reports, so set `offlineAfterFailures: 0` on their `devices[]` entry to stop them showing "No Response".
- **Offline behaviour.** After `offlineAfterFailures` consecutive failed polls (default 3), the device's characteristics fail with a communication error, so Apple Home shows "No Response" instead of stale state. Sensor services also set Status Fault. The next successful poll or realtime update clears it. The log has one info line when a device goes offline and one when it recovers.
- **Shelly Gas.** Gas is detected only when `alarm_state` is `mild` or `heavy`. Warm-up, a sensor fault, or a failed self-test sets Status Fault and does not raise an alarm.
- **Service names.** Each service is named by, in order: the device's `names` entry for that component, the channel name set on the Shelly, then a generated name. The generated name is the device name alone when the device has one component of that kind (e.g. `TV Plug 1`), and `<device> <kind> <n>` when it has two or more (e.g. `Hall Switch 2`, `Mains Meter 3`). The plugin sets both `Name` and `ConfiguredName`, which Apple Home shows. A name you set in the Home app is kept: the plugin only updates `ConfiguredName` when it is empty or still holds the name the plugin wrote last.
- **Stale services.** Services in the Homebridge cache that no longer match a component (after a filter change, a mode or model change, or a service type change) are removed when the accessory loads.
- **Energy metering.** HomeKit has no native power/energy characteristics, so the plugin uses the Eve custom characteristics (`Consumption`, `TotalConsumption`, `Voltage`, `ElectricCurrent`) read by the Eve app and other Eve-aware controllers. Metered relays/lights/switches expose whichever of those four their hardware reports directly on their existing Switch/Lightbulb service; Shelly EM/3EM `emeters` channels become standalone Eve Consumption services. Energy is normalized to watt-hours internally (Gen1 `meters` report watt-minutes and are converted) and shown as kWh in the Eve app.
- Advanced color modes, dimmer transitions, Plus/Pro multi-profile devices, and stateless input mappings are tracked as enhancement areas.
- `removeStaleAccessories: true` will unregister cached accessories that don't reappear during discovery — combine carefully with `discovery: true` on flaky networks.

## Troubleshooting

- **No devices discovered.** Confirm Homebridge and the Shelly devices share the same L2 segment (mDNS does not cross subnets without a reflector). Add manual `devices[]` entries as a fallback.
- **401 loops in the log.** The device requires authentication but the configured scheme doesn't match. Gen2+ defaults to Digest — leave `protocol: "http"` unless the device is forcing Basic, in which case set `protocol: "https"` so credentials aren't sent in cleartext.
- **WS keeps reconnecting on `protocol: "https"`.** The TLS handshake is succeeding (self-signed certs are accepted) but the device may be rejecting the upgrade. Enable `debug: true` and look for WS error messages.
- **Gen1 CoIoT silent.** Multicast UDP on port 5683 must reach the Homebridge host. On a router that blocks multicast across VLANs, configure the Shelly devices to unicast CoIoT directly to the Homebridge host's IP.
- **Device shows "No Response".** The plugin could not poll it `offlineAfterFailures` times in a row. Check the log for the "is not responding" line and enable `debug: true` to see each failed poll.
- **Empty accessories in HomeKit.** Typically a Shelly with only `input` components in `splitChannels` mode; input components are skipped.

## Child bridge

For setups with more than a handful of Shelly devices, run the plugin as a Homebridge **child bridge**. This isolates its event loop and realtime sockets from the main Homebridge process, so a flaky device cannot stall other plugins. In the Homebridge UI, open the plugin's settings, click *Bridge Settings* in the kebab menu, and enable *Run as a child bridge*; restart Homebridge to take effect.

## Security notes

- Device `host` values must be plain hostnames/IPs, optionally with a port; full URLs and userinfo are rejected.
- Authentication is challenge-response: the plugin only sends credentials after a `401` reply from the device, then negotiates the requested scheme.
  - **Digest** (Shelly Gen2+ default) is supported over both HTTP and HTTPS.
  - **Basic** is only sent over HTTPS; the plugin refuses to transmit Basic credentials over cleartext HTTP.
- Gen2 realtime is enabled by default and connects to `ws://<host>/rpc`, or `wss://<host>/rpc` when the device is configured with `protocol: "https"`. The WSS path accepts self-signed certificates (`rejectUnauthorized: false`) because most Shelly devices ship with self-signed certs. Polling continues alongside realtime as a safety net, and the connection retries with exponential backoff if it drops.

## License

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
