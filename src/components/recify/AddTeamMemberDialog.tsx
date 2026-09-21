import { type FormEvent, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MembershipRole } from '@/types/auth';
import type { AddTeamMemberInput } from '@/types/team';

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;
const PHONE_REGEX = /^\+?[0-9 ()-]{7,25}$/;

interface AddTeamMemberDialogProps {
  pending: boolean;
  onAdd: (input: AddTeamMemberInput) => Promise<void>;
}

const initialForm = {
  name: '',
  email: '',
  phone: '',
  rfc: '',
  role: 'viewer' as MembershipRole,
};

export function AddTeamMemberDialog({
  pending,
  onAdd,
}: AddTeamMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    if (!next) {
      setForm(initialForm);
      setError(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const rfc = form.rfc.trim().toUpperCase();

    if (!name) return setError('El nombre es obligatorio.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setError('Ingresa un email válido.');
    }
    if (!PHONE_REGEX.test(phone)) {
      return setError('Ingresa un teléfono válido.');
    }
    if (rfc && !RFC_REGEX.test(rfc)) {
      return setError('Ingresa un RFC válido de 12 o 13 caracteres.');
    }

    setError(null);
    try {
      await onAdd({
        name,
        email,
        phone,
        ...(rfc ? { rfc } : {}),
        role: form.role,
      });
      handleOpenChange(false);
    } catch {
      // The page reports the API error; keep the form open for correction/retry.
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="rounded-xl">
          <Plus className="mr-2 h-4 w-4" />
          Agregar integrante
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar integrante</DialogTitle>
          <DialogDescription>
            Si el email ya tiene una cuenta, recibirá acceso a esta empresa. Si no,
            quedará como pending.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="team-member-name">Nombre *</Label>
            <Input
              id="team-member-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              autoComplete="name"
              maxLength={120}
              disabled={pending}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-member-email">Email *</Label>
            <Input
              id="team-member-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              autoComplete="email"
              maxLength={254}
              disabled={pending}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-member-phone">Teléfono *</Label>
            <Input
              id="team-member-phone"
              type="tel"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              autoComplete="tel"
              maxLength={25}
              disabled={pending}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-member-rfc">RFC</Label>
            <Input
              id="team-member-rfc"
              value={form.rfc}
              onChange={(event) => setForm((current) => ({ ...current, rfc: event.target.value }))}
              autoCapitalize="characters"
              maxLength={13}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-member-role">Rol *</Label>
            <Select
              value={form.role}
              disabled={pending}
              onValueChange={(role) =>
                setForm((current) => ({ ...current, role: role as MembershipRole }))
              }
            >
              <SelectTrigger id="team-member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">viewer</SelectItem>
                <SelectItem value="accountant">accountant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Agregar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
