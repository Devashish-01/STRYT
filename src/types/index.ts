// Barrel — every existing `@/types` import in the app keeps resolving here
// unchanged. Split by domain (see REORGANIZATION_PLAN.md Priority 3) purely
// for readability; nothing about the public import path changed.
export * from "./marketplace";
export * from "./requests";
export * from "./chat";
export * from "./user";
export * from "./social";
export * from "./console";
