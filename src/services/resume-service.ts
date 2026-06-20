import { supabase } from "@/lib/supabase";

export interface ResumeRecord {
  id: string;
  title: string;
  file_path: string | null;
  file_type: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResumeVersionRecord {
  id: string;
  resume_id: string;
  version_number: number;
  full_content: string;
  change_summary: string | null;
  created_at: string;
}

/**
 * Create a new resume with its first version.
 * Returns the created resume record.
 */
export async function createResume(
  title: string,
  filePath: string,
  fileType: string,
  content: string
): Promise<ResumeRecord> {
  // 1. Create resume record
  const { data: resume, error: resumeError } = await supabase
    .from("resumes")
    .insert({
      title,
      file_path: filePath,
      file_type: fileType,
      is_primary: false,
    })
    .select()
    .single();

  if (resumeError) throw new Error(`创建简历失败: ${resumeError.message}`);
  if (!resume) throw new Error("创建简历失败: 未返回数据");

  // 2. Create initial version (v1)
  const { error: versionError } = await supabase
    .from("resume_versions")
    .insert({
      resume_id: resume.id,
      version_number: 1,
      full_content: content,
      change_summary: "初始上传",
    });

  if (versionError) {
    // Rollback: delete the resume record
    await supabase.from("resumes").delete().eq("id", resume.id);
    throw new Error(`创建简历版本失败: ${versionError.message}`);
  }

  return resume;
}

/** Fetch all resumes for the current user, newest first */
export async function getUserResumes(): Promise<ResumeRecord[]> {
  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`获取简历列表失败: ${error.message}`);
  return data || [];
}

/** Fetch the latest version of a resume */
export async function getLatestVersion(
  resumeId: string
): Promise<ResumeVersionRecord | null> {
  const { data, error } = await supabase
    .from("resume_versions")
    .select("*")
    .eq("resume_id", resumeId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`获取简历版本失败: ${error.message}`);
  }

  return data || null;
}

/** Set a resume as the primary (default) resume */
export async function setPrimaryResume(resumeId: string): Promise<void> {
  // Unset all primary flags for this user, then set the target
  const { error: unsetError } = await supabase
    .from("resumes")
    .update({ is_primary: false })
    .neq("id", "00000000-0000-0000-0000-000000000000"); // update all

  if (unsetError) throw new Error(`操作失败: ${unsetError.message}`);

  const { error } = await supabase
    .from("resumes")
    .update({ is_primary: true })
    .eq("id", resumeId);

  if (error) throw new Error(`设置主简历失败: ${error.message}`);
}

/** Delete a resume and all its versions (cascade) */
export async function deleteResume(resumeId: string): Promise<void> {
  const { error } = await supabase
    .from("resumes")
    .delete()
    .eq("id", resumeId);

  if (error) throw new Error(`删除简历失败: ${error.message}`);
}
