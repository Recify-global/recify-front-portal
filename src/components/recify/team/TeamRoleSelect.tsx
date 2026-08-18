import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TEAM_ROLES, type TeamRole } from '@/types/team';
import { isTeamRole } from '@/mappers/team.mapper';
import { TEAM_ROLE_LABELS } from '@/utils/team-display';

interface TeamRoleSelectProps {
  memberId: string;
  memberLabel: string;
  value: TeamRole;
  disabled?: boolean;
  pending?: boolean;
  onRoleChange: (memberId: string, role: TeamRole) => void;
}

export function TeamRoleSelect({
  memberId,
  memberLabel,
  value,
  disabled = false,
  pending = false,
  onRoleChange,
}: TeamRoleSelectProps) {
  const isDisabled = disabled || pending;

  return (
    <div className="flex items-center gap-2">
      <Select
        value={value}
        disabled={isDisabled}
        onValueChange={(next) => {
          if (isDisabled || !isTeamRole(next) || next === value) return;
          onRoleChange(memberId, next);
        }}
      >
        <SelectTrigger
          className="h-10 w-full min-w-0 rounded-xl"
          aria-label={`Rol de ${memberLabel}`}
          aria-busy={pending}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TEAM_ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {TEAM_ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      ) : null}
    </div>
  );
}
