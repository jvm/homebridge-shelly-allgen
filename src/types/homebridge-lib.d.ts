// Minimal ambient declaration for the single `homebridge-lib` entry point this
// plugin uses. `homebridge-lib` ships JS with JSDoc but no `.d.ts`; only the
// Eve custom-type surface is declared here — see src/accessories/eve.ts.
declare module 'homebridge-lib/EveHomeKitTypes' {
  import type { API, Characteristic, Service, WithUUID } from 'homebridge';

  type CharacteristicConstructor = WithUUID<{ new (): Characteristic }>;

  export class EveHomeKitTypes {
    constructor(homebridge: API);
    readonly Characteristics: Record<string, CharacteristicConstructor>;
    readonly Services: Record<string, WithUUID<typeof Service>>;
  }
}
