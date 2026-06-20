/**
 * Multi-Device Realtime Sync Service (Phase 8.1)
 *
 * Uses Supabase Realtime subscriptions to keep multiple tabs/devices in sync.
 *
 * Subscriptions:
 * - applications: status changes, new applications
 * - job_positions: new imports, lifecycle changes
 * - interview_prep_items: completion toggles
 *
 * Each subscription dispatches custom events that UI components can listen to.
 * Also provides a toast notification queue for cross-tab awareness.
 */

import { supabase } from "@/lib/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// ============================================================
// Types
// ============================================================

export type SyncChannel =
  | "applications"
  | "job_positions"
  | "interview_prep";

export interface SyncEvent {
  channel: SyncChannel;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export type SyncCallback = (event: SyncEvent) => void;

// ============================================================
// Channel Manager
// ============================================================

const channels = new Map<SyncChannel, RealtimeChannel>();
const listeners = new Map<string, Set<SyncCallback>>();
let initialized = false;

/**
 * Start all Realtime subscriptions for the current user.
 * Call once at app initialization (after auth).
 */
export function startRealtimeSync(): void {
  if (initialized) return;

  // Subscribe to applications changes
  const appChannel = supabase
    .channel("realtime:applications")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "applications",
      },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        dispatchEvent("applications", payload);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[RealtimeSync] applications channel ready");
      }
    });

  // Subscribe to job position changes
  const jobChannel = supabase
    .channel("realtime:job_positions")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "job_positions",
      },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        dispatchEvent("job_positions", payload);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[RealtimeSync] job_positions channel ready");
      }
    });

  // Subscribe to interview prep changes
  const prepChannel = supabase
    .channel("realtime:interview_prep")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "interview_prep_items",
      },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        dispatchEvent("interview_prep", payload);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[RealtimeSync] interview_prep channel ready");
      }
    });

  channels.set("applications", appChannel);
  channels.set("job_positions", jobChannel);
  channels.set("interview_prep", prepChannel);

  initialized = true;
  console.log("[RealtimeSync] All channels initialized");
}

/**
 * Stop all Realtime subscriptions.
 * Call on logout or app teardown.
 */
export function stopRealtimeSync(): void {
  for (const [name, channel] of channels) {
    supabase.removeChannel(channel);
    console.log(`[RealtimeSync] ${name} channel removed`);
  }
  channels.clear();
  initialized = false;
}

// ============================================================
// Event System
// ============================================================

function dispatchEvent(
  channel: SyncChannel,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): void {
  const event: SyncEvent = {
    channel,
    eventType: payload.eventType,
    table: payload.table,
    payload: (payload.new || payload.old || {}) as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };

  // Dispatch DOM custom event for components
  window.dispatchEvent(
    new CustomEvent<SyncEvent>("everydeliver:sync", { detail: event }),
  );

  // Dispatch channel-specific event
  window.dispatchEvent(
    new CustomEvent<SyncEvent>(`everydeliver:sync:${channel}`, {
      detail: event,
    }),
  );

  // Also notify registered listeners
  for (const [, cbs] of listeners) {
    for (const cb of cbs) {
      try { cb(event); } catch { /* skip broken listeners */ }
    }
  }
}

/**
 * Subscribe to all sync events.
 * Returns unsubscribe function.
 */
export function onSync(callback: SyncCallback): () => void {
  const id = Math.random().toString(36).slice(2);
  if (!listeners.has(id)) {
    listeners.set(id, new Set());
  }
  listeners.get(id)!.add(callback);
  return () => {
    listeners.get(id)?.delete(callback);
    if (listeners.get(id)?.size === 0) listeners.delete(id);
  };
}

/**
 * Subscribe to a specific channel's events.
 */
export function onChannelSync(
  channel: SyncChannel,
  callback: SyncCallback,
): () => void {
  const handler = (e: Event) => {
    const ce = e as CustomEvent<SyncEvent>;
    if (ce.detail?.channel === channel) {
      callback(ce.detail);
    }
  };
  window.addEventListener("everydeliver:sync", handler);
  return () => window.removeEventListener("everydeliver:sync", handler);
}

// ============================================================
// Toast Notification Queue
// ============================================================

export interface SyncNotification {
  id: string;
  message: string;
  channel: SyncChannel;
  timestamp: string;
  dismissed: boolean;
}

const MAX_NOTIFICATIONS = 20;

/**
 * Get a human-readable notification message from a sync event.
 */
export function formatSyncNotification(event: SyncEvent): string | null {
  const { channel, eventType, payload } = event;

  switch (channel) {
    case "applications": {
      const status = payload.status as string;
      const title = (payload.job_title as string) || "未知岗位";
      switch (eventType) {
        case "INSERT":
          return `📨 新投递: ${title}`;
        case "UPDATE":
          return `📊 投递状态更新: ${title} → ${statusLabel(status)}`;
        case "DELETE":
          return `🗑 投递已删除: ${title}`;
      }
      break;
    }

    case "job_positions": {
      const title = (payload.title as string) || "未知职位";
      switch (eventType) {
        case "INSERT":
          return `🔍 新职位导入: ${title}`;
        case "UPDATE": {
          const lifecycle = payload.lifecycle_status as string;
          if (lifecycle === "expiring_soon") {
            return `⚠️ 职位即将过期: ${title}`;
          }
          if (lifecycle === "expired") {
            return `⏰ 职位已过期: ${title}`;
          }
          return `📝 职位已更新: ${title}`;
        }
        case "DELETE":
          return `🗑 职位已删除: ${title}`;
      }
      break;
    }

    case "interview_prep": {
      const title = (payload.title as string) || "未知准备项";
      switch (eventType) {
        case "INSERT":
          return `🎯 新面试准备项: ${title}`;
        case "UPDATE": {
          const status = payload.status as string;
          if (status === "completed") {
            return `✅ 面试准备完成: ${title}`;
          }
          return `📝 面试准备更新: ${title}`;
        }
      }
      break;
    }
  }

  return null;
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: "待投递",
    applied: "已投递",
    resume_viewed: "简历已查看",
    interviewing: "面试中",
    offered: "已录用",
    rejected: "已拒绝",
    archived: "已归档",
  };
  return map[s] || s;
}

// ============================================================
// Integration Hook
// ============================================================

/**
 * React-friendly hook for subscribing to sync events.
 *
 * Usage:
 *   const latestEvent = useRealtimeSync("applications");
 *   useEffect(() => { if (latestEvent) refreshData(); }, [latestEvent]);
 */
export function createSyncHandler(
  setLastEvent: (e: SyncEvent) => void,
): () => void {
  return onSync((event) => {
    setLastEvent(event);
  });
}
