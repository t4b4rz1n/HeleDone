export interface MentionUser {
  id: string | number;
  username: string;
  displayName: string;
  avatar?: string | null;
  email?: string | null;
}

/**
 * Normalizes various project member formats into clean MentionUser objects.
 * Guarantees only unique, valid members of the specified project are returned.
 */
export const normalizeProjectMembers = (members: any[]): MentionUser[] => {
  if (!Array.isArray(members)) return [];
  const map = new Map<string, MentionUser>();

  for (const item of members) {
    if (!item) continue;
    const u = item.user || item;
    if (!u || !u.username) continue;

    const rawUsername = String(u.username).trim();
    if (!rawUsername) continue;

    const key = rawUsername.toLowerCase();
    if (!map.has(key)) {
      const displayName =
        u.full_name?.trim() ||
        [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
        rawUsername;

      map.set(key, {
        id: u.id,
        username: rawUsername,
        displayName,
        avatar: u.avatar_url || u.avatar || null,
        email: u.email || null,
      });
    }
  }

  return Array.from(map.values());
};
