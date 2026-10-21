const { REMINDER_PACK_IDS } = require('./reminder-content');

function shuffle(ids, random) {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function refill(ids, lastId, random) {
  const bag = shuffle(ids, random);
  if (bag.length > 1 && bag[0] === lastId) [bag[0], bag[1]] = [bag[1], bag[0]];
  return bag;
}

function normalizeRotation(saved = {}, dateKey, ids, random = Math.random) {
  if (!saved || typeof saved !== 'object') saved = {};
  const valid = new Set(ids);
  // Active rest identity survives disabling its character in the future catalog.
  const knownIds = new Set([...REMINDER_PACK_IDS, ...ids]);
  const currentId = knownIds.has(saved.currentId) ? saved.currentId : null;
  const lastId = knownIds.has(saved.lastId) ? saved.lastId : null;
  const validBag = saved.date === dateKey && Array.isArray(saved.remainingIds)
    && Array.isArray(saved.catalogIds);
  let remaining;
  if (validBag) {
    remaining = saved.remainingIds.filter((id, index, list) =>
      valid.has(id) && id !== currentId && list.indexOf(id) === index);
    const known = new Set(saved.catalogIds);
    const added = ids.filter((id) => !known.has(id) && id !== currentId && !remaining.includes(id));
    remaining.push(...shuffle(added, random));
  } else {
    // Reset the future bag at midnight, but retain the active rest character.
    remaining = refill(ids.filter((id) => id !== currentId), lastId, random);
  }
  if (remaining.length > 1 && remaining[0] === lastId) {
    const different = remaining.findIndex(id => id !== lastId);
    if (different > 0) [remaining[0], remaining[different]] = [remaining[different], remaining[0]];
  }
  return {
    date: dateKey,
    catalogIds: [...ids],
    remainingIds: remaining,
    currentId,
    lastId
  };
}

function takeNextPack(saved, dateKey, ids, random = Math.random) {
  const state = normalizeRotation(saved, dateKey, ids, random);
  if (state.currentId) return { id: state.currentId, state };
  const bag = state.remainingIds.length ? [...state.remainingIds] : refill(ids, state.lastId, random);
  const id = bag.shift();
  return { id, state: { ...state, remainingIds: bag, currentId: id, lastId: id } };
}

function releaseCurrentPack(state) { return { ...state, currentId: null }; }

module.exports = { normalizeRotation, takeNextPack, releaseCurrentPack };
