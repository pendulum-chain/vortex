import { create } from "zustand";
import type { AppNotification } from "@/domain/types";

interface NotificationsState {
  items: AppNotification[];
  add: (notification: Omit<AppNotification, "id" | "createdAt" | "read">) => void;
  markAllRead: () => void;
  clear: () => void;
}

export const useNotificationsStore = create<NotificationsState>(set => ({
  add: notification =>
    set(state => ({
      items: [
        {
          ...notification,
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          read: false
        },
        ...state.items
      ]
    })),
  clear: () => set({ items: [] }),
  items: [],
  markAllRead: () => set(state => ({ items: state.items.map(item => ({ ...item, read: true })) }))
}));

export const unreadCount = (items: AppNotification[]) => items.filter(item => !item.read).length;
