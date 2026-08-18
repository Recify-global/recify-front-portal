import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { TeamRoleSelect } from '@/components/recify/team/TeamRoleSelect';
import type { TeamMember, TeamRole } from '@/types/team';
import {
  TEAM_STATUS_LABELS,
  getTeamMemberDisplayName,
  getTeamMemberInitials,
  isCurrentTeamMember,
} from '@/utils/team-display';

interface TeamMembersListProps {
  members: TeamMember[];
  currentUserId?: string | null;
  pendingMemberIds?: ReadonlySet<string>;
  onRoleChange: (memberId: string, role: TeamRole) => void;
}

function MemberIdentity({
  member,
  isCurrent,
}: {
  member: TeamMember;
  isCurrent: boolean;
}) {
  const displayName = getTeamMemberDisplayName(member);
  const showEmail = displayName !== member.email;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-9 w-9 shrink-0">
        {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
          {getTeamMemberInitials(member)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          {isCurrent ? (
            <Badge variant="secondary" className="font-medium">
              Tú
            </Badge>
          ) : null}
          {member.status ? (
            <Badge variant="outline" className="font-medium">
              {TEAM_STATUS_LABELS[member.status]}
            </Badge>
          ) : null}
        </div>
        {showEmail ? (
          <p className="truncate text-xs text-muted-foreground md:hidden">{member.email}</p>
        ) : null}
      </div>
    </div>
  );
}

export function TeamMembersList({
  members,
  currentUserId,
  pendingMemberIds,
  onRoleChange,
}: TeamMembersListProps) {
  return (
    <div>
      <div className="hidden border-b border-border/60 px-4 py-3 text-sm font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)_12.5rem] md:gap-4">
        <span>Integrante</span>
        <span>Correo</span>
        <span>Rol</span>
      </div>
      <ul>
        {members.map((member) => {
          const displayName = getTeamMemberDisplayName(member);
          return (
            <li
              key={member.id}
              className="grid gap-3 border-b border-border/60 p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)_12.5rem] md:items-center md:gap-4"
            >
              <MemberIdentity
                member={member}
                isCurrent={isCurrentTeamMember(member, currentUserId)}
              />
              <p className="hidden break-all text-sm text-muted-foreground md:block">
                {member.email}
              </p>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground md:hidden">Rol</p>
                <TeamRoleSelect
                  memberId={member.id}
                  memberLabel={displayName}
                  value={member.role}
                  pending={pendingMemberIds?.has(member.id) ?? false}
                  onRoleChange={onRoleChange}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
