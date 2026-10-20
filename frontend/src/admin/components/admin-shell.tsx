import type { ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Gem,
  Tags,
  ShoppingBag,
  Users,
  Boxes,
  Home,
  FileText,
  Image as ImageIcon,
  GalleryHorizontal,
  Grid3x3,
  Milestone,
  HelpCircle,
  Star,
  MessageSquare,
  BarChart3,
  Bell,
  Settings,
  LogOut,
  Search,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { adminAuth } from "@/admin/services/admin-auth";
import { useNotifications, notificationsService } from "@/admin/services/misc";
import { toast } from "sonner";

const NAV: Array<{
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
}> = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, group: "Overview" },
  { to: "/admin/products", label: "Products", icon: Package, group: "Catalog" },
  { to: "/admin/accessories", label: "Accessories", icon: Gem, group: "Catalog" },
  { to: "/admin/categories", label: "Categories", icon: Tags, group: "Catalog" },
  { to: "/admin/inventory", label: "Inventory", icon: Boxes, group: "Catalog" },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag, group: "Sales" },
  { to: "/admin/customers", label: "Customers", icon: Users, group: "Sales" },
  { to: "/admin/homepage", label: "Homepage", icon: Home, group: "Content" },
  { to: "/admin/hero-slides", label: "Hero Slides", icon: GalleryHorizontal, group: "Content" },
  { to: "/admin/selected-images", label: "Selected Images", icon: Grid3x3, group: "Content" },
  { to: "/admin/timeline", label: "Company Timeline", icon: Milestone, group: "Content" },
  { to: "/admin/faqs", label: "FAQ", icon: HelpCircle, group: "Content" },
  { to: "/admin/content", label: "Site Content", icon: FileText, group: "Content" },
  { to: "/admin/media", label: "Media Library", icon: ImageIcon, group: "Content" },
  { to: "/admin/reviews", label: "Reviews", icon: Star, group: "Engagement" },
  { to: "/admin/chat", label: "Live Chat", icon: MessageSquare, group: "Engagement" },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, group: "System" },
  { to: "/admin/settings", label: "Settings", icon: Settings, group: "System" },
];

function crumbsFor(pathname: string): Array<{ label: string; to?: string }> {
  const parts = pathname.split("/").filter(Boolean);
  const out: Array<{ label: string; to?: string }> = [{ label: "Admin", to: "/admin" }];
  let acc = "";
  for (const p of parts) {
    acc += `/${p}`;
    if (acc === "/admin") continue;
    const nav = NAV.find((n) => n.to === acc);
    out.push({ label: nav ? nav.label : p.charAt(0).toUpperCase() + p.slice(1), to: acc });
  }
  return out;
}

function AdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/admin" className="flex items-center gap-2 px-2 py-1">
          <div className="size-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-display text-sm">
            V
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display text-sm">Vielinea</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Admin
              </div>
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g}>
            <SidebarGroupLabel>{g}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.filter((n) => n.group === g).map((item) => {
                  const active =
                    item.to === "/admin"
                      ? pathname === "/admin"
                      : pathname === item.to || pathname.startsWith(item.to + "/");
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link to={item.to} className="flex items-center gap-2">
                          <item.icon className="size-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <Link
          to="/"
          className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary px-2 py-1"
        >
          {collapsed ? "↩" : "← View storefront"}
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}

function TopBar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const notifications = useNotifications();
  const unread = notifications.filter((n) => !n.read).length;
  const crumbs = crumbsFor(pathname);
  const session = adminAuth.current();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="flex items-center gap-3 px-4 h-14">
        <SidebarTrigger />
        <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="opacity-50">/</span>}
              {c.to && i < crumbs.length - 1 ? (
                <Link to={c.to} className="hover:text-primary">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground">{c.label}</span>
              )}
            </span>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative hidden md:block w-64">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input placeholder="Search admin..." className="pl-8 h-9" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] rounded-full size-4 flex items-center justify-center">
                  {unread}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium">Notifications</span>
              <button
                onClick={() => notificationsService.markAllRead()}
                className="text-[10px] uppercase tracking-widest text-primary hover:underline"
              >
                Mark all read
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground text-center">All clear</div>
              )}
              {notifications.slice(0, 8).map((n) => (
                <div
                  key={n.id}
                  className={`p-3 border-b border-border last:border-b-0 ${!n.read ? "bg-secondary/40" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                    </div>
                    {!n.read && (
                      <Badge variant="secondary" className="text-[9px]">
                        new
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-border">
              <Link
                to="/admin/notifications"
                className="block text-center text-xs text-primary hover:underline py-1"
              >
                View all
              </Link>
            </div>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1 rounded hover:bg-secondary">
              <div className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                {(session?.name ?? "A").charAt(0)}
              </div>
              <div className="hidden md:block text-left leading-tight">
                <div className="text-xs font-medium">{session?.name ?? "Admin"}</div>
                <div className="text-[10px] text-muted-foreground">{session?.email}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/admin/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/">View storefront</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                adminAuth.logout();
                toast("Signed out");
                navigate({ to: "/admin/login" });
              }}
            >
              <LogOut className="size-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 p-6 md:p-8 min-w-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    // Wraps on narrow screens: the actions drop under the title instead of
    // pushing the page wider than the viewport.
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="font-display text-3xl md:text-4xl text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
