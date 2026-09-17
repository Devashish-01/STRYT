/** Which section of the admin panel is showing, and which queue AdminQueue is listing. Their own
 *  module because the panel picks the tab and the tab component reads the queue type. */
export type Tab = "dashboard" | "queue" | "verification" | "location" | "disputes" | "appeals" | "reports" | "bugs" | "profiles" | "account";
export type QueueType = "business" | "provider" | "category" | "place";
