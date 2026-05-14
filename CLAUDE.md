# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run build      # tsc -> dist/, then chmod +x dist/cli/probe.js
npm test           # vitest run (all tests)
npm run lint       # eslint src
npm run clean      # rm -rf dist
npm run probe -- --host 192.0.2.10    # read-only device inspector (tsx)
```

Run a single test file or test by name:

```sh
npx vitest run test/security.test.ts
npx vitest run -t "retries with Digest auth"
```

`npm pack --dry-run` may fail with EPERM on this machine due to root-owned files in `~/.npm`; pass `--cache "$TMPDIR/npm-cache"` to work around it.

## Architecture

Homebridge **dynamic platform plugin** for Shelly Gen1 and Gen2+ devices. ESM, Node >=22, Homebridge >=2.0. `src/index.ts` registers `ShellyAllGenPlatform` under the alias `ShellyAllGen`.

**Generation abstraction is the core idea.** Gen1 (flat REST endpoints like `/status`, `/relay/0?turn=on`) and Gen2+ (JSON-RPC over `/rpc/<Method>`) are completely different wire protocols. Both are hidden behind the `ShellyClient` interface in `src/shelly/types.ts`. `createShellyClient` (`src/shelly/client.ts`) probes `/shelly`, reads `gen`, and instantiates `Gen1Client` or `Gen2Client`. Everything above the client layer is generation-agnostic.

**Normalization.** Each client's `discoverComponents()` flattens its device-specific status JSON into a uniform `ShellyComponent[]` — discriminated union of `switch | light | cover | input | sensor`. `readNormalizedDevice` returns `{ client, device: NormalizedShellyDevice }`. Adding support for a new Shelly component type means: extend the union in `types.ts`, emit it from both clients' `discoverComponents()`, and map it to a HomeKit service in the accessory.

**Accessory layer.** `ShellyDeviceAccessory` (`src/accessories/device-accessory.ts`) wraps one `PlatformAccessory`. It maps components to HomeKit services (switch→Switch, light→Lightbulb, cover→WindowCovering, sensor→Temperature/Humidity/Contact/Leak; `input` has no mapping yet). Writes are **optimistic**: `onSet` calls the client then immediately `patch()`es local state rather than waiting for a poll.

**Three update paths, polling is the safety net.** (1) `setInterval` polling always runs. (2) Gen2+ subscribes to `ws://<host>/rpc` (or `wss://` when `protocol: https`) for `NotifyStatus` push, with exponential-backoff reconnect. (3) Gen1 has no per-device socket — instead a single platform-wide `CoIoTListener` (`src/discovery/coiot.ts`) listens for CoAP multicast on UDP 5683 and debounce-triggers a refresh for the matching MAC. Realtime is best-effort; if it fails the device still works via polling.

**Discovery.** `discoverMdns` (`src/discovery/mdns.ts`, `bonjour-service`) finds devices; `platform.mergeDiscovered` merges them with manual `devices[]` config. Manual config always wins per-field; discovery only fills gaps. Dedup is by MAC, falling back to host.

**Auth** lives entirely in `src/util/http.ts`. Challenge-response only: credentials are never sent until the device replies `401`, then `buildAuthHeader` negotiates the scheme. Digest works over HTTP or HTTPS; Basic is **refused over cleartext HTTP** (throws) and only sent over HTTPS. `validateHost` rejects URL-shaped hosts. Internal helpers are exposed via the `__test` export for unit testing.

## Homebridge Verified requirements

Future work must preserve readiness for Homebridge verification:

- Keep this a Homebridge dynamic platform plugin; do not convert it to a static platform or accessory plugin.
- Keep `package.json` metadata compatible with Homebridge discovery: package name `homebridge-shelly-allgen`, keyword `homebridge-plugin`, `engines.homebridge`, public GitHub repository, and issues URL.
- Maintain compatibility with all Node.js versions supported by the targeted Homebridge release. For Homebridge v2, track Homebridge's own Node engine support and keep CI aligned.
- Keep the Homebridge Plugin Settings GUI working through `config.schema.json`; `pluginAlias` must match the registered platform alias `ShellyAllGen`.
- Do not add postinstall scripts or any install-time system modifications.
- Do not require a TTY, non-standard Homebridge startup flags, or manual CLI setup for initial configuration.
- Do not add analytics, telemetry, tracking, or external callbacks unrelated to Shelly/Homebridge operation.
- If persistent files are ever needed, store them inside the Homebridge storage directory only.
- Catch and log plugin errors; do not allow unhandled exceptions from startup, polling, discovery, realtime, or device command paths.
- Keep GitHub releases and `CHANGELOG.md` aligned for every published npm version.

## Conventions / gotchas

- **ESM with `.js` import specifiers**: source is `.ts` but all relative imports must end in `.js` (NodeNext resolution). `tsc` does not rewrite them.
- `dist/` is what ships to npm — the `files` allowlist in `package.json` is explicit; `src/`, `test/`, `docs/` are excluded.
- Hardware-affecting changes (auth, polling, realtime, command shape) need a validation entry in `docs/hardware-validation.md` before landing — see `CONTRIBUTING.md`.
- `TODO.md` tracks deferred work; check it before proposing new features.
