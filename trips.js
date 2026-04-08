/* ── TraceKit trips.js — Trip history manager ── */
const TripHistory = (() => {

  const STORAGE_KEY = 'tracekit_trip_history';

  function getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  function saveTrip(trip) {
    const trips = getAll();
    trips.unshift(trip); // newest first
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trips)); } catch (_) {}
  }

  function deleteTrip(id) {
    const trips = getAll().filter(t => t.id !== id);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trips)); } catch (_) {}
  }

  function renameTrip(id, name) {
    const trips = getAll().map(t => t.id === id ? { ...t, name } : t);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trips)); } catch (_) {}
  }

  return { getAll, saveTrip, deleteTrip, renameTrip };
})();
