import { supabase } from "@/lib/supabase";

/**
 * Parse a resume file on the client side (text extraction).
 *
 * For PDF and DOCX, we upload to Supabase Storage and invoke
 * an Edge Function that performs server-side parsing.
 * For plain text, we read the file directly in the browser.
 */
export async function parseResumeFile(
  file: File
): Promise<{ text: string; filePath: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  // Upload to Supabase Storage
  const filePath = await uploadToStorage(file);

  if (ext === "txt") {
    // Read text directly in browser
    const text = await file.text();
    return { text, filePath };
  }

  // PDF / DOCX → parse via Edge Function
  const text = await parseWithEdgeFunction(filePath, file.name);
  return { text, filePath };
}

/** Upload file to Supabase Storage (bucket: resumes) */
async function uploadToStorage(file: File): Promise<string> {
  const filePath = `${crypto.randomUUID()}/${file.name}`;

  const { error } = await supabase.storage
    .from("resumes")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`文件上传失败: ${error.message}`);
  }

  return filePath;
}

/**
 * Call the Supabase Edge Function to extract text from PDF/DOCX.
 *
 * The Edge Function receives a file path, downloads from Storage,
 * extracts text using a PDF/DOCX parser, and returns the text.
 *
 * Fallback: if the Edge Function is not deployed, return a
 * placeholder message so the user can manually enter content.
 */
async function parseWithEdgeFunction(
  filePath: string,
  fileName: string
): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke("parse-document", {
      body: { filePath, fileName },
    });

    if (error) throw error;

    return (data as { text: string }).text || "";
  } catch {
    // Fallback: prompt user to manually enter content
    return `[文件 "${fileName}" 已上传。请手动粘贴简历内容，或稍后通过 Agent 对话填写。]`;
  }
}
