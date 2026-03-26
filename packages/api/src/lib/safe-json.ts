/**
 * Safely parse a JSON string expected to be an array of strings.
 * Returns [] on null input, parse failure, or non-array result.
 */
export function safeParseJsonArray(raw: string | null): string[] {
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("safeParseJsonArray: invalid JSON input");
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.warn("safeParseJsonArray: parsed value is not an array");
    return [];
  }

  const strings = parsed.filter((item): item is string => typeof item === "string");
  if (strings.length !== parsed.length) {
    console.warn("safeParseJsonArray: some array elements are not strings");
  }

  return strings;
}
