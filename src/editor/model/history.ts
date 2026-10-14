// Undo/redo for the editor document. Consecutive changes with the same coalescing key (a slider
// drag, moving one shape) replace the present instead of pushing, so they undo as one step.
// `seal` ends the run, e.g. on pointer up.

export const HISTORY_LIMIT = 100;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Key of the change that produced `present` while its run is still open. */
  openKey: string | null;
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], openKey: null };
}

export function apply<T>(h: History<T>, next: T, key: string | null = null): History<T> {
  if (next === h.present) return h;
  if (key !== null && key === h.openKey) {
    return { ...h, present: next, future: [] };
  }
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [], openKey: key };
}

export function seal<T>(h: History<T>): History<T> {
  return h.openKey === null ? h : { ...h, openKey: null };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return seal(h);
  const past = h.past.slice(0, -1);
  return {
    past,
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    openKey: null,
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return seal(h);
  const [present, ...future] = h.future;
  return { past: [...h.past, h.present], present, future, openKey: null };
}

/** Replaces the present without an undo step (e.g. loading a new screenshot). */
export function reset<T>(present: T): History<T> {
  return createHistory(present);
}
