import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { parseConfig, type DeviceConfig, type ShellyAllGenConfig } from './config.js';
import { discoverMdns, type DiscoveredEndpoint } from './discovery/mdns.js';
import { CoIoTListener } from './discovery/coiot.js';
import { ShellyDeviceAccessory, type AccessoryOptions } from './accessories/device-accessory.js';
import { createEveTypes, type EveTypes } from './accessories/eve.js';
import { matchesDeviceFilters, matchesGlobalFilters, type FilterTerms } from './filters.js';
import { readNormalizedDevice } from './shelly/client.js';
import type { NormalizedShellyDevice, ShellyClient, ShellyComponent } from './shelly/types.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export class ShellyAllGenPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly eve: EveTypes;
  public readonly configValues: ShellyAllGenConfig;
  private readonly accessories = new Map<string, PlatformAccessory>();
  private readonly handlers = new Map<string, ShellyDeviceAccessory>();
  private readonly discovered = new Set<string>();
  private readonly discoveryAbort = new AbortController();
  private readonly filters: FilterTerms;
  public readonly coiot?: CoIoTListener;

  constructor(public readonly log: Logging, config: PlatformConfig, public readonly api: API) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.eve = createEveTypes(api);
    this.configValues = parseConfig(config);
    this.filters = { include: this.configValues.include, exclude: this.configValues.exclude };
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
    const endpoints = new Map<string, DeviceConfig>();
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

  private mergeDiscovered(endpoints: Map<string, DeviceConfig>, macIndex: Map<string, string>, discovered: DiscoveredEndpoint) {
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

  private async registerEndpoint(endpoint: DeviceConfig): Promise<void> {
    const { client, device } = await readNormalizedDevice(endpoint, this.configValues.requestTimeout * 1000, (level, message) => this.log[level](message));
    if (!matchesGlobalFilters(this.filters, device, endpoint)) return;
    device.components = device.components.filter(component =>
      matchesGlobalFilters(this.filters, device, endpoint, component) && matchesDeviceFilters(endpoint, component));
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

  private accessoryOptions(endpoint: DeviceConfig): AccessoryOptions {
    return {
      offlineAfterFailures: endpoint.offlineAfterFailures ?? this.configValues.offlineAfterFailures,
      gasSensorType: this.configValues.gasSensorType,
      outletInUseWatts: this.configValues.outletInUseWatts,
      serviceType: endpoint.serviceType === 'auto' ? undefined : endpoint.serviceType,
    };
  }

  private registerDeviceAccessory(client: ShellyClient, device: NormalizedShellyDevice, endpoint: DeviceConfig, component?: ShellyComponent): void {
    const baseId = device.mac || device.id;
    const uuid = this.api.hap.uuid.generate(component ? `shelly:${baseId}:${component.key}` : `shelly:${baseId}`);
    if (this.discovered.has(uuid)) {
      this.log.debug(`Duplicate Shelly endpoint ignored: ${endpoint.host} (${baseId})`);
      return;
    }
    this.discovered.add(uuid);
    const displayName = component?.name ?? endpoint.name ?? device.name ?? device.model;
    let accessory = this.accessories.get(uuid);
    const restored = accessory !== undefined;
    if (!accessory) {
      accessory = new this.api.platformAccessory(displayName, uuid);
      this.accessories.set(uuid, accessory);
    }
    accessory.context.device = device;
    this.handlers.get(uuid)?.close();
    this.handlers.set(uuid, new ShellyDeviceAccessory(this, accessory, client, device, this.accessoryOptions(endpoint), component ? new Set([component.key]) : undefined));
    // Register or persist only after the handler has configured (and, for a
    // cached accessory, pruned) its services. Registering first wrote new
    // accessories to cachedAccessories with only AccessoryInformation.
    if (restored) {
      this.api.updatePlatformAccessories([accessory]);
      this.log.info('Restored Shelly accessory:', displayName, `(${device.host})`);
    } else {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.log.info('Added Shelly accessory:', displayName, `(${device.host})`);
    }
  }
}
