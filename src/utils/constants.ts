// Was off because the "me too" join action had no button anywhere in the UI,
// so the progress bar was advertising an interaction that didn't exist.
// That's resolved: JoinGroupBuySheet ships a real quantity-carrying join
// (requestService.joinGroupBuy → group_buy_join RPC), reachable from the /bulk
// hub and every GroupBuyCard, so the counts now reflect something a user can
// actually do.
export const GROUP_BUY_PROGRESS_ENABLED = true;

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
