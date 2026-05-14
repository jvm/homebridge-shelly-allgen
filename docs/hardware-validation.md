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
