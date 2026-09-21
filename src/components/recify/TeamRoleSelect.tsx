import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MembershipRole } from '@/types/auth';

interface TeamRoleSelectProps {
  value: MembershipRole;
  disabled?: boolean;
  pending?: boolean;
  memberName: string;
  onChange: (role: MembershipRole) => void;
}

export function TeamRoleSelect({
  value,
  disabled = false,
  pending = false,
  memberName,
  onChange,
}: TeamRoleSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={value}
        disabled={disabled || pending}
        onValueChange={(next) => onChange(next as MembershipRole)}
      >
        <SelectTrigger
          className="h-9 w-[140px] rounded-lg"
          aria-label={`Rol de ${memberName}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="viewer">viewer</SelectItem>
          <SelectItem value="accountant">accountant</SelectItem>
        </SelectContent>
      </Select>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Guardando rol" />
      ) : null}
    </div>
  );
}
