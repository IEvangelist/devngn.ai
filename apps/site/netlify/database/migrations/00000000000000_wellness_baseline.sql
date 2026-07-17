-- Disposable pre-v1 Netlify Database baseline for the Wellness API.
-- Keep this as the only migration artifact until the first stable release.
-- Edit it in place and reset/reprovision pre-v1 databases when the schema changes.
-- All tenant-owned rows are
-- constrained by user/consent keys; request handlers additionally scope every query.
-- PGlite (used by @netlify/database-dev) does not bundle pgcrypto, so use a
-- portable UUID generator rather than requiring a server extension.
CREATE OR REPLACE FUNCTION wellness_uuid() RETURNS uuid
LANGUAGE SQL
VOLATILE
AS $$
  WITH entropy AS (
    SELECT md5(random()::text || clock_timestamp()::text) AS value
  )
  SELECT (
    substr(value, 1, 8) || '-' ||
    substr(value, 9, 4) || '-' ||
    '4' || substr(value, 14, 3) || '-' ||
    substr('89ab', floor(random() * 4)::integer + 1, 1) || substr(value, 18, 3) || '-' ||
    substr(value, 21, 12)
  )::uuid
  FROM entropy;
$$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT wellness_uuid(),
  github_id bigint NOT NULL UNIQUE,
  login text NOT NULL CHECK (char_length(login) BETWEEN 1 AND 120),
  display_name text NULL CHECK (display_name IS NULL OR char_length(display_name) <= 200),
  avatar_url text NULL CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_users_login ON users (login);

CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY DEFAULT wellness_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  version text NOT NULL CHECK (char_length(version) BETWEEN 1 AND 40),
  text text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT wellness_uuid(),
  user_id uuid NOT NULL UNIQUE,
  age_range text NULL CHECK (age_range IS NULL OR char_length(age_range) <= 20),
  height_cm numeric(5, 2) NULL CHECK (height_cm IS NULL OR height_cm BETWEEN 30 AND 300),
  weight_kg numeric(5, 2) NULL CHECK (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 500),
  fitness_baseline text NOT NULL DEFAULT 'Unspecified'
    CHECK (fitness_baseline IN ('Unspecified', 'Sedentary', 'Light', 'Moderate', 'Active')),
  preferred_intensity text NOT NULL DEFAULT 'Low'
    CHECK (preferred_intensity IN ('Low', 'Medium', 'High')),
  limitations text NULL CHECK (limitations IS NULL OR char_length(limitations) <= 2000),
  time_of_day_preference text NULL CHECK (time_of_day_preference IS NULL OR char_length(time_of_day_preference) <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_profiles_consent FOREIGN KEY (user_id) REFERENCES consent_records (user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT wellness_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text NULL CHECK (description IS NULL OR char_length(description) <= 2000),
  category text NOT NULL CHECK (category IN ('Mobility', 'Strength', 'Breathing', 'Posture', 'CardioLight')),
  target_metric text NULL CHECK (target_metric IS NULL OR char_length(target_metric) <= 80),
  start_date date NOT NULL,
  end_date date NULL CHECK (end_date IS NULL OR end_date >= start_date),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_goals_consent FOREIGN KEY (user_id) REFERENCES consent_records (user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_goals_user_category ON goals (user_id, category);

CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT wellness_uuid(),
  user_id uuid NOT NULL,
  tag text NOT NULL CHECK (tag ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(tag) <= 60),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  notes text NULL CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_equipment_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_equipment_consent FOREIGN KEY (user_id) REFERENCES consent_records (user_id) ON DELETE CASCADE,
  CONSTRAINT ux_equipment_user_tag UNIQUE (user_id, tag)
);

CREATE TABLE IF NOT EXISTS equipment_catalog (
  tag text PRIMARY KEY CHECK (tag ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('Cardio', 'Strength', 'Mobility', 'Desk')),
  description text NULL,
  recommended_weekly_sessions integer NULL CHECK (recommended_weekly_sessions IS NULL OR recommended_weekly_sessions > 0),
  min_session_minutes integer NULL CHECK (min_session_minutes IS NULL OR min_session_minutes > 0)
);

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT wellness_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  body_area text NOT NULL CHECK (body_area IN ('Full', 'Upper', 'Lower', 'Core', 'Neck', 'Back', 'Wrists', 'Hips', 'Ankles', 'Breath', 'Posture')),
  intensity text NOT NULL CHECK (intensity IN ('Low', 'Medium', 'High')),
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  equipment_tags text[] NOT NULL DEFAULT '{}',
  animation_provider text NOT NULL CHECK (char_length(animation_provider) BETWEEN 1 AND 80),
  animation_asset_id text NOT NULL CHECK (char_length(animation_asset_id) BETWEEN 1 AND 200),
  license_attribution text NULL CHECK (license_attribution IS NULL OR char_length(license_attribution) <= 500),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_activities_body_area_intensity ON activities (body_area, intensity);

CREATE TABLE IF NOT EXISTS auth_device_flows (
  session_id text PRIMARY KEY,
  encrypted_device_code text NOT NULL,
  interval_seconds integer NOT NULL CHECK (interval_seconds > 0),
  expires_at timestamptz NOT NULL,
  last_polled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_auth_device_flows_expires_at ON auth_device_flows (expires_at);

CREATE TABLE IF NOT EXISTS auth_oauth_states (
  state text PRIMARY KEY,
  encrypted_verifier text NOT NULL,
  return_path text NULL CHECK (return_path IS NULL OR char_length(return_path) <= 2000),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_auth_oauth_states_expires_at ON auth_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS schedule_oauth_states (
  state text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('Google', 'Microsoft')),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  encrypted_verifier text NOT NULL,
  return_path text NOT NULL CHECK (char_length(return_path) BETWEEN 1 AND 2000),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_schedule_oauth_states_expires_at ON schedule_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS schedule_sources (
  id uuid PRIMARY KEY DEFAULT wellness_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('User', 'Google', 'Microsoft')),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  encrypted_refresh_token text NULL,
  scope text NULL CHECK (scope IS NULL OR char_length(scope) <= 2000),
  last_sync_at timestamptz NULL,
  last_refresh_at timestamptz NULL,
  last_sync_error_code text NULL CHECK (last_sync_error_code IS NULL OR char_length(last_sync_error_code) <= 80),
  last_sync_error_at timestamptz NULL,
  connection_status text NOT NULL DEFAULT 'Connected'
    CHECK (connection_status IN ('Connected', 'NeedsReconnect', 'Disabled', 'Error', 'PendingConnection')),
  is_enabled boolean NOT NULL DEFAULT true,
  sync_locked_at timestamptz NULL,
  sync_token text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_schedule_sources_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_schedule_sources_consent FOREIGN KEY (user_id) REFERENCES consent_records (user_id) ON DELETE CASCADE,
  CONSTRAINT ux_schedule_sources_id_user UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_schedule_sources_user_type ON schedule_sources (user_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS ux_schedule_sources_provider_per_user
  ON schedule_sources (user_id, type)
  WHERE type IN ('Google', 'Microsoft');

CREATE TABLE IF NOT EXISTS schedule_events (
  id uuid PRIMARY KEY DEFAULT wellness_uuid(),
  user_id uuid NOT NULL,
  source_id uuid NOT NULL,
  external_id text NULL CHECK (external_id IS NULL OR char_length(external_id) BETWEEN 1 AND 200),
  start_utc timestamptz NOT NULL,
  end_utc timestamptz NOT NULL CHECK (end_utc > start_utc),
  busy boolean NOT NULL DEFAULT true,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_schedule_events_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_schedule_events_consent FOREIGN KEY (user_id) REFERENCES consent_records (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_schedule_events_source_user FOREIGN KEY (source_id, user_id)
    REFERENCES schedule_sources (id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_schedule_events_user_window ON schedule_events (user_id, start_utc, end_utc);
CREATE UNIQUE INDEX IF NOT EXISTS ux_schedule_events_source_external
  ON schedule_events (source_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS prompts (
  id uuid PRIMARY KEY DEFAULT wellness_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  request_id uuid NULL,
  activity_id uuid NOT NULL REFERENCES activities (id) ON DELETE RESTRICT,
  gap_start_utc timestamptz NOT NULL,
  gap_end_utc timestamptz NOT NULL CHECK (gap_end_utc > gap_start_utc),
  delivered_at timestamptz NOT NULL DEFAULT now(),
  delivered_via text NOT NULL CHECK (delivered_via IN ('Vscode', 'Cli', 'Web', 'App')),
  dismissed_at timestamptz NULL,
  completed_at timestamptz NULL,
  feedback_rating smallint NULL CHECK (feedback_rating BETWEEN 1 AND 5),
  CONSTRAINT fk_prompts_consent FOREIGN KEY (user_id)
    REFERENCES consent_records (user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_prompts_user_delivered_at ON prompts (user_id, delivered_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_prompts_user_request
  ON prompts (user_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS badge_definitions (
  key text PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  icon text NOT NULL CHECK (char_length(icon) BETWEEN 1 AND 80),
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 60),
  xp_threshold integer NOT NULL DEFAULT 0 CHECK (xp_threshold >= 0),
  is_hidden boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS ix_badge_definitions_hidden ON badge_definitions (is_hidden);

CREATE TABLE IF NOT EXISTS milestone_definitions (
  key text PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  is_hidden boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS ix_milestone_definitions_hidden ON milestone_definitions (is_hidden);

CREATE TABLE IF NOT EXISTS player_states (
  user_id uuid PRIMARY KEY REFERENCES consent_records (user_id) ON DELETE CASCADE,
  total_xp integer NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak integer NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_activity_on date NULL,
  rank_tier text NOT NULL DEFAULT 'Bronze'
    CHECK (rank_tier IN ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend'))
);

CREATE TABLE IF NOT EXISTS xp_events (
  id uuid PRIMARY KEY DEFAULT wellness_uuid(),
  user_id uuid NOT NULL REFERENCES consent_records (user_id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (reason IN ('PromptCompleted', 'GoalCreated', 'ProfileCompleted', 'StreakBonus', 'BadgeUnlocked', 'MilestoneAchieved', 'SocialFollowed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_xp_events_user_created_at ON xp_events (user_id, created_at);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id uuid NOT NULL REFERENCES consent_records (user_id) ON DELETE CASCADE,
  badge_key text NOT NULL REFERENCES badge_definitions (key) ON DELETE RESTRICT,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_key)
);

CREATE TABLE IF NOT EXISTS user_milestones (
  user_id uuid NOT NULL REFERENCES consent_records (user_id) ON DELETE CASCADE,
  milestone_key text NOT NULL REFERENCES milestone_definitions (key) ON DELETE RESTRICT,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, milestone_key)
);

CREATE TABLE IF NOT EXISTS social_profiles (
  user_id uuid PRIMARY KEY REFERENCES consent_records (user_id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  bio text NULL CHECK (bio IS NULL OR char_length(bio) <= 500),
  is_public boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS ix_social_profiles_public ON social_profiles (is_public);

CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid NOT NULL REFERENCES consent_records (user_id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES consent_records (user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT ck_follows_not_self CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS ix_follows_followee ON follows (followee_id);

CREATE TABLE IF NOT EXISTS activity_feed_items (
  id uuid PRIMARY KEY DEFAULT wellness_uuid(),
  user_id uuid NOT NULL REFERENCES consent_records (user_id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('PromptCompleted', 'BadgeEarned', 'MilestoneAchieved', 'LevelUp', 'GoalCreated', 'Followed')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_activity_feed_items_user_created_at ON activity_feed_items (user_id, created_at);

-- The curated equipment catalog is idempotently refreshed from the reference data.
WITH source AS (
  SELECT *
  FROM jsonb_to_recordset($equipment$
[
  {"tag":"under-desk-treadmill","displayName":"Under-desk treadmill","category":"Cardio","description":"Walk slowly while you work. Great for long focus blocks.","recommendedWeeklySessions":3,"minSessionMinutes":30},
  {"tag":"treadmill","displayName":"Treadmill","category":"Cardio","description":"A standing treadmill for brisk walks or intervals."},
  {"tag":"stationary-bike","displayName":"Stationary bike","category":"Cardio","description":"Seated or upright bike for low-impact cardio."},
  {"tag":"jump-rope","displayName":"Jump rope","category":"Cardio","description":"A rope for quick, high-energy conditioning bursts."},
  {"tag":"free-weights","displayName":"Free weights","category":"Strength","description":"Dumbbells or adjustable weights for resistance work."},
  {"tag":"kettlebell","displayName":"Kettlebell","category":"Strength","description":"A single kettlebell for swings, squats, and carries."},
  {"tag":"weight-bench","displayName":"Weight bench","category":"Strength","description":"A flat or adjustable bench for pressing and rows."},
  {"tag":"pull-up-bar","displayName":"Pull-up bar","category":"Strength","description":"A doorway or wall bar for hangs and pulls."},
  {"tag":"bands-light","displayName":"Resistance bands","category":"Strength","description":"Light elastic bands for controlled strength moves."},
  {"tag":"mat","displayName":"Yoga mat","category":"Mobility","description":"A floor mat for stretching and core work."},
  {"tag":"foam-roller","displayName":"Foam roller","category":"Mobility","description":"A roller for releasing tight muscles between sessions."},
  {"tag":"standing-desk","displayName":"Standing desk","category":"Desk","description":"A desk that raises so you can work on your feet."},
  {"tag":"chair-only","displayName":"Office chair","category":"Desk","description":"Your desk chair, for quick seated stretches."}
]
$equipment$::jsonb)
  AS e(
    tag text,
    "displayName" text,
    category text,
    description text,
    "recommendedWeeklySessions" integer,
    "minSessionMinutes" integer
  )
)
INSERT INTO equipment_catalog
  (tag, display_name, category, description, recommended_weekly_sessions, min_session_minutes)
SELECT
  tag, "displayName", category, description, "recommendedWeeklySessions", "minSessionMinutes"
FROM source
ON CONFLICT (tag) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  recommended_weekly_sessions = EXCLUDED.recommended_weekly_sessions,
  min_session_minutes = EXCLUDED.min_session_minutes;

INSERT INTO badge_definitions
  (key, name, description, icon, category, xp_threshold, is_hidden)
VALUES
  ('first-steps', 'First Steps', 'Complete your first wellness prompt.', '👟', 'activity', 0, false),
  ('centurion', 'Centurion', 'Earn your first 100 XP.', '💯', 'xp', 100, false),
  ('five-hundred', 'Half a Grand', 'Earn 500 XP.', '⭐', 'xp', 500, false),
  ('legend-status', 'Legend Status', 'Earn 5 000 XP.', '🏆', 'xp', 5000, false),
  ('goal-setter', 'Goal Setter', 'Create 3 wellness goals.', '🎯', 'goals', 0, false),
  ('bronze-achiever', 'Bronze Achiever', 'Reach level 1.', '🥉', 'rank', 0, false),
  ('silver-achiever', 'Silver Achiever', 'Reach level 5.', '🥈', 'rank', 0, false),
  ('gold-achiever', 'Gold Achiever', 'Reach level 10.', '🥇', 'rank', 0, false),
  ('seven-day-streak', 'Week Warrior', 'Maintain a 7-day wellness streak.', '🔥', 'streak', 0, false),
  ('thirty-day-streak', 'Monthly Maven', 'Maintain a 30-day wellness streak.', '🌟', 'streak', 0, false),
  ('night-owl', 'Night Owl', 'Complete a prompt after 10 PM.', '🦉', 'hidden', 0, true),
  ('comeback-streak', 'Comeback Kid', 'Return to activity after a 3+ day break.', '💪', 'hidden', 0, true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  xp_threshold = EXCLUDED.xp_threshold,
  is_hidden = EXCLUDED.is_hidden;

INSERT INTO milestone_definitions (key, name, description, is_hidden)
VALUES
  ('first-prompt', 'First Prompt', 'Complete your very first wellness prompt.', false),
  ('ten-prompts', '10 Prompts', 'Complete 10 wellness prompts.', false),
  ('fifty-prompts', '50 Prompts', 'Complete 50 wellness prompts.', false),
  ('hundred-prompts', 'Century Club', 'Complete 100 wellness prompts.', false),
  ('first-week', 'First Week', 'Achieve a 7-day activity streak.', false),
  ('social-butterfly', 'Social Butterfly', 'Follow 5 other wellness users.', false),
  ('hidden-marathon', 'Marathon Champion', 'Complete 1 000 wellness prompts.', true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_hidden = EXCLUDED.is_hidden;

-- Activity definitions are the reference catalog. Slug is the stable natural key,
-- so rerunning this seed updates content without changing activity IDs in prompt history.
WITH source AS (
  SELECT *
  FROM jsonb_to_recordset($activities$
[
  {
    "slug": "shoulder-rolls",
    "title": "Shoulder rolls",
    "description": "Roll shoulders backward in slow circles to release upper-back tension built up from keyboard time.",
    "bodyArea": "Upper",
    "intensity": "Low",
    "durationSeconds": 30,
    "equipmentTags": [],
    "animationProvider": "local",
    "animationAssetId": "shoulder-rolls",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)"
  },
  {
    "slug": "neck-half-circles",
    "title": "Neck half-circles",
    "description": "Slow ear-to-chest half-circles, one side then the other, to ease neck stiffness.",
    "bodyArea": "Neck",
    "intensity": "Low",
    "durationSeconds": 30,
    "equipmentTags": [],
    "animationProvider": "local",
    "animationAssetId": "neck-half-circles",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)"
  },
  {
    "slug": "wrist-circles",
    "title": "Wrist circles",
    "description": "Gentle circles in both directions to mobilize wrists after long typing sessions.",
    "bodyArea": "Wrists",
    "intensity": "Low",
    "durationSeconds": 20,
    "equipmentTags": [],
    "animationProvider": "local",
    "animationAssetId": "wrist-circles",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)"
  },
  {
    "slug": "posture-reset",
    "title": "Posture reset",
    "description": "Stand tall, retract shoulder blades, tuck chin gently. Hold and breathe.",
    "bodyArea": "Posture",
    "intensity": "Low",
    "durationSeconds": 20,
    "equipmentTags": [],
    "animationProvider": "local",
    "animationAssetId": "posture-reset",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)"
  },
  {
    "slug": "box-breathing-4-4-4-4",
    "title": "Box breathing 4-4-4-4",
    "description": "Inhale 4, hold 4, exhale 4, hold 4. Reset your nervous system between focus blocks.",
    "bodyArea": "Breath",
    "intensity": "Low",
    "durationSeconds": 60,
    "equipmentTags": [],
    "animationProvider": "local",
    "animationAssetId": "box-breathing-4-4-4-4",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Sit tall and exhale fully to empty your lungs." },
      { "text": "Inhale slowly through your nose.", "holdSeconds": 4 },
      { "text": "Hold your breath, stay relaxed.", "holdSeconds": 4 },
      { "text": "Exhale steadily through your mouth.", "holdSeconds": 4 },
      { "text": "Hold empty before the next breath.", "holdSeconds": 4 },
      { "text": "Repeat the cycle, keeping each phase even.", "sets": 3 }
    ]
  },
  {
    "slug": "breath-4-7-8",
    "title": "4-7-8 breathing",
    "description": "Inhale 4, hold 7, exhale 8. Calming breath pattern for a quick reset.",
    "bodyArea": "Breath",
    "intensity": "Low",
    "durationSeconds": 60,
    "equipmentTags": [],
    "animationProvider": "local",
    "animationAssetId": "breath-4-7-8",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Rest the tip of your tongue behind your top teeth." },
      { "text": "Inhale quietly through your nose.", "holdSeconds": 4 },
      { "text": "Hold your breath.", "holdSeconds": 7 },
      { "text": "Exhale fully through your mouth with a whoosh.", "holdSeconds": 8 },
      { "text": "Repeat the cycle, letting your shoulders drop.", "sets": 4 }
    ]
  },
  {
    "slug": "seated-hip-opener",
    "title": "Seated hip opener",
    "description": "Cross ankle over opposite knee, hinge forward gently from the hips. Switch sides.",
    "bodyArea": "Hips",
    "intensity": "Low",
    "durationSeconds": 45,
    "equipmentTags": ["chair-only"],
    "animationProvider": "local",
    "animationAssetId": "seated-hip-opener",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Sit tall and cross your right ankle over your left knee." },
      { "text": "Hinge forward from the hips until you feel a stretch.", "holdSeconds": 20 },
      { "text": "Switch sides and repeat.", "holdSeconds": 20 }
    ]
  },
  {
    "slug": "ankle-pumps",
    "title": "Ankle pumps",
    "description": "Point and flex feet alternately to keep circulation moving in the lower legs.",
    "bodyArea": "Ankles",
    "intensity": "Low",
    "durationSeconds": 30,
    "equipmentTags": [],
    "animationProvider": "local",
    "animationAssetId": "ankle-pumps",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)"
  },
  {
    "slug": "standing-back-extension",
    "title": "Standing back extension",
    "description": "Hands on hips, lean back gently to reverse the seated-flexion posture. Breathe through it.",
    "bodyArea": "Back",
    "intensity": "Low",
    "durationSeconds": 30,
    "equipmentTags": [],
    "animationProvider": "local",
    "animationAssetId": "standing-back-extension",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)"
  },
  {
    "slug": "calf-raises",
    "title": "Calf raises",
    "description": "Rise onto the balls of your feet, lower with control. A quick lower-body wake-up.",
    "bodyArea": "Lower",
    "intensity": "Medium",
    "durationSeconds": 45,
    "equipmentTags": [],
    "animationProvider": "local",
    "animationAssetId": "calf-raises",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Stand tall with feet hip-width apart." },
      { "text": "Rise onto the balls of your feet, then lower with control.", "reps": 15, "sets": 2 }
    ]
  },
  {
    "slug": "band-pull-aparts",
    "title": "Band pull-aparts",
    "description": "Hold the band at chest height, pull hands apart to engage the upper back. Slow and controlled.",
    "bodyArea": "Upper",
    "intensity": "Medium",
    "durationSeconds": 60,
    "equipmentTags": ["bands-light"],
    "animationProvider": "local",
    "animationAssetId": "band-pull-aparts",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Hold the band at chest height with straight arms." },
      { "text": "Pull your hands apart, squeezing your shoulder blades.", "reps": 12, "sets": 2 },
      { "text": "Return slowly, keeping tension on the band." }
    ]
  },
  {
    "slug": "mat-cat-cow",
    "title": "Cat-cow",
    "description": "On hands and knees, alternate arching and rounding the spine to mobilize the whole back.",
    "bodyArea": "Back",
    "intensity": "Low",
    "durationSeconds": 60,
    "equipmentTags": ["mat"],
    "animationProvider": "local",
    "animationAssetId": "mat-cat-cow",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Start on hands and knees, wrists under shoulders." },
      { "text": "Inhale, drop your belly and lift your gaze (cow).", "holdSeconds": 3 },
      { "text": "Exhale, round your spine and tuck your chin (cat).", "holdSeconds": 3 },
      { "text": "Flow between the two with your breath.", "reps": 8 }
    ]
  },
  {
    "slug": "core-dead-bug",
    "title": "Dead bug",
    "description": "Lying on your back, alternate opposite arm/leg extensions while pressing low back into the floor.",
    "bodyArea": "Core",
    "intensity": "Medium",
    "durationSeconds": 60,
    "equipmentTags": ["mat"],
    "animationProvider": "local",
    "animationAssetId": "core-dead-bug",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Lie on your back, arms up, knees bent over hips." },
      { "text": "Press your low back into the floor and hold it there." },
      { "text": "Extend opposite arm and leg, then return.", "reps": 10, "sets": 2 }
    ]
  },
  {
    "slug": "mat-glute-bridge",
    "title": "Glute bridge",
    "description": "Lying on your back, drive through your heels to lift your hips and wake up the posterior chain.",
    "bodyArea": "Core",
    "intensity": "Medium",
    "durationSeconds": 90,
    "equipmentTags": ["mat"],
    "animationProvider": "local",
    "animationAssetId": "mat-glute-bridge",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Lie on your back, knees bent, feet flat and hip-width." },
      { "text": "Drive through your heels to lift your hips into a line.", "holdSeconds": 2 },
      { "text": "Lower with control and repeat.", "reps": 12, "sets": 2 }
    ]
  },
  {
    "slug": "under-desk-treadmill-walk",
    "title": "Under-desk treadmill walk",
    "description": "A steady 30-minute walk at your desk. Keep working while you rack up easy cardio.",
    "bodyArea": "Full",
    "intensity": "Medium",
    "durationSeconds": 1800,
    "equipmentTags": ["under-desk-treadmill"],
    "animationProvider": "local",
    "animationAssetId": "under-desk-treadmill-walk",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Start the belt slow and find a comfortable, quiet pace." },
      { "text": "Settle in and keep working at a walk you can sustain.", "holdSeconds": 1500 },
      { "text": "Ease the pace down for the last few minutes to cool off.", "holdSeconds": 120 }
    ]
  },
  {
    "slug": "under-desk-treadmill-stroll",
    "title": "Under-desk stroll",
    "description": "A gentle 10-minute walk at your desk when a full session won't fit.",
    "bodyArea": "Full",
    "intensity": "Low",
    "durationSeconds": 600,
    "equipmentTags": ["under-desk-treadmill"],
    "animationProvider": "local",
    "animationAssetId": "under-desk-treadmill-stroll",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Set the belt to an easy pace you barely notice." },
      { "text": "Walk while you read or think, breathing easily.", "holdSeconds": 540 }
    ]
  },
  {
    "slug": "treadmill-brisk-walk",
    "title": "Brisk treadmill walk",
    "description": "A 15-minute brisk walk to raise your heart rate and reset between meetings.",
    "bodyArea": "Full",
    "intensity": "Medium",
    "durationSeconds": 900,
    "equipmentTags": ["treadmill"],
    "animationProvider": "local",
    "animationAssetId": "treadmill-brisk-walk",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Warm up at an easy pace.", "holdSeconds": 120 },
      { "text": "Lift to a brisk walk where talking is a little harder.", "holdSeconds": 660 },
      { "text": "Slow down and let your breathing settle.", "holdSeconds": 120 }
    ]
  },
  {
    "slug": "stationary-bike-spin",
    "title": "Easy bike spin",
    "description": "A 15-minute low-impact spin to move blood without pounding your joints.",
    "bodyArea": "Lower",
    "intensity": "Medium",
    "durationSeconds": 900,
    "equipmentTags": ["stationary-bike"],
    "animationProvider": "local",
    "animationAssetId": "stationary-bike-spin",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Set a light resistance and spin easy to warm up.", "holdSeconds": 120 },
      { "text": "Add a touch of resistance and hold a steady cadence.", "holdSeconds": 660 },
      { "text": "Drop the resistance and spin out to cool down.", "holdSeconds": 120 }
    ]
  },
  {
    "slug": "standing-desk-reset",
    "title": "Standing desk reset",
    "description": "Raise your desk and reset your stance to undo a stretch of sitting.",
    "bodyArea": "Posture",
    "intensity": "Low",
    "durationSeconds": 120,
    "equipmentTags": ["standing-desk"],
    "animationProvider": "local",
    "animationAssetId": "standing-desk-reset",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Raise your desk to standing height." },
      { "text": "Stack your ears over shoulders over hips and stand tall.", "holdSeconds": 20 },
      { "text": "Shift your weight side to side to stay loose.", "holdSeconds": 60 }
    ]
  },
  {
    "slug": "dumbbell-rows",
    "title": "Dumbbell rows",
    "description": "Hinge at the hips and row the weights to your ribs to counter desk-rounded shoulders.",
    "bodyArea": "Upper",
    "intensity": "Medium",
    "durationSeconds": 180,
    "equipmentTags": ["free-weights"],
    "animationProvider": "local",
    "animationAssetId": "dumbbell-rows",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Hinge forward with a flat back, a weight in each hand." },
      { "text": "Row the weights to your ribs, squeezing your back.", "reps": 10, "sets": 3 },
      { "text": "Lower under control between reps." }
    ]
  },
  {
    "slug": "goblet-squats",
    "title": "Goblet squats",
    "description": "Hold one weight at your chest and squat to wake up your legs and hips.",
    "bodyArea": "Lower",
    "intensity": "Medium",
    "durationSeconds": 180,
    "equipmentTags": ["free-weights"],
    "animationProvider": "local",
    "animationAssetId": "goblet-squats",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Hold one weight against your chest with both hands." },
      { "text": "Sit back and down, keeping your chest tall.", "reps": 12, "sets": 3 },
      { "text": "Drive through your heels to stand." }
    ]
  },
  {
    "slug": "dumbbell-bench-press",
    "title": "Dumbbell bench press",
    "description": "Press the weights from a bench to load your chest and shoulders. Warm up first.",
    "bodyArea": "Upper",
    "intensity": "High",
    "durationSeconds": 300,
    "equipmentTags": ["weight-bench", "free-weights"],
    "animationProvider": "local",
    "animationAssetId": "dumbbell-bench-press",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Lie back on the bench with a weight in each hand at chest level." },
      { "text": "Press the weights up until your arms are straight.", "reps": 8, "sets": 3 },
      { "text": "Lower slowly to the start, keeping control." }
    ]
  },
  {
    "slug": "kettlebell-swings",
    "title": "Kettlebell swings",
    "description": "Hinge and snap your hips to swing the bell to chest height. Powerful full-body cardio.",
    "bodyArea": "Full",
    "intensity": "High",
    "durationSeconds": 180,
    "equipmentTags": ["kettlebell"],
    "animationProvider": "local",
    "animationAssetId": "kettlebell-swings",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Stand over the bell, hinge back, and hike it behind you." },
      { "text": "Snap your hips forward to float the bell to chest height.", "reps": 15, "sets": 3 },
      { "text": "Let it swing back down and flow into the next rep." }
    ]
  },
  {
    "slug": "dead-hang",
    "title": "Dead hang",
    "description": "Hang from the bar to decompress your spine and open up tight shoulders.",
    "bodyArea": "Upper",
    "intensity": "Medium",
    "durationSeconds": 60,
    "equipmentTags": ["pull-up-bar"],
    "animationProvider": "local",
    "animationAssetId": "dead-hang",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Grip the bar shoulder-width and let your body hang." },
      { "text": "Relax your shoulders and breathe into the stretch.", "holdSeconds": 30 },
      { "text": "Step down, rest, and repeat if it felt good.", "sets": 2 }
    ]
  },
  {
    "slug": "foam-roll-upper-back",
    "title": "Foam roll upper back",
    "description": "Roll slowly along your upper back to release tension from hours at the keyboard.",
    "bodyArea": "Back",
    "intensity": "Low",
    "durationSeconds": 120,
    "equipmentTags": ["foam-roller"],
    "animationProvider": "local",
    "animationAssetId": "foam-roll-upper-back",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Lie back with the roller across your upper back, hips down." },
      { "text": "Roll slowly between your shoulder blades and mid-back.", "holdSeconds": 90 },
      { "text": "Pause and breathe on any tight spot you find." }
    ]
  },
  {
    "slug": "jump-rope-intervals",
    "title": "Jump rope intervals",
    "description": "Short bursts of skipping with brief rests for a quick, sweaty conditioning hit.",
    "bodyArea": "Full",
    "intensity": "High",
    "durationSeconds": 180,
    "equipmentTags": ["jump-rope"],
    "animationProvider": "local",
    "animationAssetId": "jump-rope-intervals",
    "licenseAttribution": "Curated devngn.ai wellness motion (placeholder asset, v1)",
    "steps": [
      { "text": "Skip at an easy pace to find your rhythm.", "holdSeconds": 30 },
      { "text": "Skip hard, then rest.", "holdSeconds": 30, "sets": 3 },
      { "text": "Finish with easy skips until your breathing settles." }
    ]
  }
]
$activities$::jsonb)
  AS a(
    slug text,
    title text,
    description text,
    "bodyArea" text,
    intensity text,
    "durationSeconds" integer,
    "equipmentTags" jsonb,
    "animationProvider" text,
    "animationAssetId" text,
    "licenseAttribution" text,
    steps jsonb
  )
)
INSERT INTO activities (
  slug,
  title,
  description,
  body_area,
  intensity,
  duration_seconds,
  equipment_tags,
  animation_provider,
  animation_asset_id,
  license_attribution,
  steps
)
SELECT
  slug,
  title,
  description,
  "bodyArea",
  intensity,
  "durationSeconds",
  ARRAY(SELECT jsonb_array_elements_text(COALESCE("equipmentTags", '[]'::jsonb))),
  "animationProvider",
  "animationAssetId",
  "licenseAttribution",
  COALESCE(steps, '[]'::jsonb)
FROM source
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  body_area = EXCLUDED.body_area,
  intensity = EXCLUDED.intensity,
  duration_seconds = EXCLUDED.duration_seconds,
  equipment_tags = EXCLUDED.equipment_tags,
  animation_provider = EXCLUDED.animation_provider,
  animation_asset_id = EXCLUDED.animation_asset_id,
  license_attribution = EXCLUDED.license_attribution,
  steps = EXCLUDED.steps;
