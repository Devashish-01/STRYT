// Temporary kill-switch: the "me too" join action was never wired to a button
// anywhere in the UI (toggleMeToo/requestService.meToo exist but have zero call
// sites), yet the group-buy progress bar + broadcast-quote checkbox still
// displayed the resulting counts, implying an interaction that doesn't exist.
// Flip back to true to restore that display once the join button ships for real.
export const GROUP_BUY_PROGRESS_ENABLED = false;

export const RADIUS_OPTIONS = [
  { label: "500m", km: 0.5 },
  { label: "1 km",  km: 1 },
  { label: "2 km",  km: 2 },
  { label: "5 km",  km: 5 },
  { label: "10 km", km: 10 },
  { label: "25 km", km: 25 },
  { label: "50 km", km: 50 },
  { label: "100 km", km: 100 },
  { label: "🌍 World", km: 20000 },
];
