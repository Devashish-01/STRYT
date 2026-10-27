import { businessService, providerService } from "@/services";
import type { ChatSubject, Story } from "@/types";

/**
 * Who a reply to this story goes to. A person's story goes to that person; a shop's or provider's story goes to
 * the shop's/provider's owner, in a chat that carries the shop/provider as its subject (the same chat the
 * "Message" button on their page opens, so the owner finds it where they already answer customers).
 */
export async function resolveReplyTarget(story: Pick<Story, "authorType" | "userId" | "businessId" | "providerId">): Promise<{
  recipientUserId: string;
  subject?: ChatSubject;
}> {
  if (story.authorType === "business" && story.businessId) {
    const b = await businessService.get(story.businessId);
    if (!b?.ownerUserId) throw new Error("STORY_REPLY_NO_RECIPIENT");
    return { recipientUserId: b.ownerUserId, subject: { type: "business", id: b.id, name: b.name, avatar: b.coverImage, ownerUserId: b.ownerUserId } };
  }
  if (story.authorType === "provider" && story.providerId) {
    const p = await providerService.get(story.providerId);
    if (!p?.userId) throw new Error("STORY_REPLY_NO_RECIPIENT");
    return { recipientUserId: p.userId, subject: { type: "provider", id: p.id, name: p.displayName, avatar: p.avatar, ownerUserId: p.userId } };
  }
  if (!story.userId) throw new Error("STORY_REPLY_NO_RECIPIENT");
  return { recipientUserId: story.userId };
}
