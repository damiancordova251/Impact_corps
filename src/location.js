import { APP_CONFIG } from "./config.js";

export class LocationAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LocationAccessError";
    this.code = code;
  }
}

export function getCurrentLocation() {
  if (!window.isSecureContext) {
    throw new LocationAccessError(
      "INSECURE_CONTEXT",
      "Location needs HTTPS or localhost."
    );
  }

  if (!("geolocation" in navigator)) {
    throw new LocationAccessError(
      "UNSUPPORTED",
      "Location is not available on this device."
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(toLocationAccessError(error));
      },
      APP_CONFIG.geolocationOptions
    );
  });
}

function toLocationAccessError(error) {
  if (error.code === error.PERMISSION_DENIED) {
    return new LocationAccessError(
      "DENIED",
      "Location permission is off."
    );
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return new LocationAccessError(
      "UNAVAILABLE",
      "Location is unavailable right now."
    );
  }

  if (error.code === error.TIMEOUT) {
    return new LocationAccessError(
      "TIMEOUT",
      "Location took too long."
    );
  }

  return new LocationAccessError(
    "UNKNOWN",
    "Location could not be found."
  );
}
