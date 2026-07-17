export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

export async function parseJsonObject(
  request: Request,
): Promise<JsonObject | null> {
  const content = await request.text();
  if (content.trim().length === 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
  return isObject(parsed) ? parsed : null;
}

export function stringValue(
  object: JsonObject,
  name: string,
): string | undefined {
  const value = object[name];
  return isString(value) ? value : undefined;
}

export function nullableStringValue(
  object: JsonObject,
  name: string,
): string | null | undefined {
  const value = object[name];
  if (value === null) {
    return null;
  }
  return isString(value) ? value : undefined;
}

export function booleanValue(
  object: JsonObject,
  name: string,
): boolean | undefined {
  const value = object[name];
  return isBoolean(value) ? value : undefined;
}

export function numberValue(
  object: JsonObject,
  name: string,
): number | undefined {
  const value = object[name];
  return isFiniteNumber(value) ? value : undefined;
}

export function integerValue(
  object: JsonObject,
  name: string,
): number | undefined {
  const value = object[name];
  return isInteger(value) ? value : undefined;
}

export function objectValue(
  object: JsonObject,
  name: string,
): JsonObject | undefined {
  const value = object[name];
  return isObject(value) ? value : undefined;
}

export function objectArrayValue(
  object: JsonObject,
  name: string,
): readonly JsonObject[] | undefined {
  const value = object[name];
  if (!Array.isArray(value) || !value.every(isObject)) {
    return undefined;
  }
  return value;
}

export function stringArrayValue(
  object: JsonObject,
  name: string,
): readonly string[] | undefined {
  const value = object[name];
  if (!Array.isArray(value) || !value.every(isString)) {
    return undefined;
  }
  return value;
}

export function recordValue(value: unknown): JsonObject | undefined {
  return isObject(value) ? value : undefined;
}

export function recordArrayValue(
  value: unknown,
): readonly JsonObject[] | undefined {
  return Array.isArray(value) && value.every(isObject) ? value : undefined;
}
