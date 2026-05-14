# TODO

## Authentication

- [ ] Validate Gen2+ authenticated devices over HTTPS on real hardware.
- [ ] Test `protocol: "https"` config end-to-end with a TLS-capable Shelly device.
- [ ] Decide on Gen1 auth strategy: either ship a documented `protocol: https` + reverse-proxy recipe, or refuse to start with a clear error when `username/password` is set on a Gen1 device over HTTP (currently the rejection happens late, at first request).

## Realtime

- [ ] Test WSS realtime on a Shelly device that supports TLS.
- [ ] After N failed WS reconnect attempts, stop retrying and emit an `info` log so users notice persistent TLS rejection instead of seeing only debug noise.
- [ ] Add a config option for custom CA certificates / fingerprint pinning for self-signed Shelly TLS (alternative to `rejectUnauthorized: false`).
- [ ] Apply exponential backoff to the HTTP polling failure path as well; failed polls retry at the full `pollInterval` with no escalation. (WS reconnect backoff already exists at `src/accessories/device-accessory.ts:220-229`.)

## Energy metering

- [ ] Add optional Eve-style custom energy characteristics via `homebridge-lib`.
- [ ] Use `Service.Outlet` (with `OutletInUse`) instead of `Service.Switch` for relay components that represent plugs; pick the service type from the Shelly model class.
- [ ] Parse and expose Gen1 EM/3EM multi-channel meter data.
- [ ] Parse and expose Gen2 `aenergy`, `ret_aenergy` per-component energy counters.
- [ ] Decide on a HomeKit energy service strategy and document it.

## Device-specific polish

- [ ] Test and validate Shelly RGBW2 color mode (RGB + white) mappings.
- [ ] Test and validate Shelly Bulb RGBW color mappings.
- [ ] Test and validate Shelly Duo RGBW color temperature.
- [ ] Test Shelly Dimmer 1/2 brightness and transition parameters.
- [ ] Test Shelly 2.5 roller position commands on a calibrated device; only send `go=stop` when the roller is actually moving (Gen1 returns an error otherwise — `src/shelly/gen1-client.ts:79-82`).
- [ ] Log the active profile for Gen2 multi-profile devices (e.g. Plus2PM switch vs cover) so users can diagnose missing components.
- [ ] Add Gen1 RGBW `/color/{id}` and `/white/{id}` endpoint handling.
- [ ] Handle Gen1 battery-powered sensor polling (longer intervals, offline tolerance, per-component override).
- [ ] Map Shelly Gas sensor concentration data more richly (PPM thresholds).
- [ ] Wire `input` components to a HomeKit service (`StatelessProgrammableSwitch`); they are currently skipped under `splitChannels` to avoid empty accessories.
- [ ] Re-introduce light color control (`hue` / `saturation` / `colorTemperature`) on `LightCommand` once Gen1/Gen2 color endpoints are implemented — the fields were removed as dead API surface.

## Testing

- [ ] Add unit test fixtures for Gen1 relay, light, roller, EM, gas sensor, RGBW status payloads.
- [ ] Add unit test fixtures for Gen2 switch, light, cover, input, temperature, humidity payloads.
- [ ] Add integration tests with mock Shelly HTTP servers for both generations.
- [ ] Add integration tests for Gen2 WebSocket notification merge.
- [ ] Add tests for `mdns.mergeDiscovered` (manual-config-wins semantics, MAC dedupe).
- [ ] Add tests for include/exclude filter logic.
- [ ] Add tests for `splitChannels` mode (including that input-only components are skipped).
- [ ] Add tests for stale accessory removal.
- [ ] Add tests for device offline / auth error handling paths.
- [ ] Test plugin load on a clean Homebridge v2 instance.

## Discovery

- [ ] Improve mDNS reliability; consider subnet scanning fallback when mDNS misses devices.
- [ ] Add periodic re-discovery to pick up new devices without restart.
- [ ] Deduplicate by MAC across manual + mDNS sources robustly.

## Robustness

- [ ] Add stale-state detection and `StatusFault` characteristic updates.
- [ ] Handle optimistic write reconciliation more explicitly (verify after SET).
- [ ] Rate-limit concurrent device requests to avoid LAN flooding (`Promise.allSettled` fan-out is unbounded in `src/platform.ts:69`).

## Config and UX

- [ ] Use the Shelly device's configured name from `/settings` (Gen1) or `Sys.GetConfig` (Gen2) as the HomeKit display name when no `name` is set in config.
- [ ] Add a `refresh` CLI command to re-probe a single device or all devices.

## Release

- [ ] Create GitHub release with notes on first publish.
- [ ] Review against Homebridge Verified criteria before publishing.

## Documentation

- [ ] Note that newly added accessories appear with model-derived names like `Shelly Plus Plug S Switch 1` until renamed in the Home app.
