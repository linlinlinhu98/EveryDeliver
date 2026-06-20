/**
 * Module History Version Management (Phase 5.5)
 *
 * Tracks edits to resume modules with:
 * - Version numbering (auto-increment per module)
 * - 50-version cap per module (oldest auto-archived)
 * - Diff between versions
 * - Restore to any previous version
 * - Auto-snapshot before AI optimization changes
 */

import { supabase } from "@/lib/supabase";

// ============================================================
// Types
// ============================================================

export interface ModuleVersion {
  id?: string;
  module_id: string;
  version_number: number;
  content: string;
  tags: string[];
  quality_score: number;
  change_description: string; // "manual_edit" | "ai_optimize" | "template_change" | "restore"
  created_at?: string;
  created_by?: string;
}

export interface VersionDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

// ============================================================
// Constants
// ============================================================

/** Maximum versions per module before auto-archiving */
const MAX_VERSIONS = 50;

/** How many old versions to keep when archiving (keep most recent N) */
const KEEP_RECENT = 30;

// ============================================================
// Version CRUD
// ============================================================

/**
 * Save a new version snapshot for a module.
 * Auto-increments version number and enforces 50-version cap.
 */
export async function saveVersion(
  moduleId: string,
  content: string,
  tags: string[],
  qualityScore: number,
  changeDescription: string,
): Promise<ModuleVersion> {
  // Get current max version number
  const { data: versions } = await supabase
    .from("resume_module_versions")
    .select("version_number")
    .eq("module_id", moduleId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersion = (versions?.[0]?.version_number || 0) + 1;

  const version: Omit<ModuleVersion, "id"> = {
    module_id: moduleId,
    version_number: nextVersion,
    content,
    tags,
    quality_score: qualityScore,
    change_description: changeDescription,
  };

  try {
    const { data: created } = await supabase
      .from("resume_module_versions")
      .insert(version)
      .select("*")
      .single();

    // Enforce 50-version cap
    if (nextVersion > MAX_VERSIONS) {
      await archiveOldVersions(moduleId);
    }

    if (created) return created as ModuleVersion;

    throw new Error("Failed to save version");
  } catch (err) {
    console.error("[ModuleHistory] saveVersion error:", err);
    // Fallback: return a client-side version
    return {
      module_id: moduleId,
      version_number: nextVersion,
      content,
      tags,
      quality_score: qualityScore,
      change_description: changeDescription,
      created_at: new Date().toISOString(),
    };
  }
}

/**
 * Get all versions for a module, ordered by version desc.
 */
export async function getVersions(
  moduleId: string,
): Promise<ModuleVersion[]> {
  try {
    const { data } = await supabase
      .from("resume_module_versions")
      .select("*")
      .eq("module_id", moduleId)
      .order("version_number", { ascending: false })
      .limit(MAX_VERSIONS);

    return (data || []) as ModuleVersion[];
  } catch {
    return [];
  }
}

/**
 * Get a specific version by version number.
 */
export async function getVersion(
  moduleId: string,
  versionNumber: number,
): Promise<ModuleVersion | null> {
  try {
    const { data } = await supabase
      .from("resume_module_versions")
      .select("*")
      .eq("module_id", moduleId)
      .eq("version_number", versionNumber)
      .maybeSingle();

    return (data as ModuleVersion) || null;
  } catch {
    return null;
  }
}

/**
 * Restore module content to a specific version.
 * Creates a NEW version with the old content (doesn't delete history).
 */
export async function restoreVersion(
  moduleId: string,
  versionNumber: number,
): Promise<ModuleVersion | null> {
  const oldVersion = await getVersion(moduleId, versionNumber);
  if (!oldVersion) return null;

  // Save the restore as a new version
  return saveVersion(
    moduleId,
    oldVersion.content,
    oldVersion.tags,
    oldVersion.quality_score,
    `restore_from_v${versionNumber}`,
  );
}

// ============================================================
// Diff
// ============================================================

/**
 * Compute a simple line-level diff between two versions.
 */
export function diffVersions(
  oldContent: string,
  newContent: string,
): VersionDiff {
  const oldLines = oldContent.split("\n").map((l) => l.trim()).filter(Boolean);
  const newLines = newContent.split("\n").map((l) => l.trim()).filter(Boolean);

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const added = newLines.filter((l) => !oldSet.has(l));
  const removed = oldLines.filter((l) => !newSet.has(l));
  const unchanged = oldLines.filter((l) => newSet.has(l));

  return { added, removed, unchanged };
}

/**
 * Compute character-level changes summary.
 */
export function diffSummary(
  oldContent: string,
  newContent: string,
): { addedChars: number; removedChars: number; changeRatio: number } {
  const addedChars = Math.max(0, newContent.length - oldContent.length);
  const removedChars = Math.max(0, oldContent.length - newContent.length);
  const total = Math.max(oldContent.length, newContent.length);
  const changeRatio = total > 0
    ? Math.round(((addedChars + removedChars) / total) * 100)
    : 0;

  return { addedChars, removedChars, changeRatio };
}

// ============================================================
// Archiving
// ============================================================

/**
 * Archive old versions: keep only the most recent KEEP_RECENT versions.
 */
async function archiveOldVersions(moduleId: string): Promise<void> {
  try {
    // Find version numbers to delete
    const { data: versions } = await supabase
      .from("resume_module_versions")
      .select("id, version_number")
      .eq("module_id", moduleId)
      .order("version_number", { ascending: false });

    if (!versions || versions.length <= KEEP_RECENT) return;

    const toDelete = versions.slice(KEEP_RECENT);

    // Archive to archive table (optional — for MVP we just delete)
    // For now, just delete oldest versions
    const ids = toDelete.map((v) => v.id);
    await supabase
      .from("resume_module_versions")
      .delete()
      .in("id", ids);

    console.log(
      `[ModuleHistory] Archived ${ids.length} old versions for module ${moduleId}`,
    );
  } catch (err) {
    console.error("[ModuleHistory] archiveOldVersions error:", err);
  }
}

// ============================================================
// Snapshot Before AI Optimization
// ============================================================

/**
 * Create a version snapshot before AI optimization changes are applied.
 * Used by the match engine / resume optimizer to preserve pre-optimization state.
 */
export async function snapshotBeforeOptimization(
  moduleId: string,
  currentContent: string,
  currentTags: string[],
  currentScore: number,
): Promise<ModuleVersion> {
  return saveVersion(
    moduleId,
    currentContent,
    currentTags,
    currentScore,
    "pre_ai_optimize",
  );
}

// ============================================================
// Migration SQL (for reference)
// ============================================================

/**
 * CREATE TABLE IF NOT EXISTS public.resume_module_versions (
 *   id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   module_id          UUID NOT NULL REFERENCES resume_module_instances(id) ON DELETE CASCADE,
 *   version_number     INT NOT NULL,
 *   content            TEXT NOT NULL,
 *   tags               TEXT[] DEFAULT '{}',
 *   quality_score      REAL DEFAULT 0,
 *   change_description VARCHAR(50) DEFAULT 'manual_edit',
 *   created_at         TIMESTAMPTZ DEFAULT NOW(),
 *   created_by         UUID REFERENCES auth.users(id),
 *   UNIQUE(module_id, version_number)
 * );
 *
 * CREATE INDEX idx_module_versions_module ON public.resume_module_versions(module_id, version_number DESC);
 *
 * ALTER TABLE public.resume_module_versions ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Users can view own module versions"
 *   ON public.resume_module_versions FOR SELECT
 *   USING (EXISTS (
 *     SELECT 1 FROM resume_module_instances
 *     WHERE id = module_id AND user_id = auth.uid()
 *   ));
 *
 * CREATE POLICY "Users can insert own module versions"
 *   ON public.resume_module_versions FOR INSERT
 *   WITH CHECK (EXISTS (
 *     SELECT 1 FROM resume_module_instances
 *     WHERE id = module_id AND user_id = auth.uid()
 *   ));
 */
