const toTimestamp = (value) => {
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const stableOrderSort = (orders) => [...orders].sort((a, b) => {
  const createdDifference = toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
  return createdDifference || String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
});

export const orderStoreFromList = (orders = []) => Object.fromEntries(
  orders.filter((order) => order && order.id != null).map((order) => [String(order.id), order]),
);

export const mergeOrderRecord = (store, incoming, { optimisticStatus, preserveStatus = false } = {}) => {
  if (!incoming || incoming.id == null) return store;
  const id = String(incoming.id);
  const current = store[id];
  const currentUpdatedAt = toTimestamp(current?.updatedAt);
  const incomingUpdatedAt = toTimestamp(incoming.updatedAt);

  if (current && incomingUpdatedAt && currentUpdatedAt > incomingUpdatedAt) return store;

  let merged = current ? { ...current, ...incoming } : incoming;
  if (current && preserveStatus && optimisticStatus && incoming.status !== optimisticStatus) {
    merged = { ...merged, status: optimisticStatus };
  }
  return { ...store, [id]: merged };
};

export const mergeOrderList = (store, incomingOrders, {
  startedAtSequence = 0,
  latestSequenceById = {},
  latestRequest = true,
  optimisticStatuses = {},
  activeStatuses,
} = {}) => {
  let next = { ...store };
  const presentIds = new Set();

  for (const incoming of incomingOrders || []) {
    if (!incoming || incoming.id == null) continue;
    const id = String(incoming.id);
    presentIds.add(id);
    if ((latestSequenceById[id] || 0) > startedAtSequence) continue;
    const optimistic = optimisticStatuses[id];
    next = mergeOrderRecord(next, incoming, {
      optimisticStatus: optimistic?.status,
      preserveStatus: Boolean(optimistic && Date.now() < optimistic.expiresAt),
    });
  }

  // A fresh authoritative list can remove truly absent records, unless a local
  // socket/optimistic write happened after this request began.
  if (latestRequest) {
    for (const id of Object.keys(next)) {
      const existing = next[id];
      const isInScope = !activeStatuses || activeStatuses.includes(existing.status);
      if (!presentIds.has(id) && isInScope && (latestSequenceById[id] || 0) <= startedAtSequence) {
        delete next[id];
      }
    }
  }
  return next;
};

export const isOrderDeletedEvent = (payload) => Boolean(
  payload && (payload.orderDeletedId != null || Array.isArray(payload.bulkDeletedOrderIds)),
);

export const removeDeletedOrders = (store, payload) => {
  const ids = payload?.orderDeletedId != null
    ? [payload.orderDeletedId]
    : Array.isArray(payload?.bulkDeletedOrderIds) ? payload.bulkDeletedOrderIds : [];
  if (!ids.length) return store;
  const next = { ...store };
  ids.forEach((id) => delete next[String(id)]);
  return next;
};
