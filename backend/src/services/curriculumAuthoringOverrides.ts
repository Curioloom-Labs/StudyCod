type UnknownRecord = Record<string, unknown>;

function recordOf(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

/** Mark exactly the fields edited by an author; untouched source fields keep syncing. */
export function markCurriculumAuthoringOverrides(
  current: unknown,
  fields: readonly string[],
  created = false,
): UnknownRecord {
  const next = { ...recordOf(current) };
  for (const field of fields) next[field] = true;
  if (created) next.created = true;
  return next;
}

/** Apply incoming curriculum fields while retaining only fields explicitly edited in Course Studio. */
export function mergeCurriculumSourceFields<T extends object>(
  current: T,
  incoming: Partial<T>,
  authoringOverrides: unknown,
): T {
  const next = Object.assign({}, current, incoming) as T;
  const overrides = recordOf(authoringOverrides);
  const currentFields = current as unknown as UnknownRecord;
  const nextFields = next as unknown as UnknownRecord;
  for (const [field, enabled] of Object.entries(overrides)) {
    if (enabled === true && Object.prototype.hasOwnProperty.call(currentFields, field)) {
      nextFields[field] = currentFields[field];
    }
  }
  return next;
}

export function hasCurriculumAuthoringOverrides(value: unknown): boolean {
  return Object.keys(recordOf(value)).length > 0;
}
