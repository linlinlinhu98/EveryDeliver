-- ============================================
-- Phase 2: JD Parser — 补充数据模型
-- 依赖: 00001_initial_schema.sql (job_positions, jd_parse_results, jd_parse_snapshots)
-- ============================================

-- ============================================
-- 1. JD 生命周期状态 — 扩展 job_positions
-- ============================================
ALTER TABLE public.job_positions
  ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_fetched_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fetch_count      INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS raw_html         TEXT;

COMMENT ON COLUMN public.job_positions.lifecycle_status IS 'active | expiring_soon | expired';
COMMENT ON COLUMN public.job_positions.expires_at IS '30 days after import by default';
COMMENT ON COLUMN public.job_positions.raw_html IS '原始 HTML 片段，用于规则解析降级时重试';

-- ============================================
-- 2. 技能词表
-- ============================================
CREATE TABLE public.skill_vocabulary (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  aliases     TEXT[] DEFAULT '{}',
  category    VARCHAR(30) NOT NULL,
  weight      FLOAT DEFAULT 1.0,
  is_direct   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN public.skill_vocabulary.category IS 'programming_language | framework | database | cloud | tool | soft_skill | domain';
COMMENT ON COLUMN public.skill_vocabulary.weight IS 'direct skills ×2.0, general ×0.5';
COMMENT ON COLUMN public.skill_vocabulary.is_direct IS 'TRUE = directly relevant (×2.0 weight), FALSE = general skill (×0.5 weight)';

-- Seed: direct skills (权重 ×2.0 in matching)
INSERT INTO public.skill_vocabulary (name, aliases, category, weight, is_direct) VALUES
  -- Programming Languages
  ('Python',   ARRAY['python3', 'py'],                                    'programming_language', 2.0, TRUE),
  ('JavaScript', ARRAY['js', 'javascript', 'es6', 'es2015'],              'programming_language', 2.0, TRUE),
  ('TypeScript', ARRAY['ts', 'typescript'],                                'programming_language', 2.0, TRUE),
  ('Java',     ARRAY['java8', 'java11', 'java17', 'java21'],             'programming_language', 2.0, TRUE),
  ('Go',       ARRAY['golang'],                                            'programming_language', 2.0, TRUE),
  ('Rust',     ARRAY['rustlang'],                                          'programming_language', 2.0, TRUE),
  ('C++',      ARRAY['cpp', 'c++11', 'c++14', 'c++17', 'c++20'],        'programming_language', 2.0, TRUE),
  ('C#',       ARRAY['csharp', 'c#'],                                      'programming_language', 2.0, TRUE),
  ('Kotlin',   ARRAY[],                                                    'programming_language', 2.0, TRUE),
  ('Swift',    ARRAY[],                                                    'programming_language', 2.0, TRUE),
  ('Ruby',     ARRAY[],                                                    'programming_language', 2.0, TRUE),
  ('PHP',      ARRAY[],                                                    'programming_language', 2.0, TRUE),
  ('Scala',    ARRAY[],                                                    'programming_language', 2.0, TRUE),
  -- Frameworks & Libraries
  ('React',    ARRAY['reactjs', 'react.js'],                              'framework', 2.0, TRUE),
  ('Vue',      ARRAY['vuejs', 'vue.js', 'vue3'],                          'framework', 2.0, TRUE),
  ('Angular',  ARRAY['angular2', 'angularjs'],                             'framework', 2.0, TRUE),
  ('Next.js',  ARRAY['nextjs', 'next'],                                    'framework', 2.0, TRUE),
  ('Spring',   ARRAY['springboot', 'spring boot', 'spring cloud'],       'framework', 2.0, TRUE),
  ('Django',   ARRAY['django rest', 'drf'],                               'framework', 2.0, TRUE),
  ('Flask',    ARRAY['flask restful'],                                     'framework', 2.0, TRUE),
  ('FastAPI',  ARRAY[],                                                    'framework', 2.0, TRUE),
  ('Express',  ARRAY['expressjs', 'express.js'],                          'framework', 2.0, TRUE),
  ('NestJS',   ARRAY['nestjs', 'nest'],                                    'framework', 2.0, TRUE),
  ('TensorFlow', ARRAY['tensorflow2', 'tf'],                              'framework', 2.0, TRUE),
  ('PyTorch',  ARRAY['pytorch lightning'],                                'framework', 2.0, TRUE),
  ('Flutter',  ARRAY[],                                                    'framework', 2.0, TRUE),
  ('React Native', ARRAY['rn'],                                           'framework', 2.0, TRUE),
  -- Databases
  ('PostgreSQL', ARRAY['postgres', 'pgsql'],                              'database', 2.0, TRUE),
  ('MySQL',    ARRAY[],                                                    'database', 2.0, TRUE),
  ('MongoDB',  ARRAY['mongo'],                                             'database', 2.0, TRUE),
  ('Redis',    ARRAY[],                                                    'database', 2.0, TRUE),
  ('Elasticsearch', ARRAY['es', 'elastic'],                               'database', 2.0, TRUE),
  -- Cloud & DevOps
  ('AWS',      ARRAY['amazon web services'],                              'cloud', 2.0, TRUE),
  ('Azure',    ARRAY['microsoft azure'],                                  'cloud', 2.0, TRUE),
  ('GCP',      ARRAY['google cloud', 'google cloud platform'],           'cloud', 2.0, TRUE),
  ('Docker',   ARRAY['container'],                                         'cloud', 2.0, TRUE),
  ('Kubernetes', ARRAY['k8s', 'kube'],                                    'cloud', 2.0, TRUE),
  ('CI/CD',    ARRAY['ci/cd', 'ci cd', 'continuous integration'],        'cloud', 2.0, TRUE),
  ('Terraform', ARRAY['iac', 'infrastructure as code'],                   'cloud', 2.0, TRUE),
  -- AI/ML
  ('LLM',      ARRAY['large language model', '大模型', 'GPT', 'ChatGPT'], 'domain', 2.0, TRUE),
  ('Computer Vision', ARRAY['cv', '图像识别', '视觉', '计算机视觉'],      'domain', 2.0, TRUE),
  ('NLP',      ARRAY['自然语言处理', '文本分析'],                         'domain', 2.0, TRUE),
  -- Mobile
  ('Android',  ARRAY['安卓'],                                              'domain', 2.0, TRUE),
  ('iOS',      ARRAY['iphone', 'ipad', 'apple开发'],                      'domain', 2.0, TRUE);

-- Seed: general skills (权重 ×0.5)
INSERT INTO public.skill_vocabulary (name, aliases, category, weight, is_direct) VALUES
  ('Git',      ARRAY['github', 'gitlab', '版本控制'],                     'tool', 0.5, FALSE),
  ('Linux',    ARRAY['unix', 'shell', 'bash'],                            'tool', 0.5, FALSE),
  ('Agile',    ARRAY['scrum', 'kanban', '敏捷开发'],                      'soft_skill', 0.5, FALSE),
  ('REST API', ARRAY['restful', 'restful api'],                           'tool', 0.5, FALSE),
  ('GraphQL',  ARRAY[],                                                    'tool', 0.5, FALSE),
  ('WebSocket', ARRAY['ws'],                                              'tool', 0.5, FALSE),
  ('Microservices', ARRAY['微服务', '分布式'],                             'domain', 0.5, FALSE),
  ('Jira',     ARRAY['confluence'],                                        'tool', 0.5, FALSE),
  ('Figma',    ARRAY['sketch', '设计工具'],                                'tool', 0.5, FALSE),
  ('Unit Testing', ARRAY['jest', 'pytest', 'junit', '测试'],              'tool', 0.5, FALSE);

CREATE INDEX idx_skill_vocabulary_category ON public.skill_vocabulary(category);
CREATE INDEX idx_skill_vocabulary_name ON public.skill_vocabulary USING gin (name gin_trgm_ops);

-- ============================================
-- 3. 用户反馈表（JD 解析修正）
-- ============================================
CREATE TABLE public.jd_feedback (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_position_id   UUID NOT NULL REFERENCES public.job_positions(id) ON DELETE CASCADE,
  field_name        VARCHAR(50) NOT NULL,
  original_value    TEXT,
  corrected_value   TEXT NOT NULL,
  parse_method      VARCHAR(20),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN public.jd_feedback.field_name IS 'education | experience_years | salary_range | location | language | direct_skills | general_skills | responsibility_summary | keywords';
COMMENT ON COLUMN public.jd_feedback.parse_method IS 'rule | llm | manual — which method produced the original';

ALTER TABLE public.jd_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own jd feedback" ON public.jd_feedback
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_jd_feedback_user_field ON public.jd_feedback(user_id, field_name);
CREATE INDEX idx_jd_feedback_position ON public.jd_feedback(job_position_id);

-- ============================================
-- 4. LLM 调用缓存表（避免重复解析）
-- ============================================
CREATE TABLE public.jd_parse_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key     VARCHAR(64) NOT NULL UNIQUE,
  parse_result  JSONB NOT NULL,
  parse_method  VARCHAR(20) DEFAULT 'llm',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

COMMENT ON COLUMN public.jd_parse_cache.cache_key IS 'SHA-256 hash of JD text (first 500 chars) + source URL';

CREATE INDEX idx_jd_parse_cache_key ON public.jd_parse_cache(cache_key);
CREATE INDEX idx_jd_parse_cache_expires ON public.jd_parse_cache(expires_at);
