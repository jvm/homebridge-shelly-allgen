export type Dict = Record<string, unknown>;

export function num(value: unknown): number | undefined {
  // Treat null / missing / empty string as "no value" rather than letting
  // Number() coerce them to 0 (e.g. an uncalibrated cover reports pos: null).
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function arr(value: unknown): Dict[] {
  return Array.isArray(value) ? value.filter((v): v is Dict => typeof v === 'object' && v !== null) : [];
}

export function obj(value: unknown): Dict | undefined {
  return value && typeof value === 'object' ? value as Dict : undefined;
}
