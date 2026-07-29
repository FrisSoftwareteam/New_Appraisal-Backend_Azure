// Memoizes a loader with a time-to-live, de-duping concurrent calls into a single
// in-flight load. Intended for small, slow-changing collections (Grade, Role,
// SystemSetting) that would otherwise be re-queried on every request.
export function createTtlCache<T>(loader: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let cached: { value: T; expiresAt: number } | null = null;
  let pending: Promise<T> | null = null;

  return function getCached(): Promise<T> {
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value);
    }
    if (pending) return pending;

    pending = loader()
      .then((value) => {
        cached = { value, expiresAt: Date.now() + ttlMs };
        pending = null;
        return value;
      })
      .catch((err) => {
        pending = null;
        throw err;
      });

    return pending;
  };
}
