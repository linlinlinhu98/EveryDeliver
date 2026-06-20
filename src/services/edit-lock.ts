/**
 * Cross-Device Edit Lock Service (Phase 5.9)
 *
 * Prevents concurrent edits across tabs/devices using Supabase.
 * Lock strategy:
 * - Strong lock with 5-minute TTL
 * - Lock is associated with (resource_type, resource_id)
 * - Heartbeat extends lock TTL
 * - Auto-release on navigation away (beforeunload)
 * - Stale locks are ignored after TTL expires
 *
 * Locked resources: resumes (editing), modules (editing individual module)
 */

import { supabase } from "@/lib/supabase";

// ============================================================
// Types
// ============================================================

export type LockResourceType = "resume" | "module" | "application";

export interface EditLock {
  id?: string;
  resource_type: LockResourceType;
  resource_id: string;
  user_id: string;
  locked_at: string;    // ISO timestamp
  expires_at: string;   // ISO timestamp (locked_at + TTL)
  heartbeat_at: string; // ISO timestamp of last heartbeat
  device_info: string;  // window.navigator.userAgent (truncated)
}

export interface LockStatus {
  isLocked: boolean;
  isOwnLock: boolean;
  lock: EditLock | null;
}

// ============================================================
// Constants
// ============================================================

/** Lock TTL: 5 minutes */
const LOCK_TTL_MS = 5 * 60 * 1000;

/** Heartbeat interval: every 2 minutes (extends lock) */
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

/** Grace period: lock considered stale after TTL + 30s */
const STALE_GRACE_MS = 30 * 1000;

// ============================================================
// Heartbeat Manager
// ============================================================

const activeHeartbeats = new Map<string, ReturnType<typeof setInterval>>();

function getLockKey(type: LockResourceType, id: string): string {
  return `${type}:${id}`;
}

// ============================================================
// Lock Operations
// ============================================================

/**
 * Acquire an edit lock on a resource.
 * Returns the lock if successful, null if already locked by someone else.
 */
export async function acquireLock(
  resourceType: LockResourceType,
  resourceId: string,
): Promise<EditLock | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  const lock: Omit<EditLock, "id"> = {
    resource_type: resourceType,
    resource_id: resourceId,
    user_id: user.id,
    locked_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    heartbeat_at: now.toISOString(),
    device_info: navigator.userAgent.substring(0, 200),
  };

  // Try to acquire lock: delete stale locks first, then insert
  try {
    // Remove any stale locks for this resource
    await supabase
      .from("edit_locks")
      .delete()
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .lt("expires_at", now.toISOString());

    // Check if there's an active lock by another user
    const { data: existing } = await supabase
      .from("edit_locks")
      .select("*")
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .gte("expires_at", now.toISOString())
      .maybeSingle();

    if (existing) {
      if (existing.user_id === user.id) {
        // Own lock — update expiry
        await supabase
          .from("edit_locks")
          .update({ expires_at: expiresAt.toISOString(), heartbeat_at: now.toISOString() })
          .eq("id", existing.id);
        startHeartbeat(resourceType, resourceId);
        return existing as EditLock;
      }
      // Another user holds the lock
      return null;
    }

    // No active lock — acquire
    const { data: created } = await supabase
      .from("edit_locks")
      .insert(lock)
      .select("*")
      .single();

    if (created) {
      startHeartbeat(resourceType, resourceId);
      return created as EditLock;
    }

    return null;
  } catch (err) {
    console.error("[EditLock] acquireLock error:", err);
    // Table may not exist yet — return a client-side lock as fallback
    return createClientSideLock(lock);
  }
}

/**
 * Release an edit lock.
 */
export async function releaseLock(
  resourceType: LockResourceType,
  resourceId: string,
): Promise<void> {
  stopHeartbeat(resourceType, resourceId);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("edit_locks")
      .delete()
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .eq("user_id", user.id);
  } catch (err) {
    console.error("[EditLock] releaseLock error:", err);
    clearClientSideLock(getLockKey(resourceType, resourceId));
  }
}

/**
 * Check lock status for a resource.
 */
export async function checkLock(
  resourceType: LockResourceType,
  resourceId: string,
): Promise<LockStatus> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    const now = new Date().toISOString();
    const { data: lock } = await supabase
      .from("edit_locks")
      .select("*")
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .gte("expires_at", now)
      .maybeSingle();

    if (!lock) return { isLocked: false, isOwnLock: false, lock: null };

    const isOwnLock = !!user && lock.user_id === user.id;
    return { isLocked: true, isOwnLock, lock: lock as EditLock };
  } catch {
    // Fallback: check client-side lock
    const key = getLockKey(resourceType, resourceId);
    const clientLock = getClientSideLock(key);
    if (clientLock && clientLock.expires_at > new Date().toISOString()) {
      return {
        isLocked: true,
        isOwnLock: clientLock.user_id === user?.id,
        lock: clientLock,
      };
    }
    return { isLocked: false, isOwnLock: false, lock: null };
  }
}

// ============================================================
// Heartbeat
// ============================================================

function startHeartbeat(type: LockResourceType, id: string): void {
  const key = getLockKey(type, id);
  if (activeHeartbeats.has(key)) return;

  const interval = setInterval(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const newExpires = new Date(Date.now() + LOCK_TTL_MS).toISOString();
      await supabase
        .from("edit_locks")
        .update({
          heartbeat_at: new Date().toISOString(),
          expires_at: newExpires,
        })
        .eq("resource_type", type)
        .eq("resource_id", id)
        .eq("user_id", user.id);
    } catch {
      // Table may not exist — heartbeat via client-side
      const clientLock = getClientSideLock(key);
      if (clientLock) {
        clientLock.expires_at = new Date(Date.now() + LOCK_TTL_MS).toISOString();
        clientLock.heartbeat_at = new Date().toISOString();
        setClientSideLock(key, clientLock);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  activeHeartbeats.set(key, interval);
}

function stopHeartbeat(type: LockResourceType, id: string): void {
  const key = getLockKey(type, id);
  const interval = activeHeartbeats.get(key);
  if (interval) {
    clearInterval(interval);
    activeHeartbeats.delete(key);
  }
}

/**
 * Set up beforeunload listener to release all active locks.
 * Call this once at app initialization.
 */
export function setupAutoRelease(): void {
  window.addEventListener("beforeunload", () => {
    for (const [key] of activeHeartbeats) {
      const [type, id] = key.split(":", 2) as [LockResourceType, string];
      // Fire-and-forget release
      supabase
        .from("edit_locks")
        .delete()
        .eq("resource_type", type)
        .eq("resource_id", id)
        .then(() => { /* ok */ })
        .catch(() => { /* ignore */ });
      clearClientSideLock(key);
    }
  });
}

// ============================================================
// Client-Side Lock Fallback
// ============================================================

interface ClientLock {
  resource_type: LockResourceType;
  resource_id: string;
  user_id: string;
  locked_at: string;
  expires_at: string;
  heartbeat_at: string;
  device_info: string;
}

const CLIENT_LOCKS_KEY = "everydeliver:edit_locks";

function getClientSideLocks(): Record<string, ClientLock> {
  try {
    const raw = sessionStorage.getItem(CLIENT_LOCKS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setClientSideLock(key: string, lock: ClientLock): void {
  const locks = getClientSideLocks();
  locks[key] = lock;
  sessionStorage.setItem(CLIENT_LOCKS_KEY, JSON.stringify(locks));
}

function getClientSideLock(key: string): ClientLock | null {
  return getClientSideLocks()[key] || null;
}

function clearClientSideLock(key: string): void {
  const locks = getClientSideLocks();
  delete locks[key];
  sessionStorage.setItem(CLIENT_LOCKS_KEY, JSON.stringify(locks));
}

function createClientSideLock(lock: Omit<EditLock, "id">): EditLock {
  const clientLock: ClientLock = { ...lock };
  setClientSideLock(getLockKey(lock.resource_type, lock.resource_id), clientLock);
  startHeartbeat(lock.resource_type, lock.resource_id);
  return clientLock as EditLock;
}

// ============================================================
// Migration SQL (for reference — apply via Supabase dashboard)
// ============================================================

/**
 * SQL to create the edit_locks table:
 *
 * CREATE TABLE IF NOT EXISTS public.edit_locks (
 *   id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   resource_type VARCHAR(20) NOT NULL,
 *   resource_id   UUID NOT NULL,
 *   user_id       UUID NOT NULL REFERENCES auth.users(id),
 *   locked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   expires_at    TIMESTAMPTZ NOT NULL,
 *   heartbeat_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   device_info   TEXT,
 *   UNIQUE(resource_type, resource_id)
 * );
 *
 * CREATE INDEX idx_edit_locks_expires ON public.edit_locks(expires_at);
 *
 * ALTER TABLE public.edit_locks ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Users can view all locks"
 *   ON public.edit_locks FOR SELECT USING (true);
 *
 * CREATE POLICY "Users can manage own locks"
 *   ON public.edit_locks FOR ALL
 *   USING (auth.uid() = user_id);
 */
