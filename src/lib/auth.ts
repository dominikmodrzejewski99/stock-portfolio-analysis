import type { User } from "@supabase/supabase-js";
import { OWNER_USER_ID } from "astro:env/server";

export function isOwner(user: User | null): user is User {
  return Boolean(OWNER_USER_ID && user?.id === OWNER_USER_ID);
}
