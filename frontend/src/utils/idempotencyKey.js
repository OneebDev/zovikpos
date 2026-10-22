const memoryKeys = new Map();

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const fingerprint = (value) => {
  const input = stableStringify(value);
  // This is only a local request-change detector; the server computes the
  // authoritative cryptographic request hash.
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const newUuid = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
};

export const getOrCreateIdempotencyKey = (storageKey, body) => {
  const bodyFingerprint = fingerprint(body);
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.fingerprint === bodyFingerprint && parsed.key) return parsed.key;
    }
    const key = newUuid();
    localStorage.setItem(storageKey, JSON.stringify({ fingerprint: bodyFingerprint, key }));
    return key;
  } catch {
    const saved = memoryKeys.get(storageKey);
    if (saved?.fingerprint === bodyFingerprint) return saved.key;
    const key = newUuid();
    memoryKeys.set(storageKey, { fingerprint: bodyFingerprint, key });
    return key;
  }
};

export const clearIdempotencyKey = (storageKey, key) => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!key || saved?.key === key) localStorage.removeItem(storageKey);
  } catch { /* Storage is optional. */ }
  if (!key || memoryKeys.get(storageKey)?.key === key) memoryKeys.delete(storageKey);
};
