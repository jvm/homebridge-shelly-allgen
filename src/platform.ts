import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { parseConfig, type ShellyAllGenConfig } from './config.js';
import { discoverMdns, type DiscoveredEndpoint } from './discovery/mdns.js';
import { CoIoTListener } from './discovery/coiot.js';
import { ShellyDeviceAccessory } from './accessories/device-accessory.js';
import { readNormalizedDevice } from './shelly/client.js';
import type { DeviceEndpoint, NormalizedShellyDevice, ShellyClient, ShellyComponent } from './shelly/types.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export class ShellyAllGenPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly configValues: ShellyAllGenConfig;
  private readonly accessories = new Map<string, PlatformAccessory>();
  private readonly handlers = new Map<string, ShellyDeviceAccessory>();
  private readonly discovered = new Set<string>();
  private readonly discoveryAbort = new AbortController();
  private readonly includes: string[];
  private readonly excludes: string[];
  public readonly coiot?: CoIoTListener;

  constructor(public readonly log: Logging, config: PlatformConfig, public readonly api: API) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.configValues = parseConfig(config);
    this.includes = this.configValues.include.map(s => s.toLowerCase());
    this.excludes = this.configValues.exclude.map(s => s.toLowerCase());
    if (this.configValues.realtime && this.configValues.coiot) {
      this.coiot = new CoIoTListener((level, message) => this.log[level](message));
    }
    this.api.on('didFinishLaunching', () => {
      void this.start().catch(error => this.log.error('Shelly AllGen startup failed:', String(error)));
    });
    this.api.on('shutdown', () => {
      this.discoveryAbort.abort();
      for (const h of this.handlers.values()) h.close();
      this.coiot?.stop();
    });
  }

  private async start(): Promise<void> {
    if (this.coiot) {
      const started = await this.coiot.start();
      if (started) this.log.info('CoIoT listener active on UDP 5683 for Gen1 push updates.');
    }
    await this.discoverDevices();
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  private async discoverDevices(): Promise<void> {
    const endpoints = new Map<string, DeviceEndpoint>();
    const macIndex = new Map<string, string>();
    for (const device of this.configValues.devices) {
      const key = device.host.toLowerCase();
      endpoints.set(key, { ...device });
    }

    if (this.configValues.discovery) {
      try {
        const discovered = await discoverMdns(4000, { signal: this.discoveryAbort.signal });
        for (const d of discovered) this.mergeDiscovered(endpoints, macIndex, d);
      } catch (error) {
        this.log.warn('mDNS discovery failed:', String(error));
      }
    }

    await Promise.allSettled([...endpoints.values()].map(endpoint =>
      this.registerEndpoint(endpoint).catch(error => this.log.warn(`Failed to load Shelly at ${endpoint.host}:`, String(error))),
    ));

    if (this.configValues.removeStaleAccessories) {
      for (const [uuid, accessory] of this.accessories) {
        if (!this.discovered.has(uuid)) {
          this.handlers.get(uuid)?.close();
          this.handlers.delete(uuid);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.accessories.delete(uuid);
        }
      }
    }
  }

  private mergeDiscovered(endpoints: Map<string, DeviceEndpoint>, macIndex: Map<string, string>, discovered: DiscoveredEndpoint) {
    const hostKey = discovered.host.toLowerCase();
    const existingHostKey = (discovered.mac && macIndex.get(discovered.mac)) ?? (endpoints.has(hostKey) ? hostKey : undefined);
    if (existingHostKey) {
      const existing = endpoints.get(existingHostKey)!;
      // Manual config wins on every field; only fill gaps from discovery.
      endpoints.set(existingHostKey, {
        ...existing,
        name: existing.name ?? discovered.name,
        generation: existing.generation ?? discovered.generation,
      });
      if (discovered.mac) macIndex.set(discovered.mac, existingHostKey);
      return;
    }
    endpoints.set(hostKey, { host: discovered.host, name: discovered.name, generation: discovered.generation });
    if (discovered.mac) macIndex.set(discovered.mac, hostKey);
  }

  private async registerEndpoint(endpoint: DeviceEndpoint): Promise<void> {
    const { client, device } = await readNormalizedDevice(endpoint, this.configValues.requestTimeout * 1000, (level, message) => this.log[level](message));
    if (!this.matchesFilters(device, endpoint)) return;
    device.components = device.components.filter(component => this.matchesFilters(device, endpoint, component));
    if (this.configValues.splitChannels && device.components.length > 0) {
      for (const component of device.components) {
        // Inputs don't currently map to a HomeKit service, so a per-input
        // accessory would be empty. Skip until inputs gain a service mapping.
        if (component.type === 'input') continue;
        this.registerDeviceAccessory(client, { ...device, components: [component] }, endpoint, component);
      }
      return;
    }
    this.registerDeviceAccessory(client, device, endpoint);
  }

  private matchesFilters(device: NormalizedShellyDevice, endpoint: DeviceEndpoint, component?: ShellyComponent): boolean {
    const haystack = [endpoint.host, device.host, device.id, device.mac, device.model, device.name, endpoint.name, component?.key, component?.name, component?.type]
      .filter(Boolean).join(' ').toLowerCase();
    if (this.includes.length > 0 && !this.includes.some(s => haystack.includes(s))) return false;
    if (this.excludes.some(s => haystack.includes(s))) return false;
    return true;
  }

  private registerDeviceAccessory(client: ShellyClient, device: NormalizedShellyDevice, endpoint: DeviceEndpoint, component?: ShellyComponent): void {
    const baseId = device.mac || device.id;
    const uuid = this.api.hap.uuid.generate(component ? `shelly:${baseId}:${component.key}` : `shelly:${baseId}`);
    if (this.discovered.has(uuid)) {
      this.log.debug(`Duplicate Shelly endpoint ignored: ${endpoint.host} (${baseId})`);
      return;
    }
    this.discovered.add(uuid);
    const displayName = component?.name ?? endpoint.name ?? device.name ?? device.model;
    let accessory = this.accessories.get(uuid);
    if (!accessory) {
      accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.device = device;
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.set(uuid, accessory);
      this.log.info('Added Shelly accessory:', displayName, `(${device.host})`);
    } else {
      accessory.context.device = device;
      this.api.updatePlatformAccessories([accessory]);
      this.log.info('Restored Shelly accessory:', displayName, `(${device.host})`);
    }
    this.handlers.get(uuid)?.close();
    this.handlers.set(uuid, new ShellyDeviceAccessory(this, accessory, client, device, component ? new Set([component.key]) : undefined));
  }
}
