import type { ProjectMember } from '../../projects/types';
import type { User } from '../types';

/** Project member responses can also contain team entries without a user. */
export function projectMemberUsers(members: ProjectMember[]): User[] {
  return members
    .filter((member) => member.is_active && member.user?.id)
    .map((member) => {
      const user = member.user!;
      return {
        id: user.id,
        username: user.username ?? '',
        email: user.email ?? '',
        first_name: user.first_name ?? '',
        last_name: user.last_name ?? '',
        full_name: user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '',
        avatar: user.avatar ?? undefined,
        avatar_url: user.avatar_url ?? user.avatar ?? undefined,
      };
    });
}
