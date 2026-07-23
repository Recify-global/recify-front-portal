import { LayoutDashboard, Upload, History, FileText, Settings, HelpCircle } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { RecifyLogo } from './RecifyLogo';
import { CompanySelector } from './CompanySelector';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

const mainNav = [
  { title: 'Subir tickets y facturas', url: '/app/upload', icon: Upload },
  { title: 'Tickets', url: '/app/history', icon: History },
  { title: 'Facturas', url: '/app/invoices', icon: FileText },
  { title: 'Dashboard', url: '/app/dashboard', icon: LayoutDashboard },
];

const secondaryNav = [
  { title: 'Configuración', url: '#', icon: Settings },
  { title: 'Ayuda', url: '#', icon: HelpCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <div className="p-4">
        <RecifyLogo size={collapsed ? 'sm' : 'md'} showIcon />
      </div>
      <div className={collapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <CompanySelector collapsed={collapsed} />
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-secondary/80 rounded-xl transition-colors"
                      activeClassName="bg-accent text-accent-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url} className="hover:bg-secondary/80 rounded-xl transition-colors text-muted-foreground">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
