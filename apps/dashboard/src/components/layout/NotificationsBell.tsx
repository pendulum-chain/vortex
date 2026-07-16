import { Bell, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { unreadCount, useNotificationsStore } from "@/stores/notifications.store";

export function NotificationsBell() {
  const items = useNotificationsStore(state => state.items);
  const markAllRead = useNotificationsStore(state => state.markAllRead);
  const unread = unreadCount(items);

  return (
    <Popover onOpenChange={open => open && unread > 0 && markAllRead()}>
      <PopoverTrigger asChild>
        <Button aria-label="Notifications" className="relative" size="icon" variant="outline">
          <Bell />
          {unread > 0 && (
            <span className="-top-1 -right-1 absolute flex size-4 items-center justify-center rounded-full bg-destructive font-medium text-[10px] text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-medium text-sm">Email updates</p>
          {items.length > 0 && <span className="text-muted-foreground text-xs">{items.length}</span>}
        </div>
        <Separator />
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MailCheck className="size-6 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No updates yet. Completion emails will show up here.</p>
          </div>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {items.map(item => (
              <li className="grid gap-1 px-4 py-3" key={item.id}>
                <div className="flex items-start gap-2">
                  <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="grid gap-0.5">
                    <p className="font-medium text-sm leading-snug">{item.title}</p>
                    <p className="text-muted-foreground text-xs leading-snug">{item.body}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
