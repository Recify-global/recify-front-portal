import { Bell, Search } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SidebarTrigger } from '@/components/ui/sidebar';

export function AppTopbar() {
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
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs font-medium">MR</AvatarFallback>
          </Avatar>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-foreground leading-none">María Rodríguez</p>
            <p className="text-xs text-muted-foreground">Mi Negocio</p>
          </div>
        </div>
      </div>
    </header>
  );
}
