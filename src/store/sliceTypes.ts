import type { BookmarkTarget } from "@/types";

export interface BookmarkKey {
  type: BookmarkTarget;
  id: string;
}

export interface FollowKey {
  type: "BUSINESS" | "PROVIDER" | "USER";
  id: string;
}

export interface ListItem {
  type: BookmarkTarget;
  id: string;
}

export interface UserList {
  id: string;
  name: string;
  emoji: string;
  shared: boolean;
  items: ListItem[];
}
