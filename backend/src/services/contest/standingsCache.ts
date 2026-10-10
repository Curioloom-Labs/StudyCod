type Entry = { value: unknown; expires: number; contestId: number };
const values = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();
const generations = new Map<number, number>();
export function invalidateStandings(contestId?: number): void {
  if (contestId == null) {
    for (const id of generations.keys()) generations.set(id, (generations.get(id) ?? 0) + 1);
    values.clear(); pending.clear(); return;
  }
  generations.set(contestId, (generations.get(contestId) ?? 0) + 1);
  for (const [key, entry] of values) if (entry.contestId === contestId) values.delete(key);
  for (const key of pending.keys()) if (key.startsWith(`${contestId}:`)) pending.delete(key);
}
export async function cachedStandings<T>(contestId: number, view: string, compute: () => Promise<T>): Promise<T> {
  const key = `${contestId}:${view}`;
  const cached = values.get(key);
  if (cached && cached.expires > Date.now()) return cached.value as T;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight as Promise<T>;
  const generation = generations.get(contestId) ?? 0;
  generations.set(contestId, generation);
  const promise = compute().then(value => {
    if ((generations.get(contestId) ?? 0) === generation) {
      if (values.size >= 200) values.delete(values.keys().next().value!);
      values.set(key, { value, expires: Date.now() + 5000, contestId });
    }
    return value;
  }).finally(() => { if (pending.get(key) === promise) pending.delete(key); });
  pending.set(key, promise);
  return promise;
}
