/**
 * Geofence Uncertainty & Hysteresis Engine
 *
 * Implements statistically sound geographical boundary evaluation:
 * 1. Conservative Geofence Entry: Requires the 68% confidence uncertainty disk
 *    to fit completely inside the boundary: (distance + accuracy) <= (radius - epsilon)
 * 2. Confident Geofence Exit: Requires the uncertainty disk to be outside:
 *    (distance - accuracy) >= (radius + epsilon)
 * 3. Hysteresis Buffer: Preserves previous state when reading falls in the
 *    uncertainty gap between (R - epsilon) and (R + epsilon), preventing flutter.
 * 4. Multi-Sample Debouncer: Requires N consecutive stable readings before
 *    firing state changes.
 */

export interface GeofenceEvaluationParams {
  distanceMeters: number;
  accuracyMeters?: number;
  radiusMeters: number;
  /** Buffer zone in meters to prevent edge fluttering (default: 20m) */
  epsilonMeters?: number;
  /** Current state of the subject relative to the geofence */
  currentState?: "INSIDE" | "OUTSIDE" | "UNKNOWN";
}

export type GeofenceState = "INSIDE" | "OUTSIDE";

/**
 * Evaluates whether an uncertain GPS fix is strictly inside the geofence.
 * Formula: (distance + accuracy) <= (radius - epsilon)
 */
export function isInsideGeofenceConservative(
  distanceMeters: number,
  accuracyMeters: number = 0,
  radiusMeters: number,
  epsilonMeters: number = 20,
): boolean {
  if (distanceMeters < 0 || radiusMeters <= 0) return false;
  const effectiveAcc = Math.max(0, accuracyMeters);
  return (distanceMeters + effectiveAcc) <= Math.max(0, radiusMeters - epsilonMeters);
}

/**
 * Evaluates whether an uncertain GPS fix is confident outside the geofence.
 * Formula: (distance - accuracy) >= (radius + epsilon)
 */
export function isOutsideGeofenceConfident(
  distanceMeters: number,
  accuracyMeters: number = 0,
  radiusMeters: number,
  epsilonMeters: number = 20,
): boolean {
  if (distanceMeters < 0) return true;
  const effectiveAcc = Math.max(0, accuracyMeters);
  return (distanceMeters - effectiveAcc) >= (radiusMeters + epsilonMeters);
}

/**
 * Evaluates state with hysteresis: returns new state or retains currentState if in buffer.
 */
export function evaluateGeofenceState(params: GeofenceEvaluationParams): GeofenceState {
  const {
    distanceMeters,
    accuracyMeters = 0,
    radiusMeters,
    epsilonMeters = 20,
    currentState = "UNKNOWN",
  } = params;

  if (isInsideGeofenceConservative(distanceMeters, accuracyMeters, radiusMeters, epsilonMeters)) {
    return "INSIDE";
  }

  if (isOutsideGeofenceConfident(distanceMeters, accuracyMeters, radiusMeters, epsilonMeters)) {
    return "OUTSIDE";
  }

  // Inside the buffer zone [R - epsilon, R + epsilon]:
  // Retain existing state to prevent oscillating flutter
  if (currentState === "INSIDE" || currentState === "OUTSIDE") {
    return currentState;
  }

  // Fallback for initial fix falling in buffer: conservative default is OUTSIDE
  return "OUTSIDE";
}

/**
 * Multi-sample debouncer requiring N consecutive consistent evaluations
 * before transitioning states.
 */
export class GeofenceDebouncer {
  private currentState: GeofenceState;
  private consecutiveCount: number = 0;
  private pendingState: GeofenceState | null = null;
  private readonly requiredSamples: number;

  constructor(initialState: GeofenceState = "OUTSIDE", requiredSamples: number = 2) {
    this.currentState = initialState;
    this.requiredSamples = Math.max(1, requiredSamples);
  }

  getState(): GeofenceState {
    return this.currentState;
  }

  /**
   * Pushes a new raw fix evaluation. Returns true if this fix triggered
   * a confirmed state transition.
   */
  push(params: Omit<GeofenceEvaluationParams, "currentState">): {
    state: GeofenceState;
    didTransition: boolean;
  } {
    const rawState = evaluateGeofenceState({
      ...params,
      currentState: this.currentState,
    });

    if (rawState === this.currentState) {
      this.pendingState = null;
      this.consecutiveCount = 0;
      return { state: this.currentState, didTransition: false };
    }

    if (this.pendingState === rawState) {
      this.consecutiveCount += 1;
    } else {
      this.pendingState = rawState;
      this.consecutiveCount = 1;
    }

    if (this.consecutiveCount >= this.requiredSamples) {
      this.currentState = rawState;
      this.pendingState = null;
      this.consecutiveCount = 0;
      return { state: this.currentState, didTransition: true };
    }

    return { state: this.currentState, didTransition: false };
  }
}
