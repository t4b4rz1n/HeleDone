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

  const candidates = members.flatMap((item) => {
    if (!item) return [];
    if (item.is_active === false || item.is_deleted === true) return [];
    const directUser = item.user || (!item.team ? item : null);
    const teamUsers = Array.isArray(item.team?.members) ? item.team.members : [];
    return [directUser, ...teamUsers].filter(Boolean);
  });

  for (const u of candidates) {
    if (!u?.username || u.is_active === false || u.is_deleted === true) continue;

    const rawUsername = String(u.username).trim();
    if (!rawUsername) continue;

    const key = rawUsername.toLowerCase();
    if (!map.has(key)) {
      const displayName =
        u.full_name?.trim() || u.name?.trim() ||
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
