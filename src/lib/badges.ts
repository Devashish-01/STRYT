// Centralized thresholds for the app's three independent badge surfaces
// (profile badge chips, the Achievements screen, provider detail badges).
// Each used to hardcode its own numbers inline, and "Trusted" meant two
// different things in two places (5 vouches vs 10 ratings) — renamed the
// profile-chip one to disambiguate; every number now lives here once.

export const PROFILE_BADGE_THRESHOLDS = {
  goodNeighbor: 1, // helped count
  topHelper: 20, // helped count
  activeMember: 3, // requests posted
  wellVouched: 5, // vouches received — was mislabeled "Trusted", collided with the achievement below
};

export const ACHIEVEMENT_THRESHOLDS = {
  firstRequest: 1,
  dealMaker: 1,
  helper: 5,
  fiveStar: 1,
  trusted: 10, // total ratings received
  vouchGiver: 3,
};

export const PROVIDER_BADGE_THRESHOLDS = {
  topRatedMinRating: 4.5,
  topRatedMinReviews: 5,
  fastResponderMaxHrs: 2,
  jobsMilestone: 100,
};
