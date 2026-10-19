import { createFileRoute } from "@tanstack/react-router";
import { Bell, Check, Trash2 } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNotifications, notificationsService } from "@/admin/services/misc";

export const Route = createFileRoute("/_adminGuard/admin/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminNotificationsPage,
});

function AdminNotificationsPage() {
  const items = useNotifications();
  return (
    <div>
      <PageHeader
        title="Notifications"
        actions={
          <Button variant="outline" onClick={() => notificationsService.markAllRead()}>
            Mark all read
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {items.map((n) => (
            <div
              key={n.id}
              className={`p-4 flex items-start gap-3 ${!n.read ? "bg-secondary/40" : ""}`}
            >
              <Bell className="size-4 text-primary mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{n.title}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {n.type}
                  </Badge>
                  {!n.read && <Badge className="text-[10px]">new</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1">
                {!n.read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => notificationsService.markRead(n.id)}
                  >
                    <Check className="size-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => notificationsService.remove(n.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">All clear</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
