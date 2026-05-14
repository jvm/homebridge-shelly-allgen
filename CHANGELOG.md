# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
