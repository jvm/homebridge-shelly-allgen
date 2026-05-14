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

Expanded config — mixed Gen1 and Gen2 devices, authenticated Gen2 over HTTPS, per-channel accessories for a 2-relay switch, and an exclude filter for an unwanted input:

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
    }
  ],
  "pollInterval": 10,
  "realtime": true,
  "coiot": true,
  "splitChannels": true,
  "exclude": ["input:0"]
}
```

## Supported devices

The plugin reads the standard Shelly HTTP/JSON-RPC component model, so any Gen1 device exposing `/status` or any Gen2+ device exposing `Shelly.GetStatus` is recognized. The following components map to HomeKit services:

| Generation | Component | HomeKit service |
|---|---|---|
| Gen1 | `relays[]` | Switch |
| Gen1 | `lights[]` (brightness / gain) | Lightbulb |
| Gen1 | `rollers[]` | WindowCovering |
| Gen1 | `emeters[]` (EM / 3EM channels) | Eve Consumption |
| Gen1 | `tmp.tC`, `hum.value`, `sensor.state`, `flood`, `gas_sensor` | TemperatureSensor / HumiditySensor / ContactSensor / LeakSensor |
| Gen2+ | `switch:N` | Switch |
| Gen2+ | `light:N` (on/brightness) | Lightbulb |
| Gen2+ | `cover:N` | WindowCovering |
| Gen2+ | `temperature:N`, `humidity:N` | TemperatureSensor / HumiditySensor |

Metered `relays[]` / `lights[]` / `switch:N` components additionally carry Eve power/energy characteristics on their Switch/Lightbulb service (see Feature notes).

Validated device classes include representative Gen1 relay, plug, metering, gas sensor, roller, and light devices, plus Gen2+ plug/switch devices.

## Feature notes

- Basic HTTP authentication is refused over cleartext HTTP; configure `protocol: "https"` or rely on Digest (the Gen2+ default).
- Gen2+ WSS realtime accepts self-signed certificates (`rejectUnauthorized: false`) because Shelly ships self-signed certs by default. Certificate pinning is not configurable.
- Gen1 battery-powered sensors are polled at the configured interval.
- **Energy metering.** HomeKit has no native power/energy characteristics, so the plugin uses the Eve custom characteristics (`Consumption`, `TotalConsumption`, `Voltage`, `ElectricCurrent`) read by the Eve app and other Eve-aware controllers. Metered relays/lights/switches expose whichever of those four their hardware reports directly on their existing Switch/Lightbulb service; Shelly EM/3EM `emeters` channels become standalone Eve Consumption services. Energy is normalized to watt-hours internally (Gen1 `meters` report watt-minutes and are converted) and shown as kWh in the Eve app.
- Advanced color modes, dimmer transitions, Plus/Pro multi-profile devices, and stateless input mappings are tracked as enhancement areas.
- `removeStaleAccessories: true` will unregister cached accessories that don't reappear during discovery — combine carefully with `discovery: true` on flaky networks.

## Troubleshooting

- **No devices discovered.** Confirm Homebridge and the Shelly devices share the same L2 segment (mDNS does not cross subnets without a reflector). Add manual `devices[]` entries as a fallback.
- **401 loops in the log.** The device requires authentication but the configured scheme doesn't match. Gen2+ defaults to Digest — leave `protocol: "http"` unless the device is forcing Basic, in which case set `protocol: "https"` so credentials aren't sent in cleartext.
- **WS keeps reconnecting on `protocol: "https"`.** The TLS handshake is succeeding (self-signed certs are accepted) but the device may be rejecting the upgrade. Enable `debug: true` and look for WS error messages.
- **Gen1 CoIoT silent.** Multicast UDP on port 5683 must reach the Homebridge host. On a router that blocks multicast across VLANs, configure the Shelly devices to unicast CoIoT directly to the Homebridge host's IP.
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
