CREATE TYPE "public"."analysis_run_status" AS ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."check_status" AS ENUM('PASS', 'FAIL', 'WARNING', 'ERROR', 'SKIPPED');--> statement-breakpoint
CREATE TABLE "acceptance_profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"is_active" boolean NOT NULL,
	"criteria" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acceptance_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"criteria" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_check_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"check_type" text NOT NULL,
	"status" "check_status" NOT NULL,
	"measured_value" jsonb,
	"expected_value" jsonb,
	"details" text NOT NULL,
	"analyzer_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_check_result_id" uuid NOT NULL,
	"timestamp" double precision NOT NULL,
	"problem_type" text NOT NULL,
	"measured_value" jsonb,
	"details" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"profile_version" integer NOT NULL,
	"profile_snapshot" jsonb NOT NULL,
	"status" "analysis_run_status" DEFAULT 'QUEUED' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "acceptance_profile_versions" ADD CONSTRAINT "acceptance_profile_versions_profile_id_acceptance_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."acceptance_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_check_results" ADD CONSTRAINT "analysis_check_results_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_evidence" ADD CONSTRAINT "analysis_evidence_analysis_check_result_id_analysis_check_results_id_fk" FOREIGN KEY ("analysis_check_result_id") REFERENCES "public"."analysis_check_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_video_id_jobs_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_profile_id_acceptance_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."acceptance_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acceptance_profile_version_unique" ON "acceptance_profile_versions" USING btree ("profile_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_check_result_unique" ON "analysis_check_results" USING btree ("analysis_run_id","check_type");--> statement-breakpoint
CREATE INDEX "analysis_check_run_idx" ON "analysis_check_results" USING btree ("analysis_run_id");--> statement-breakpoint
CREATE INDEX "analysis_evidence_result_timestamp_idx" ON "analysis_evidence" USING btree ("analysis_check_result_id","timestamp");--> statement-breakpoint
CREATE INDEX "analysis_runs_video_created_idx" ON "analysis_runs" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE INDEX "analysis_runs_status_idx" ON "analysis_runs" USING btree ("status");--> statement-breakpoint
INSERT INTO "acceptance_profiles" ("id", "name", "description", "version", "is_active", "criteria") VALUES (
	'00000000-0000-4000-8000-000000000001',
	'Default technical profile',
	'Базовая проверка технических параметров видео. Экспериментальные и неподдерживаемые проверки помечаются предупреждениями.',
	1,
	true,
	'{"resolution":{"enabled":true,"minWidth":1920,"minHeight":1080,"portraitAware":true,"minVideoBitrateBps":null,"minDurationSec":1,"maxDurationSec":21600},"audio_presence":{"enabled":true,"required":true},"audio_silence":{"enabled":true,"thresholdDb":-60,"minSegmentSec":2,"maxSegmentSec":30},"scene_cuts":{"enabled":true,"minIntervalSec":5,"maxFrequentCuts":0,"sensitivity":15},"audio_loudness":{"enabled":true,"minIntegratedLufs":-35,"maxIntegratedLufs":-8,"maxTruePeakDbtp":-1},"audio_clipping":{"enabled":true,"maxClippedSampleRatio":0.001},"background_noise":{"enabled":true},"speech_vad":{"enabled":true},"visual_brightness":{"enabled":true,"overexposedY":250,"darkY":10,"maxProblemFrameRatio":0.1},"blur":{"enabled":true,"maxBlurMetric":null},"black_screens":{"enabled":true,"minDurationSec":0.5,"pixelThreshold":0.1},"frozen_frames":{"enabled":true,"minDurationSec":2,"noiseDb":-60},"upscaling_experimental":{"enabled":true}}'::jsonb
);--> statement-breakpoint
INSERT INTO "acceptance_profile_versions" ("profile_id", "version", "name", "description", "is_active", "criteria")
SELECT "id", "version", "name", "description", "is_active", "criteria"
FROM "acceptance_profiles"
WHERE "id" = '00000000-0000-4000-8000-000000000001';
