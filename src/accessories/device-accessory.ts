import type { CharacteristicValue, PlatformAccessory, Service, WithUUID } from 'homebridge';
import type { ShellyAllGenPlatform } from '../platform.js';
import type { NormalizedShellyDevice, ShellyClient, ShellyComponent } from '../shelly/types.js';

type SwitchComponent = Extract<ShellyComponent, { type: 'switch' }>;
type LightComponent = Extract<ShellyComponent, { type: 'light' }>;
type CoverComponent = Extract<ShellyComponent, { type: 'cover' }>;
type SensorComponent = Extract<ShellyComponent, { type: 'sensor' }>;

export class ShellyDeviceAccessory {
  private readonly services = new Map<string, Service>();
  private readonly components = new Map<string, ShellyComponent>();
  private poll?: NodeJS.Timeout;
  private unsubscribe?: () => void;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private coiotDebounce?: NodeJS.Timeout;
  private coiotRegistered = false;
  private closed = false;

  constructor(
    private readonly platform: ShellyAllGenPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: ShellyClient,
    private device: NormalizedShellyDevice,
    private readonly allowedComponentKeys?: Set<string>,
  ) {
    this.updateInfo();
    this.configureServices(device.components);
    this.startPolling();
    void this.startRealtime();
  }

  private updateInfo() {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Shelly')
      .setCharacteristic(this.platform.Characteristic.Model, this.device.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.mac || this.device.id)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.device.firmware ?? 'unknown');
  }

  private configureServices(components: ShellyComponent[]) {
    for (const c of components) {
      if (this.allowedComponentKeys && !this.allowedComponentKeys.has(c.key)) continue;
      this.components.set(c.key, c);
      if (this.services.has(c.key)) continue;
      if (c.type === 'switch') this.configureSwitch(c);
      else if (c.type === 'light') this.configureLight(c);
      else if (c.type === 'cover') this.configureCover(c);
      else if (c.type === 'sensor') this.configureSensor(c);
    }
  }

  private getService(type: WithUUID<typeof Service>, name: string, subtype: string): Service {
    const existing = this.accessory.getServiceById(type, subtype)
      ?? (this.accessory.addService as (t: WithUUID<typeof Service>, n: string, s: string) => Service)(type, name, subtype);
    existing.setCharacteristic(this.platform.Characteristic.Name, name);
    this.services.set(subtype, existing);
    return existing;
  }

  private getState(key: string, type: 'switch'): SwitchComponent['state'] | undefined;
  private getState(key: string, type: 'light'): LightComponent['state'] | undefined;
  private getState(key: string, type: 'cover'): CoverComponent['state'] | undefined;
  private getState(key: string, type: 'sensor'): SensorComponent['state'] | undefined;
  private getState(key: string, type: ShellyComponent['type']): ShellyComponent['state'] | undefined {
    const c = this.components.get(key);
    return c && c.type === type ? c.state : undefined;
  }

  private configureSwitch(c: SwitchComponent) {
    const svc = this.getService(this.platform.Service.Switch, c.name ?? `${this.device.name ?? this.device.model} Switch ${c.id + 1}`, c.key);
    svc.getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.getState(c.key, 'switch')?.on ?? false)
      .onSet(async v => {
        await this.client.setSwitch(c.id, v as boolean);
        this.patch(c.key, { on: v as boolean });
      });
  }

  private configureLight(c: LightComponent) {
    const svc = this.getService(this.platform.Service.Lightbulb, c.name ?? `${this.device.name ?? this.device.model} Light ${c.id + 1}`, c.key);
    svc.getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => this.getState(c.key, 'light')?.on ?? false)
      .onSet(async v => { await this.client.setLight(c.id, { on: v as boolean }); this.patch(c.key, { on: v as boolean }); });
    svc.getCharacteristic(this.platform.Characteristic.Brightness)
      .onGet(() => this.getState(c.key, 'light')?.brightness ?? 100)
      .onSet(async v => { await this.client.setLight(c.id, { brightness: Number(v) }); this.patch(c.key, { brightness: Number(v) }); });
  }

  private configureCover(c: CoverComponent) {
    const svc = this.getService(this.platform.Service.WindowCovering, c.name ?? `${this.device.name ?? this.device.model} Cover ${c.id + 1}`, c.key);
    svc.getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .onGet(() => this.getState(c.key, 'cover')?.currentPosition ?? 0);
    svc.getCharacteristic(this.platform.Characteristic.TargetPosition)
      .onGet(() => {
        const state = this.getState(c.key, 'cover');
        return state?.targetPosition ?? state?.currentPosition ?? 0;
      })
      .onSet(async v => { await this.client.setCover(c.id, { action: 'position', position: Number(v) }); this.patch(c.key, { targetPosition: Number(v) }); });
    svc.getCharacteristic(this.platform.Characteristic.PositionState)
      .onGet(() => this.positionState(c.key));
  }

  private configureSensor(c: SensorComponent) {
    const map: Record<string, WithUUID<typeof Service> | undefined> = {
      temperature: this.platform.Service.TemperatureSensor,
      humidity: this.platform.Service.HumiditySensor,
      flood: this.platform.Service.LeakSensor,
      gas: this.platform.Service.LeakSensor,
      contact: this.platform.Service.ContactSensor,
    };
    const type = map[c.sensorKind];
    if (!type) return;
    const svc = this.getService(type, c.name ?? `${this.device.name ?? this.device.model} ${c.sensorKind}`, c.key);
    const ch =
      c.sensorKind === 'temperature' ? this.platform.Characteristic.CurrentTemperature :
      c.sensorKind === 'humidity' ? this.platform.Characteristic.CurrentRelativeHumidity :
      (c.sensorKind === 'flood' || c.sensorKind === 'gas') ? this.platform.Characteristic.LeakDetected :
      this.platform.Characteristic.ContactSensorState;
    svc.getCharacteristic(ch).onGet(() => this.sensorValue(c.key, c.sensorKind));
  }

  private sensorValue(key: string, kind: string): CharacteristicValue {
    const value = this.getState(key, 'sensor')?.value;
    if (kind === 'flood' || kind === 'gas') return value ? 1 : 0;
    if (kind === 'contact') return value === 'open' || value === true ? 1 : 0;
    return typeof value === 'number' ? value : 0;
  }

  private positionState(key: string): number {
    const moving = this.getState(key, 'cover')?.moving;
    return moving === 'opening' ? 1 : moving === 'closing' ? 0 : 2;
  }

  private patch(key: string, state: Record<string, unknown>) {
    const c = this.components.get(key);
    if (c) {
      this.components.set(key, { ...c, state: { ...c.state, ...state } } as ShellyComponent);
    }
    this.updateCharacteristics(key);
  }

  private updateCharacteristics(key: string) {
    const c = this.components.get(key);
    const svc = this.services.get(key);
    if (!c || !svc) return;
    if (c.type === 'switch') svc.updateCharacteristic(this.platform.Characteristic.On, c.state.on);
    else if (c.type === 'light') {
      svc.updateCharacteristic(this.platform.Characteristic.On, c.state.on);
      if (c.state.brightness !== undefined) svc.updateCharacteristic(this.platform.Characteristic.Brightness, c.state.brightness);
    } else if (c.type === 'cover') {
      svc.updateCharacteristic(this.platform.Characteristic.CurrentPosition, c.state.currentPosition ?? 0);
      svc.updateCharacteristic(this.platform.Characteristic.TargetPosition, c.state.targetPosition ?? c.state.currentPosition ?? 0);
      svc.updateCharacteristic(this.platform.Characteristic.PositionState, this.positionState(key));
    }
  }

  private startPolling() {
    this.poll = setInterval(() => { void this.refreshState(); }, this.platform.configValues.pollInterval * 1000);
  }

  private async refreshState() {
    if (this.closed) return;
    try {
      const components = await this.client.discoverComponents();
      for (const c of components) {
        if (this.allowedComponentKeys && !this.allowedComponentKeys.has(c.key)) continue;
        const existing = this.components.get(c.key);
        if (!existing) continue;
        if (JSON.stringify(existing.state) === JSON.stringify(c.state)) continue;
        this.components.set(c.key, c);
        this.updateCharacteristics(c.key);
      }
    } catch (error) {
      this.platform.log.debug('Polling failed for', this.device.id, error);
    }
  }

  private async startRealtime() {
    if (this.closed) return;
    if (!this.platform.configValues.realtime) return;
    if (this.device.generation === 1) {
      this.attachCoIoT();
      return;
    }
    if (!this.client.subscribe) return;
    const unsubscribe = await this.client.subscribe(
      update => this.patch(update.componentKey, update.state as Record<string, unknown>),
      () => this.scheduleReconnect(),
    ).catch(error => { this.platform.log.debug('Realtime subscribe failed:', String(error)); return undefined; });
    if (this.closed) {
      unsubscribe?.();
      return;
    }
    if (!unsubscribe) {
      this.scheduleReconnect();
      return;
    }
    this.reconnectAttempts = 0;
    this.unsubscribe = unsubscribe;
    void this.refreshState();
  }

  private attachCoIoT() {
    const coiot = this.platform.coiot;
    if (!coiot || !this.device.mac || this.coiotRegistered) return;
    coiot.register(this.device.mac, () => this.scheduleCoIoTRefresh());
    this.coiotRegistered = true;
  }

  private scheduleCoIoTRefresh() {
    if (this.closed || this.coiotDebounce) return;
    this.coiotDebounce = setTimeout(() => {
      this.coiotDebounce = undefined;
      void this.refreshState();
    }, 100);
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    this.unsubscribe = undefined;
    const delay = Math.min(60_000, 1000 * 2 ** Math.min(this.reconnectAttempts, 6));
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.startRealtime();
    }, delay);
  }

  close() {
    this.closed = true;
    if (this.poll) clearInterval(this.poll);
    this.poll = undefined;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    if (this.coiotDebounce) clearTimeout(this.coiotDebounce);
    this.coiotDebounce = undefined;
    if (this.coiotRegistered) {
      this.platform.coiot?.unregister(this.device.mac);
      this.coiotRegistered = false;
    }
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
