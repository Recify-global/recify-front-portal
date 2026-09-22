import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { ApiRequestError } from '@/api/http';
import { AppLayout } from '@/components/recify/AppLayout';
import { AddTeamMemberDialog } from '@/components/recify/AddTeamMemberDialog';
import { TeamMembersList } from '@/components/recify/TeamMembersList';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAddTeamMember,
  useRemoveTeamMember,
  useTeamMembers,
  useUpdateTeamMemberRole,
} from '@/hooks/use-team-members';
import { useAuth } from '@/hooks/use-auth';
import type { MembershipRole } from '@/types/auth';
import type { AddTeamMemberInput, TeamMember } from '@/types/team';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

export default function TeamPage() {
  const { companyId, user, canManage } = useAuth();
  const [page, setPage] = useState(1);
  const membersQuery = useTeamMembers({ page, limit: 20 });
  const addMutation = useAddTeamMember();
  const roleMutation = useUpdateTeamMemberRole();
  const removeMutation = useRemoveTeamMember();

  useEffect(() => setPage(1), [companyId]);

  const handleAdd = async (input: AddTeamMemberInput) => {
    if (!companyId) throw new Error('No active company');
    try {
      const result = await addMutation.mutateAsync({ companyId, input });
      toast.success(
        result.member.kind === 'pending'
          ? 'Integrante registrado como pending.'
          : 'Integrante agregado al equipo.',
      );
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo agregar al integrante.'));
      throw error;
    }
  };

  const handleRoleChange = async (member: TeamMember, role: MembershipRole) => {
    if (!companyId || role === member.role) return;
    try {
      await roleMutation.mutateAsync({ companyId, memberId: member.id, role });
      toast.success('Rol actualizado.');
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo actualizar el rol.'));
    }
  };

  const handleRemove = async (member: TeamMember) => {
    if (!companyId) return;
    try {
      await removeMutation.mutateAsync({ companyId, memberId: member.id });
      toast.success(
        member.kind === 'pending'
          ? 'Pending removido del equipo.'
          : 'Acceso removido de esta empresa.',
      );
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo remover al integrante.'));
      throw error;
    }
  };

  const members = membersQuery.data?.data ?? [];
  const pages = membersQuery.data?.pages ?? 1;

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">Mi equipo</h1>
            <p className="mt-1 text-muted-foreground">
              Administra las personas que tienen acceso a esta empresa.
            </p>
          </div>
          {canManage ? (
            <AddTeamMemberDialog
              pending={addMutation.isPending}
              onAdd={handleAdd}
            />
          ) : null}
        </header>

        {membersQuery.isLoading ? (
          <div className="space-y-3" aria-label="Cargando equipo">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : membersQuery.isError ? (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-card p-6 text-center"
          >
            <p className="text-sm text-destructive">
              No se pudo cargar el equipo de esta empresa.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => void membersQuery.refetch()}
            >
              Reintentar
            </Button>
          </div>
        ) : members.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-border/50 bg-card p-8 text-center shadow-elegant">
            <div className="mb-4 rounded-2xl bg-accent p-4 text-accent-foreground">
              <Users size={32} />
            </div>
            <h2 className="font-semibold text-foreground">Mi equipo</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Todavía no hay integrantes adicionales en tu equipo.
            </p>
          </div>
        ) : (
          <>
            <TeamMembersList
              members={members}
              currentUserId={user?._id}
              canManage={canManage}
              rolePendingId={
                roleMutation.isPending ? roleMutation.variables?.memberId : undefined
              }
              removePendingId={
                removeMutation.isPending
                  ? removeMutation.variables?.memberId
                  : undefined
              }
              onRoleChange={handleRoleChange}
              onRemove={handleRemove}
            />
            {pages > 1 ? (
              <nav
                className="flex items-center justify-center gap-3"
                aria-label="Paginación del equipo"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(pages, current + 1))}
                  disabled={page >= pages}
                >
                  Siguiente
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </AppLayout>
  );
}
