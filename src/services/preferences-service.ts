import { supabase } from "@/lib/supabase";

export interface Preferences {
  id?: string;
  // Whitelist
  company_keywords: string[];
  industries: string[];
  min_company_size: number | null;
  min_monthly_salary: number | null;
  target_cities: string[];
  // Blacklist
  blacklist_companies: string[];
  blacklist_tags: string[];
  // Auto-detection
  auto_detect_mode: "prompt" | "auto_all" | "mark_only";
  auto_join_threshold: number;
  industry_warnings: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  company_keywords: [],
  industries: [],
  min_company_size: null,
  min_monthly_salary: null,
  target_cities: [],
  blacklist_companies: [],
  blacklist_tags: [],
  auto_detect_mode: "prompt",
  auto_join_threshold: 3,
  industry_warnings: true,
};

/** Get or create user preferences */
export async function getPreferences(): Promise<Preferences> {
  const { data, error } = await supabase
    .from("preferences")
    .select("*")
    .single();

  if (error && error.code === "PGRST116") {
    // No preferences yet — create defaults
    const { data: created, error: createError } = await supabase
      .from("preferences")
      .insert({ ...DEFAULT_PREFERENCES })
      .select()
      .single();

    if (createError) throw createError;
    return created || DEFAULT_PREFERENCES;
  }

  if (error) throw error;
  return data || DEFAULT_PREFERENCES;
}

/** Save user preferences */
export async function savePreferences(
  prefs: Partial<Preferences>
): Promise<void> {
  const { error } = await supabase.from("preferences").upsert({
    ...prefs,
  });

  if (error) throw error;
}
