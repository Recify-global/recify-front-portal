import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ApiRequestError } from '@/api/http';
import { getStoredCompanyId } from '@/auth/storage';
import { AppLayout } from '@/components/recify/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompanyProfile, useUpdateCompanyName } from '@/hooks/use-company-settings';
import { useAuth } from '@/hooks/use-auth';

function isAbortError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError';
}

export default function SettingsPage() {
  const { companyId, canManage } = useAuth();
  const profile = useCompanyProfile();
  const updateName = useUpdateCompanyName();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setName('');
    setFormError(null);
  }, [companyId]);

  useEffect(() => {
    if (!editing && profile.data?.name) setName(profile.data.name);
  }, [editing, profile.data?.name, companyId]);

  const startEditing = () => {
    setName(profile.data?.name ?? '');
    setFormError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setName(profile.data?.name ?? '');
    setFormError(null);
    setEditing(false);
  };

  const save = async () => {
    if (!companyId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    const editedCompanyId = companyId;
    setFormError(null);
    try {
      await updateName.mutateAsync({ companyId: editedCompanyId, name: trimmed });
      if (getStoredCompanyId() !== editedCompanyId) return;
      setEditing(false);
      toast.success('Nombre actualizado.');
    } catch (error) {
      const message = error instanceof ApiRequestError
        ? error.message
        : 'No se pudo actualizar el nombre.';
      setFormError(message);
      toast.error(message);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
        <header>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Configuración</h1>
          <p className="mt-1 text-muted-foreground">
            Información de la empresa activa.
          </p>
        </header>

        {profile.isLoading || isAbortError(profile.error) ? (
          <Skeleton className="h-40 w-full rounded-2xl" aria-label="Cargando empresa" />
        ) : profile.isError ? (
          <div role="alert" className="rounded-2xl border border-destructive/30 bg-card p-6">
            <p className="text-sm text-destructive">No se pudo cargar la empresa.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => void profile.refetch()}
            >
              Reintentar
            </Button>
          </div>
        ) : (
          <section className="space-y-5 rounded-2xl border border-border/50 bg-card p-6 shadow-elegant">
            <h2 className="font-semibold text-foreground">Información de la empresa</h2>
            <div className="space-y-2">
              <Label htmlFor="company-name">Nombre</Label>
              {editing ? (
                <Input
                  id="company-name"
                  value={name}
                  maxLength={200}
                  onChange={(event) => setName(event.target.value)}
                  disabled={updateName.isPending}
                />
              ) : (
                <p id="company-name" className="text-sm text-foreground">{profile.data?.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-rfc">RFC</Label>
              <p id="company-rfc" className="text-sm text-muted-foreground">
                {profile.data?.rfcMasked || '—'}
              </p>
            </div>
            {formError ? (
              <p role="alert" className="text-sm text-destructive">{formError}</p>
            ) : null}
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                {editing ? (
                  <>
                    <Button type="button" onClick={() => void save()} disabled={updateName.isPending}>
                      {updateName.isPending ? 'Guardando…' : 'Guardar'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={cancelEditing}
                      disabled={updateName.isPending}
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="outline" onClick={startEditing}>
                    Editar nombre
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Solo quien administra la empresa puede cambiar el nombre.
              </p>
            )}
          </section>
        )}
      </div>
    </AppLayout>
  );
}
