import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { MembershipRole } from '@/types/auth';
import type { TeamMember } from '@/types/team';
import { TeamRoleSelect } from './TeamRoleSelect';

interface TeamMembersListProps {
  members: TeamMember[];
  currentUserId?: string;
  canManage: boolean;
  rolePendingId?: string;
  removePendingId?: string;
  onRoleChange: (member: TeamMember, role: MembershipRole) => Promise<void>;
  onRemove: (member: TeamMember) => Promise<void>;
}

function StatusBadge({ status }: { status: TeamMember['status'] }) {
  return (
    <Badge variant={status === 'active' ? 'secondary' : 'outline'}>
      {status}
    </Badge>
  );
}

function Identity({ member, isSelf }: { member: TeamMember; isSelf: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="truncate font-medium text-foreground">{member.name}</span>
        {isSelf ? <Badge variant="outline">Tú</Badge> : null}
      </div>
      <p className="truncate text-sm text-muted-foreground md:hidden">{member.email}</p>
    </div>
  );
}

function MemberActions({
  member,
  canManage,
  rolePending,
  removePending,
  onRoleChange,
  onRequestRemove,
}: {
  member: TeamMember;
  canManage: boolean;
  rolePending: boolean;
  removePending: boolean;
  onRoleChange: (role: MembershipRole) => void;
  onRequestRemove: () => void;
}) {
  if (!canManage) return <span className="text-sm">{member.role}</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TeamRoleSelect
        value={member.role}
        memberName={member.name}
        pending={rolePending}
        disabled={removePending}
        onChange={onRoleChange}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        disabled={rolePending || removePending}
        onClick={onRequestRemove}
        aria-label={`Remover a ${member.name} del equipo`}
      >
        {removePending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="mr-2 h-4 w-4" />
        )}
        Remover
      </Button>
    </div>
  );
}

export function TeamMembersList({
  members,
  currentUserId,
  canManage,
  rolePendingId,
  removePendingId,
  onRoleChange,
  onRemove,
}: TeamMembersListProps) {
  const [selectedForRemoval, setSelectedForRemoval] = useState<TeamMember | null>(null);

  const actions = (member: TeamMember) => (
    <MemberActions
      member={member}
      canManage={canManage}
      rolePending={rolePendingId === member.id}
      removePending={removePendingId === member.id}
      onRoleChange={(role) => void onRoleChange(member, role)}
      onRequestRemove={() => setSelectedForRemoval(member)}
    />
  );

  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-border/50 bg-card shadow-elegant md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>RFC</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              {canManage ? <TableHead>Acciones</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <Identity member={member} isSelf={member.userId === currentUserId} />
                </TableCell>
                <TableCell>{member.email}</TableCell>
                <TableCell>{member.phone || '—'}</TableCell>
                <TableCell>{member.rfc || '—'}</TableCell>
                <TableCell>
                  {canManage ? (
                    <TeamRoleSelect
                      value={member.role}
                      memberName={member.name}
                      pending={rolePendingId === member.id}
                      disabled={removePendingId === member.id}
                      onChange={(role) => void onRoleChange(member, role)}
                    />
                  ) : (
                    <span>{member.role}</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={member.status} />
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={
                        rolePendingId === member.id || removePendingId === member.id
                      }
                      onClick={() => setSelectedForRemoval(member)}
                      aria-label={`Remover a ${member.name} del equipo`}
                    >
                      {removePendingId === member.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Remover
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {members.map((member) => (
          <article
            key={member.id}
            className="space-y-4 rounded-2xl border border-border/50 bg-card p-4 shadow-elegant"
          >
            <div className="flex items-start justify-between gap-3">
              <Identity member={member} isSelf={member.userId === currentUserId} />
              <StatusBadge status={member.status} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Teléfono</dt>
                <dd>{member.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">RFC</dt>
                <dd>{member.rfc || '—'}</dd>
              </div>
            </dl>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Rol
              </p>
              {actions(member)}
            </div>
          </article>
        ))}
      </div>

      <AlertDialog
        open={Boolean(selectedForRemoval)}
        onOpenChange={(open) => {
          if (!open && !removePendingId) setSelectedForRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover del equipo</AlertDialogTitle>
            <AlertDialogDescription>
              Se removerá el acceso de {selectedForRemoval?.name} a esta empresa.
              Su cuenta global y accesos a otras empresas no se eliminarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(removePendingId)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(removePendingId)}
              onClick={async (event) => {
                event.preventDefault();
                if (!selectedForRemoval) return;
                try {
                  await onRemove(selectedForRemoval);
                  setSelectedForRemoval(null);
                } catch {
                  // The page reports the API error and the dialog remains open.
                }
              }}
            >
              {removePendingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remover del equipo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
