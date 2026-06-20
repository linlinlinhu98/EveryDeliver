-- EveryDeliver: Initial schema migration
-- Creates all core tables with RLS policies

-- ============================================
-- 1. Profiles (extends Supabase auth.users)
-- ============================================
CREATE TABLE public.profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name      VARCHAR(100),
  avatar_url        TEXT,
  phone_encrypted   TEXT,
  email_verified    BOOLEAN DEFAULT FALSE,
  training_opt_in   BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own profiles" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. Resumes
-- ============================================
CREATE TABLE public.resumes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             VARCHAR(200),
  file_path         TEXT,
  file_type         VARCHAR(20),
  is_primary        BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own resumes" ON public.resumes
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.resume_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id         UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
  version_number    INT NOT NULL,
  full_content      TEXT,
  change_summary    TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(resume_id, version_number)
);

ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own resume versions" ON public.resume_versions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.resumes
      WHERE resumes.id = resume_versions.resume_id
      AND resumes.user_id = auth.uid()
    )
  );

-- ============================================
-- 3. Module Types & Module Templates
-- ============================================
CREATE TABLE public.module_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(30) UNIQUE NOT NULL,
  display_name      VARCHAR(50) NOT NULL,
  sort_order        INT DEFAULT 0
);

ALTER TABLE public.module_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read module types" ON public.module_types
  FOR SELECT USING (true);

-- Seed 8 module types
INSERT INTO public.module_types (code, display_name, sort_order) VALUES
  ('education',     '教育背景', 1),
  ('internship',    '实习经历', 2),
  ('project',       '项目经历', 3),
  ('skill',         '技能证书', 4),
  ('certification', '资质证书', 5),
  ('award',         '获奖荣誉', 6),
  ('language',      '语言能力', 7),
  ('summary',       '个人总结', 8);

CREATE TABLE public.module_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_type_id    UUID NOT NULL REFERENCES public.module_types(id) ON DELETE CASCADE,
  title             VARCHAR(200),
  content           TEXT NOT NULL,
  tags              TEXT[],
  quality_score     FLOAT DEFAULT 1.0,
  quality_flags     TEXT[],
  version           INT DEFAULT 1,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.module_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own module templates" ON public.module_templates
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.resume_module_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_version_id   UUID NOT NULL REFERENCES public.resume_versions(id) ON DELETE CASCADE,
  module_template_id  UUID NOT NULL REFERENCES public.module_templates(id) ON DELETE CASCADE,
  override_content    TEXT,
  sort_order          INT DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.resume_module_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own module instances" ON public.resume_module_instances
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.resume_versions rv
      JOIN public.resumes r ON r.id = rv.resume_id
      WHERE rv.id = resume_module_instances.resume_version_id
      AND r.user_id = auth.uid()
    )
  );

CREATE TABLE public.resume_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_version_id UUID NOT NULL REFERENCES public.resume_versions(id) ON DELETE CASCADE,
  frozen_content    TEXT NOT NULL,
  frozen_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.resume_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own snapshots" ON public.resume_snapshots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.resume_versions rv
      JOIN public.resumes r ON r.id = rv.resume_id
      WHERE rv.id = resume_snapshots.resume_version_id
      AND r.user_id = auth.uid()
    )
  );

-- ============================================
-- 4. Preferences
-- ============================================
CREATE TABLE public.preferences (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Whitelist
  company_keywords      TEXT[],
  industries            TEXT[],
  min_company_size      INT,
  min_monthly_salary    INT,
  target_cities         TEXT[],
  -- Blacklist
  blacklist_companies   TEXT[],
  blacklist_tags        TEXT[],
  -- Auto-detection
  auto_detect_mode      VARCHAR(20) DEFAULT 'prompt',
  auto_join_threshold   INT DEFAULT 3,
  industry_warnings     BOOLEAN DEFAULT TRUE,
  -- Metadata
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own preferences" ON public.preferences
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 5. Job Positions & JD Parse Results
-- ============================================
CREATE TABLE public.job_positions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name        VARCHAR(200) NOT NULL,
  title               VARCHAR(300) NOT NULL,
  standardized_title  VARCHAR(300),
  jd_raw_text         TEXT,
  source_url          TEXT,
  source_platform     VARCHAR(50),
  salary_min          INT,
  salary_max          INT,
  city                VARCHAR(100),
  duplicate_key       VARCHAR(500),
  import_source       VARCHAR(20),
  import_status       VARCHAR(20) DEFAULT 'draft',
  quality_score       FLOAT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, duplicate_key)
);

ALTER TABLE public.job_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own job positions" ON public.job_positions
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.jd_parse_results (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_position_id         UUID NOT NULL UNIQUE REFERENCES public.job_positions(id) ON DELETE CASCADE,
  -- Layer 1: Hard requirements
  education               VARCHAR(50),
  experience_years        VARCHAR(20),
  salary_range            INT[],
  location                VARCHAR(100),
  language                VARCHAR(50),
  -- Layer 2: Skills
  direct_skills           TEXT[],
  general_skills          TEXT[],
  -- Layer 3: Responsibilities
  responsibility_summary  TEXT,
  keywords                TEXT[],
  -- Layer 4: Inferred
  team_size_guess         VARCHAR(20),
  tech_trend              TEXT,
  urgency                 VARCHAR(20),
  -- Metadata
  confidence              FLOAT,
  parse_method            VARCHAR(20),
  parse_version           INT DEFAULT 1,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.jd_parse_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own parse results" ON public.jd_parse_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.job_positions
      WHERE job_positions.id = jd_parse_results.job_position_id
      AND job_positions.user_id = auth.uid()
    )
  );

CREATE TABLE public.jd_parse_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_position_id     UUID NOT NULL REFERENCES public.job_positions(id) ON DELETE CASCADE,
  parse_result_json   JSONB NOT NULL,
  snapshot_reason     VARCHAR(50),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.jd_parse_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own parse snapshots" ON public.jd_parse_snapshots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.job_positions
      WHERE job_positions.id = jd_parse_snapshots.job_position_id
      AND job_positions.user_id = auth.uid()
    )
  );

-- ============================================
-- 6. Applications & Status History
-- ============================================
CREATE TABLE public.applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_position_id     UUID NOT NULL REFERENCES public.job_positions(id) ON DELETE CASCADE,
  resume_snapshot_id  UUID REFERENCES public.resume_snapshots(id) ON DELETE SET NULL,
  status              VARCHAR(30) DEFAULT 'pending',
  applied_at          TIMESTAMPTZ,
  reminder_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own applications" ON public.applications
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.application_status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  from_status     VARCHAR(30),
  to_status       VARCHAR(30) NOT NULL,
  changed_by      VARCHAR(20) DEFAULT 'user',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.application_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own status history" ON public.application_status_history
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = application_status_history.application_id
      AND applications.user_id = auth.uid()
    )
  );

-- ============================================
-- 7. Interview Prep Items
-- ============================================
CREATE TABLE public.interview_prep_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id      UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  job_position_id     UUID REFERENCES public.job_positions(id) ON DELETE SET NULL,
  title               VARCHAR(255) NOT NULL,
  category            VARCHAR(20) NOT NULL,
  content             TEXT,
  source              VARCHAR(20) DEFAULT 'ai_generated',
  status              VARCHAR(20) DEFAULT 'pending',
  priority            INT DEFAULT 3,
  due_date            DATE,
  estimated_minutes   INT,
  tags                TEXT[],
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  notes               TEXT
);

ALTER TABLE public.interview_prep_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own prep items" ON public.interview_prep_items
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 8. Duplicate Keys (survives application deletion)
-- ============================================
CREATE TABLE public.duplicate_keys (
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  duplicate_key     VARCHAR(500) NOT NULL,
  first_applied_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, duplicate_key)
);

ALTER TABLE public.duplicate_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own duplicate keys" ON public.duplicate_keys
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Indexes for common query patterns
-- ============================================
CREATE INDEX idx_resumes_user_id ON public.resumes(user_id);
CREATE INDEX idx_resume_versions_resume_id ON public.resume_versions(resume_id);
CREATE INDEX idx_module_templates_user_type ON public.module_templates(user_id, module_type_id);
CREATE INDEX idx_job_positions_user_status ON public.job_positions(user_id, import_status);
CREATE INDEX idx_job_positions_duplicate_key ON public.job_positions(user_id, duplicate_key);
CREATE INDEX idx_applications_user_status ON public.applications(user_id, status);
CREATE INDEX idx_applications_reminder ON public.applications(user_id, reminder_at);
CREATE INDEX idx_interview_prep_user_status ON public.interview_prep_items(user_id, status);
