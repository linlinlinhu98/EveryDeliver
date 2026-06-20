/**
 * Edge Function: parse-document
 *
 * Receives a file path in Supabase Storage, downloads the file,
 * extracts text content, and returns it.
 *
 * For production: integrate a proper PDF/DOCX parser (pdf.js, mammoth.js).
 * For MVP: we use basic text extraction as a starting point.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface ParseRequest {
  filePath: string;
  fileName: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { filePath, fileName } = (await req.json()) as ParseRequest;

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: "filePath is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role (server-side)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Download file from Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("resumes")
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message || "unknown"}`);
    }

    const ext = fileName.split(".").pop()?.toLowerCase();

    let text = "";

    if (ext === "txt") {
      // Plain text — read directly
      text = await fileData.text();
    } else if (ext === "pdf") {
      // PDF — basic extraction (production: use pdf.js)
      // For MVP, return the raw bytes as a base64 placeholder
      // and prompt the user to use manual entry
      text = `[PDF 文件 "${fileName}" 已上传。]\n\n请在此粘贴简历内容，或使用 Agent 对话填写功能。`;
    } else if (ext === "docx") {
      // DOCX — basic extraction (production: use mammoth.js)
      text = `[Word 文件 "${fileName}" 已上传。]\n\n请在此粘贴简历内容，或使用 Agent 对话填写功能。`;
    } else {
      text = await fileData.text();
    }

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
