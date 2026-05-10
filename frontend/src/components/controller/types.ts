import type { Layer } from '@/lib/scene'

/**
 * Bundle of mutation/send helpers passed from ControllerPage into the per-type
 * Properties components. State-mutation and send-to-projector are deliberately
 * separate: components call `patch` to update local state + canvas, and call
 * `sendNow`/`sendDebounced`/`sendCurrent` at commit points.
 */
export interface PropertyControls {
  /** Updates the selected layer; returns the new objects array for inline send. */
  patch: (patch: Record<string, unknown>) => Layer[]
  /** Sends the given scene immediately (clears any pending debounce). */
  sendNow: (next: Layer[]) => void
  /** Sends after a quiet period — for rapid input like text typing. */
  sendDebounced: (next: Layer[]) => void
  /** Sends the latest in-memory state. Used by release/blur commits. */
  sendCurrent: () => void
  disabled: boolean
}
