export type BookingStatus = "accepting" | "paused" | "off";

export function bookingStatus(bookingsEnabled: boolean, accepting: boolean): BookingStatus {
  if (!bookingsEnabled) return "off";
  return accepting ? "accepting" : "paused";
}
