import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/recify/AppLayout';
import { EmptyState } from '@/components/recify/EmptyState';
import { TeamMembersList } from '@/components/recify/team/TeamMembersList';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useTeamMembers, useUpdateTeamMemberRole } from '@/hooks/use-team';
import type { TeamRole } from '@/types/team';
import { getTeamUserErrorMessage, isTeamAbortError } from '@/utils/team-errors';

export default function TeamPage() {
  const { companyId, user } = useAuth();
  const teamQuery = useTeamMembers();
  const updateRole = useUpdateTeamMemberRole();
  const [pendingMemberIds, setPendingMemberIds] = useState<Set<string>>(() => new Set());
  const pendingMemberIdsRef = useRef<Set<string>>(new Set());

  const members = teamQuery.data ?? [];

  const handleRoleChange = useCallback(
    (memberId: string, role: TeamRole) => {
      if (!companyId) return;
      if (pendingMemberIdsRef.current.has(memberId)) return;

      pendingMemberIdsRef.current = new Set(pendingMemberIdsRef.current).add(memberId);
      setPendingMemberIds(pendingMemberIdsRef.current);

      updateRole.mutate(
        { companyId, memberId, role },
        {
          onSuccess: () => {
            toast.success('Rol actualizado');
          },
          onError: (err) => {
            if (isTeamAbortError(err)) return;
            toast.error(
              getTeamUserErrorMessage(err, 'No se pudo actualizar el rol. Intenta de nuevo.'),
            );
          },
          onSettled: () => {
            const next = new Set(pendingMemberIdsRef.current);
            next.delete(memberId);
            pendingMemberIdsRef.current = next;
            setPendingMemberIds(next);
          },
        },
      );
    },
    [companyId, updateRole],
  );

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-gradient-primary p-2 text-primary-foreground">
              <Users size={20} />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Mi equipo</h1>
          </div>
          <p className="text-muted-foreground">
            Integrantes de la compañía activa y sus roles.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-elegant">
          {!companyId ? (
            <EmptyState
              icon={<AlertCircle size={32} />}
              title="Selecciona una compañía"
              description="Elige una compañía para ver a sus integrantes."
            />
          ) : teamQuery.isPending && !teamQuery.data ? (
            <div className="space-y-3 p-6" aria-busy="true" aria-live="polite">
              <span className="sr-only">Cargando equipo</span>
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : teamQuery.isError ? (
            <EmptyState
              icon={<AlertCircle size={32} />}
              title="No se pudo cargar el equipo"
              description={
                getTeamUserErrorMessage(
                  teamQuery.error,
                  'Ocurrió un error al consultar el servidor. Intenta de nuevo.',
                ) || 'Ocurrió un error al consultar el servidor. Intenta de nuevo.'
              }
              action={
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => void teamQuery.refetch()}
                >
                  Reintentar
                </Button>
              }
            />
          ) : members.length === 0 ? (
            <EmptyState
              icon={<Users size={32} />}
              title="Sin integrantes"
              description="Aún no hay miembros en tu equipo."
            />
          ) : (
            <TeamMembersList
              members={members}
              currentUserId={user?._id}
              pendingMemberIds={pendingMemberIds}
              onRoleChange={handleRoleChange}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
