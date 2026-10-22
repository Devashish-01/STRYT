import type { Business } from "@/types";
import type { FeatureContext } from "@/lib/businessFeatures";
import { hoursAreDefault } from "./capabilities";

/** What the "Add features" catalogue needs to know about a business, read from the same fields the console already loads. */
export function featureContextFor(args: {
  business: Business | undefined;
  queueUsed: boolean;
  bookingsOn: boolean;
  deliveryFlag: boolean;
  isOwner: boolean;
}): FeatureContext {
  const { business } = args;
  return {
    bookingsOn: args.bookingsOn,
    deliveryOn: business?.deliveryEnabled === true,
    queueUsed: args.queueUsed,
    catalogCount: business?.catalog?.length ?? 0,
    galleryCount: business?.gallery?.length ?? 0,
    hoursSet: !hoursAreDefault(business?.hours),
    verified: !!business?.isVerified || !!business?.verificationStatus,
    deliveryFlag: args.deliveryFlag,
    isOwner: args.isOwner,
  };
}
