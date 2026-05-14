# Contributing

Thanks for taking the time to contribute.

Issues are enabled for bug reports and support requests. External pull requests are not generally accepted without prior maintainer discussion; unsolicited PRs may be closed so the project can keep review scope and maintenance responsibility clear.

## Development setup

```sh
npm install
npm run build
npm test
npm run lint
```

`npm run build` runs `tsc` and marks `dist/cli/probe.js` executable.

## Running the probe CLI

The probe is a read-only inspector for Shelly devices on the LAN. It is published as the `shelly-allgen-probe` bin once the package is installed, but during development it runs through `tsx`:

```sh
npm run probe -- --host 192.0.2.10
npm run probe -- --host gen2-device.example.local --username admin --password secret --protocol https
```

With no `--host`, the probe does a 5-second mDNS scan and normalizes whatever responds.

## Branch and PR conventions

- Branch off `main`. Maintainer-authored PRs should cover one logical change set.
- Run `npm run build && npm test && npm run lint` locally before opening the PR. CI runs the same matrix plus `npm pack --dry-run` and a Semgrep scan.
- Commit messages: imperative mood, single short subject line, body when context helps (why over what).
- Keep `CHANGELOG.md` updated under an `## [Unreleased]` heading; the maintainer promotes that to a versioned entry at release time.

## Hardware-affecting changes

Anything that changes how the plugin talks to real devices (auth, polling, realtime, command shape) needs an entry in `docs/hardware-validation.md` describing how it was validated against live hardware before the change can land. Pure refactors and tests don't.

## Filing issues

When reporting a bug, include:

- Plugin version, Homebridge version, Node version.
- Shelly device model and generation (Gen1 / Gen2+).
- The relevant section of the Homebridge log with `debug: true` set in the plugin config.
- The output of `npx shelly-allgen-probe --host <device>` if the device responds to HTTP.
