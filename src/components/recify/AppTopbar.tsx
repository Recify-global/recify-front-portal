import { Bell, LogOut, Search } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';

function computeInitials(name: string | undefined): string {
  if (!name) return 'R';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'R';
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase() || 'R';
}

export function AppTopbar() {
  const { user, logout } = useAuth();
  const displayName = user?.name?.trim() || 'Usuario';
  const initials = computeInitials(user?.name);

  return (
    <header className="h-16 border-b border-border/50 bg-card flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="lg:hidden" />
        <div className="hidden sm:flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 w-64">
          <Search size={16} className="text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar tickets..."
            className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="p-2 rounded-xl hover:bg-secondary transition-colors relative">
          <Bell size={18} className="text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2.5 bg-transparent border-0 p-0 focus:outline-none">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs font-medium">{initials}</AvatarFallback>
            </Avatar>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-foreground leading-none">{displayName}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <span className="font-medium text-foreground">{displayName}</span>
                {user?.email ? (
                  <span className="text-xs text-muted-foreground font-normal">{user.email}</span>
                ) : null}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut size={14} className="mr-2" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
