// Barrel — every existing `@/services` import in the app keeps resolving
// here unchanged. Grouped into core/marketplace/engagement subfolders (see
// REORGANIZATION_PLAN.md Priority 4) purely for readability.
export { authService } from "./core/authService";
export { catalogService } from "./marketplace/catalogService";
export { discoveryService } from "./marketplace/discoveryService";
export { businessService, bustBusinessGetCache } from "./marketplace/businessService";
export { businessAccessService } from "./marketplace/businessAccessService";
export { providerService, bustProviderGetCache } from "./marketplace/providerService";
export { requestService } from "./engagement/requestService";
export { uploadService } from "./core/uploadService";
export { adminService } from "./core/adminService";
export { socialService } from "./engagement/socialService";
export { communityService } from "./engagement/communityService";
export { walletService } from "./engagement/walletService";
export { userService } from "./core/userService";
export { notificationService } from "./engagement/notificationService";
export { chatService } from "./engagement/chatService";
export { societyService } from "./engagement/societyService";
export { subscriptionService } from "./engagement/subscriptionService";
export { proService, PRO_PLANS, LEAD_PACKS } from "./core/proService";
export { aiService } from "./core/aiService";
export { supportService } from "./core/supportService";
export { appointmentService } from "./engagement/appointmentService";
export { deliveryService } from "./engagement/deliveryService";
export { slotBlockService } from "./engagement/slotBlockService";
export { locationService } from "./engagement/locationService";
export { emergencyService } from "./engagement/emergencyService";
export { profileControlService } from "./core/profileControlService";
export { entityPasswordService } from "./core/entityPasswordService";
export type {
  EntityPasswordKind,
  EntityRecoveryQuestion,
  EntityRecoveryQuestionId,
  BusinessRecoveryQuestionId,
  ProviderRecoveryQuestionId,
} from "./core/entityPasswordService";
export {
  BUSINESS_RECOVERY_QUESTION_IDS,
  PROVIDER_RECOVERY_QUESTION_IDS,
} from "./core/entityPasswordService";
