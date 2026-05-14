import type { API, Characteristic, Service, WithUUID } from 'homebridge';
import { EveHomeKitTypes } from 'homebridge-lib/EveHomeKitTypes';

type CharacteristicConstructor = WithUUID<{ new (): Characteristic }>;

/**
 * HomeKit has no native power/energy characteristics. The Eve app (and other
 * Eve-aware controllers) reads Eve's custom characteristic UUIDs from any
 * service that carries them, so this plugin surfaces power/energy by attaching
 * these characteristics to its switch/light services and by exposing a
 * dedicated Eve "Consumption" service for standalone meters.
 */
export interface EveTypes {
  Characteristics: {
    /** Instantaneous power, in watts. */
    Consumption: CharacteristicConstructor;
    /** Lifetime energy, in kWh. */
    TotalConsumption: CharacteristicConstructor;
    /** Voltage, in volts. */
    Voltage: CharacteristicConstructor;
    /** Current, in amps. */
    ElectricCurrent: CharacteristicConstructor;
  };
  /** Eve "Consumption" service — carries the four characteristics above, used for standalone meters with no relay/light. */
  ConsumptionService: WithUUID<typeof Service>;
}

/** Build the typed subset of Eve custom HomeKit types this plugin depends on. */
export function createEveTypes(api: API): EveTypes {
  const eve = new EveHomeKitTypes(api);
  return {
    Characteristics: {
      Consumption: eve.Characteristics.Consumption,
      TotalConsumption: eve.Characteristics.TotalConsumption,
      Voltage: eve.Characteristics.Voltage,
      ElectricCurrent: eve.Characteristics.ElectricCurrent,
    },
    ConsumptionService: eve.Services.Consumption,
  };
}
