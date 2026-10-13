# Hardware Validation

This document defines the hardware validation expected for changes that affect Shelly device communication.

## When validation is required

Add or update a validation entry when a change modifies any of the following:

- Authentication behavior.
- Polling or realtime update behavior.
- Device command payloads or endpoint selection.
- Component discovery, normalization, or HomeKit service mapping.
- Network discovery behavior such as mDNS or CoIoT handling.

Pure refactors, type-only changes, and isolated unit-test changes do not require hardware validation unless they affect the behavior above.

## Required validation details

Record enough information for another maintainer to understand what was tested without exposing private network details.

Include:

- Package or commit under test.
- Homebridge version, Node.js version, and operating system family.
- Shelly generation and device class tested, for example Gen1 relay, Gen1 roller, Gen1 sensor, Gen2+ switch, or Gen2+ cover.
- Whether discovery, manual configuration, or both were tested.
- Whether authentication was enabled, and which scheme was exercised.
- Whether polling, Gen2+ WebSocket realtime, or Gen1 CoIoT updates were observed.
- Which HomeKit service types were visible or controlled.
- Any rollback or recovery steps that users would need to know.

Do not include:

- Public hostnames, private hostnames, or real IP addresses.
- Device names from a personal installation.
- MAC addresses, serial numbers, or mDNS instance names.
- Raw Homebridge logs that contain unrelated plugin output, URLs, credentials, or tokens.
- Full Homebridge configuration files.

## Sanitized validation template

```md
## <date or release> — <change summary>

- Package/commit: `<version-or-sha>`
- Runtime: Homebridge <version>, Node.js <version>, <OS family>
- Device coverage: Gen1 <classes>, Gen2+ <classes>
- Configuration tested: discovery <enabled/disabled>, manual devices <yes/no>, child bridge <yes/no>
- Authentication tested: none / Digest / Basic over HTTPS
- Realtime tested: polling / Gen2+ WebSocket / Gen1 CoIoT
- HomeKit services verified: Switch / Lightbulb / WindowCovering / TemperatureSensor / HumiditySensor / ContactSensor / LeakSensor
- Write tests: <sanitized service type and outcome>
- Result: pass/fail with concise notes
- Rollback notes: <user-relevant recovery steps, if any>
```

## Hardware coverage summary

Validated coverage includes a Homebridge-managed Node.js runtime with both discovery and manual configuration. Tested device classes include representative Gen1 relay, plug, metering, gas sensor, roller, and light devices, plus Gen2+ plug/switch devices. Read-only probing, accessory creation, polling, and representative Switch writes are covered. Authentication and TLS-specific paths require dedicated validation on devices configured for those modes.

## Validation entries

## 0.3.0 — PENDING — Stale service pruning, offline reporting, per-device filters, Outlet/Lightbulb relay mapping, Shelly Gas fix

Status: **not yet validated on hardware.** Unit-tested only. Install the packed `homebridge-shelly-allgen-0.3.0.tgz` on a Homebridge host with an existing 0.2.0 accessory cache and record results here before publishing.

- Package/commit: `0.3.0` (branch `release-0.3.0`)
- Runtime: <Homebridge version>, <Node.js version>, <OS family>
- Configuration to test: discovery and manual devices; upgrade over an existing 0.2.0 cache (not a fresh install)
- Authentication tested: none expected (open HTTP devices)
- Realtime to observe: polling, Gen1 CoIoT, Gen2+ WebSocket

Checks per device:

- **Plug S (SHPLG-S), Gen1:** cached Switch is replaced by an Outlet (one service, no leftover Switch). On/off works from Home. Outlet In Use is true under load above 2 W and false with no load. Eve app still shows Consumption and Total Consumption on the Outlet.
- **Plus Plug S (SNPL-00112EU), Gen2+:** same Outlet checks as Plug S, plus Voltage and Electric Current in Eve. Outlet In Use updates over the WebSocket without waiting for a poll.
- **Shelly 2.5 (SHSW-25), roller mode:** only the WindowCovering service remains; no relay services reappear. Position control unchanged.
- **Shelly 1PM (SHSW-PM), appliance type outlet:** confirm `/settings` `relays[0].appliance_type` is `outlet`; relay shows as an Outlet with power. Then set `serviceType: "switch"` on the device and confirm it returns to a Switch and the Outlet is removed.
- **Shelly 1 (SHSW-1):** stays a Switch (or Lightbulb if its appliance type is `lights`). No power characteristics.
- **Shelly Gas (SHGS-1):** idle shows no alarm and Status Fault clear. During warm-up after power-on, no gas alarm and Status Fault set (previously a false Leak Detected). Try `gasSensorType` `smoke` and `co`: the service is replaced, and the old LeakSensor is removed. Do not trigger a real alarm; if a self-test is run, note how `alarm_state` and Home behave.
- **Shelly 3EM (SHEM-3):** with `"exclude": ["switch:0"]` on the device entry, the contactor relay service is removed from the cached accessory and the three Eve Consumption meters remain.
- **Offline:** unplug or block one device. After 3 polls Home shows "No Response", sensors show Status Fault, and the log has exactly one "is not responding" info line. Restore it: one "is responding again" line and state returns. Repeat with `offlineAfterFailures: 0` and confirm no "No Response".
- **Write tests:** on/off on Outlet, Switch, and Lightbulb services only; cover position on the 2.5.
- Rollback notes: downgrading to 0.2.0 re-adds Switch services next to the new Outlet/Lightbulb/Smoke/CO services in the cache. Remove the affected accessories from the Homebridge cache (or enable `removeStaleAccessories`) after a downgrade. Scenes and automations on changed services must be set up again either way.

## Unreleased — Gen1 meter power, roller-mode relay suppression, null position handling

- Package/commit: `unreleased` (TODO.md "Testing" follow-up)
- Runtime: Homebridge-managed Node.js on a Linux host inside the IoT VLAN; bundled Node from the Homebridge install
- Device coverage: Gen1 Shelly 1PM, Plug S, Shelly 1, EM3, Gas, Shelly 2.5 (roller mode); Gen2+ Plus Plug S
- Configuration tested: read-only probe (`dist/cli/probe.js --host <ip>`) against live devices via manual host targeting
- Authentication tested: none (open HTTP devices)
- Realtime tested: n/a (normalization-only change; probe exercises the discovery/normalization path)
- HomeKit services verified: Switch (Gen1 relay + Gen2 switch), WindowCovering (Gen1 roller), TemperatureSensor, gas sensor — component output inspected via probe, not paired into Home
- Write tests: n/a (normalization-only change, no SET commands issued)
- Result: **pass.** Before/after compared by probing with the published v0.1.0 build and the patched build against the same devices.
  - Meter power: Shelly 1PM and Plug S surfaced no `power`/`energy` on the relay component before; after the fix both report values sourced from `status.meters[]` (e.g. Plug S relay `power: 69.84`, `energy: 26112913`). Gen1 relay objects carry no `power` field, confirming the previous code path was dead.
  - Roller mode: Shelly 2.5 devices expose only the `roller` component (plus inputs/temperature), no phantom `relay:*` switches. Note fw v1.14.0 already reports `relays: []` in roller mode, so the `settings.mode === 'roller'` guard is defensive on this firmware; behaviour was unchanged before/after on hardware and is covered for the relays-present case by unit tests.
  - `num()` null handling: not exercised on hardware — no Gen2+ cover is present in the test inventory, and the observed Gen1 relays omit `power` entirely rather than sending `null`. Gen2 Plus Plug S normalization (clean numeric fields) was confirmed unaffected. The uncalibrated-cover `pos: null` path remains unit-tested only.
- Rollback notes: revert the `src/shelly/parse.ts` and `src/shelly/gen1-client.ts` changes; no config or state migration involved.

## Unreleased — Energy metering: Gen1 EM/3EM channels, Gen2+ returned energy, watt-minute unit fix, Eve characteristics

- Package/commit: `unreleased` (TODO.md "Energy metering" follow-up)
- Runtime: Homebridge 2.0.2, Node.js 24.15.0, Linux (Debian 13); bundled Node from the Homebridge install
- Device coverage: Gen1 Shelly 3EM (SHEM-3), Plug S (SHPLG-S), Shelly 2.5 roller mode (SHSW-25); Gen2+ Plus Plug S (SNPL-00112EU)
- Configuration tested: read-only probe (`dist/cli/probe.js --host <ip>`) against live devices via manual host targeting
- Authentication tested: none (open HTTP devices)
- Realtime tested: n/a (normalization-only change; probe exercises the discovery/normalization path)
- HomeKit services verified: component output inspected via probe (`meter` components, switch energy fields), not paired into Home; Eve service/characteristic mapping is exercised by the build/type-check and unit tests, not yet by a live Homebridge pairing
- Write tests: n/a (read-only change, no SET commands issued)
- Result: **pass.**
  - Gen1 EM/3EM: SHEM-3 surfaces three `emeter:N` `meter` components, each with `power`, `voltage`, `current`, `powerFactor`, `energy`, and `energyReturned` (e.g. `emeter:0` `power: 149.57`, `energy: 5800551`). `emeters` channel names were `null` on the device and normalize to no name, as expected.
  - Watt-minute unit fix: SHPLG-S `relay:0` reports `energy: 435313` Wh — the raw `status.meters[0].total` of `26118781` watt-minutes ÷ 60. Before this change the field carried the unconverted watt-minute value (60× too high).
  - Gen2+ returned energy: SNPL-00112EU `switch:0` carries `power`/`voltage`/`current`/`energy` from `aenergy.total`; no `energyReturned` is emitted because the Plus Plug S firmware does not report `ret_aenergy`. The `ret_aenergy → energyReturned` path is covered by a unit fixture; no Gen2+ EM hardware was available to validate it live.
  - Roller mode: SHSW-25 still exposes only `roller` + inputs + temperature; its `status.meters[]` are not surfaced as standalone meters (they belong to the roller), unchanged by this work.
- Rollback notes: revert the `src/shelly/{types,gen1-client,gen2-client}.ts`, `src/accessories/{eve,device-accessory}.ts`, `src/platform.ts`, and `src/types/homebridge-lib.d.ts` changes, and remove the `homebridge-lib` dependency from `package.json`. No config or state migration involved; cached accessories gain extra characteristics that are harmless if the plugin is downgraded.
