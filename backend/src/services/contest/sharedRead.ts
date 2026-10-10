const pending = new Map<string, Promise<unknown>>();

/** Coalesce identical reads only while they are running; access checks stay per request. */
export async function sharedContestRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  if (pending.size >= 200) return read();
  const promise = Promise.resolve().then(read).finally(() => {
    if (pending.get(key) === promise) pending.delete(key);
  });
  pending.set(key, promise);
  return promise;
}
