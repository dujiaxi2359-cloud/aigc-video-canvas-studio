import type { User } from "@/lib/auth/authTypes";

// Current version is license-only mode. Future user-account mode can return
// the authenticated user from Supabase Auth, Clerk, NextAuth, or another provider.
export async function getCurrentUser(): Promise<User | null> {
  return null;
}
