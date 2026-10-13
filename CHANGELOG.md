# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Existing plug accessories and Gen1 relays with `appliance_type` `outlet` or `lights` change from a Switch service to an Outlet or Lightbulb service on upgrade. HomeKit treats this as a new service: scenes and automations that used the old Switch must be set up again. Set `"serviceType": "switch"` on the device to keep the old mapping.

### Added
- Offline reporting. After `offlineAfterFailures` consecutive failed polls (default 3), reads fail with `SERVICE_COMMUNICATION_FAILURE` so Apple Home shows "No Response", and sensor services set `StatusFault`. The next successful poll or realtime update clears it. One info line is logged when a device goes offline and one when it recovers. `0` disables it; `devices[].offlineAfterFailures` overrides it per device (use `0` for sleeping battery sensors).
- Per-device `include` / `exclude` filters on `devices[]` entries. They match only that device's components: key (`relay:0`, `emeter:1`), the generation-neutral `<type>:<id>` alias (`switch:0` also selects a Gen1 `relay:0`), name, and type. Blank terms are ignored. Platform-wide `include` / `exclude` are unchanged. Example: a Shelly 3EM with `"exclude": ["switch:0"]` hides its contactor relay.
- Unit tests for platform-wide and per-device include/exclude filter logic.
- `gasSensorType` (`leak` | `smoke` | `co`, default `leak`) selects the HomeKit service for Shelly Gas sensors: LeakSensor, SmokeSensor, or CarbonMonoxideSensor.
- Sensor services now push value and `StatusFault` changes found by polling or realtime updates, so HomeKit notifications (e.g. a gas alarm) no longer wait for the controller to read the value.
- Relays/switches on plugs map to `Service.Outlet`: Gen1 relays with `appliance_type` `outlet`, Gen1 plug models (`SHPLG-*`), and the Gen2 Plus Plug family (`SNPL-*`). `OutletInUse` is true when power exceeds `outletInUseWatts` (default 2 W), or follows the On state when the outlet reports no power. Eve power/energy characteristics stay on the Outlet service.
- Gen1 relays with `appliance_type` `lights` map to an on/off `Service.Lightbulb`.
- Per-device `serviceType` (`auto` | `switch` | `outlet` | `light`) overrides the relay/switch service auto-detection.

### Fixed
- Cached accessories no longer keep dead services. After an accessory is configured, every cached service (except AccessoryInformation) that no current component claims is removed — for example after an `exclude` filter hides a component, a device changes model or mode, or a component's service type changes.
- Shelly Gas no longer raises a false gas alarm during warm-up or on a sensor fault. Detection is derived from `alarm_state` alone (`mild` / `heavy`); a `sensor_state` other than `normal` (warmup, fault, unknown) or a failed `self_test_state` is reported as `StatusFault` instead.

## [0.2.0] — 2026-05-14

### Added
- Energy metering surfaced through Eve custom HomeKit characteristics (`Consumption`, `TotalConsumption`, `Voltage`, `ElectricCurrent`). Metered Gen1 relays/lights and Gen2+ switches/lights expose whichever of these their hardware reports on their existing Switch/Lightbulb service.
- Gen1 Shelly EM/3EM `emeters[]` channels are now discovered as standalone `meter` components, each mapped to an Eve Consumption service with power, voltage, current, power factor, and consumed/returned energy. Validated on a SHEM-3 (3 channels).
- Gen2+ `ret_aenergy.total` (energy returned to the grid) is parsed into `energyReturned` on switch/light components.
- New `homebridge-lib` dependency, used only for its Eve custom HomeKit type definitions.

### Fixed
- Gen1 `status.meters[].total` is reported in watt-minutes; it is now converted to watt-hours so the normalized `energy` field is consistent with Gen1 `emeters` and Gen2+ `aenergy` (both already watt-hours). Previously Gen1 relay/light energy was 60× too high. Verified on a Shelly Plug S.

## [0.1.1] — 2026-05-14

### Fixed
- Gen1 relays and lights now report power/energy from `status.meters[]` instead of the relay/light objects, which never carried those fields. Verified on Shelly 1PM and Plug S hardware, which previously surfaced no power at all.
- Gen1 Shelly 2.5 in roller mode is guaranteed not to expose its underlying relays as standalone HomeKit switches, even on firmware that lists them in `/status` (fw v1.14.0 already reports `relays: []` in roller mode).
- `num()` no longer coerces `null` / empty-string values to `0`, so an uncalibrated Gen2+ cover reporting `pos: null` is left position-unknown rather than appearing fully closed.

### Added
- Unit test fixtures and `discoverComponents()` normalization tests for representative Gen1 and Gen2+ status payloads.

## [0.1.0] — 2026-05-14

### Added
- Initial public release as a Homebridge v2 dynamic platform plugin.
- Gen1 HTTP client: relays, lights, rollers, inputs, temperature/humidity/contact/flood/gas sensors.
- Gen2+ JSON-RPC client over HTTP/HTTPS: switches, lights, covers, inputs, temperature and humidity components.
- Challenge-response authentication: Digest over HTTP or HTTPS, Basic over HTTPS only (Basic over cleartext HTTP is refused).
- mDNS device discovery with MAC-based deduplication and manual-config-wins merge semantics.
- Gen1 CoIoT (CoAP UDP/5683) push listener with multicast and unicast support.
- Gen2+ WebSocket realtime subscription with exponential-backoff reconnect; polling continues as a safety net.
- `splitChannels` mode that registers one HomeKit accessory per component.
- `include` / `exclude` substring filters against host, MAC, device id/name, and component key.
- Optional stale-accessory removal on startup.
- `shelly-allgen-probe` CLI for read-only discovery and inspection of devices on the LAN.
- Apache-2.0 license.
