import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export const nativeGeolocation = {
  getCurrentPosition: (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions
  ) => {
    if (Capacitor.isNativePlatform()) {
      Geolocation.getCurrentPosition({
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? 10000,
        maximumAge: options?.maximumAge ?? 0,
      })
        .then((pos) => {
          successCallback({
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude,
              altitudeAccuracy: pos.coords.altitudeAccuracy,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
            },
            timestamp: pos.timestamp,
          } as GeolocationPosition);
        })
        .catch((err) => {
          if (errorCallback) {
            errorCallback({
              code: err.code || 3, // Fallback to 3 (TIMEOUT)
              message: err.message || "Failed to retrieve native location",
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError);
          }
        });
    } else {
      navigator.geolocation.getCurrentPosition(
        successCallback,
        errorCallback || undefined,
        options
      );
    }
  },
};
