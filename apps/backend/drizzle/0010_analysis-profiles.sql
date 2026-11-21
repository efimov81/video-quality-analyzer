CREATE TABLE "job_auto_analyses" (
	"video_id" uuid PRIMARY KEY NOT NULL,
	"profile_version_id" uuid NOT NULL,
	"run_id" uuid,
	"dispatched_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "acceptance_profiles" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "acceptance_profiles" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_auto_analyses" ADD CONSTRAINT "job_auto_analyses_video_id_jobs_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_auto_analyses" ADD CONSTRAINT "job_auto_analyses_profile_version_id_acceptance_profile_versions_id_fk" FOREIGN KEY ("profile_version_id") REFERENCES "public"."acceptance_profile_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_auto_analyses" ADD CONSTRAINT "job_auto_analyses_run_id_analysis_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_auto_analyses_pending_idx" ON "job_auto_analyses" USING btree ("video_id") WHERE "job_auto_analyses"."dispatched_at" IS NULL;--> statement-breakpoint
UPDATE "acceptance_profiles"
SET "code" = CASE WHEN "id" = '00000000-0000-4000-8000-000000000001' THEN 'base' ELSE 'profile-' || "id"::text END;--> statement-breakpoint
ALTER TABLE "acceptance_profiles" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
UPDATE "acceptance_profiles" SET "is_default" = true
WHERE "id" = (
  SELECT "id" FROM "acceptance_profiles" WHERE "is_active"
  ORDER BY ("code" = 'base') DESC, "created_at", "id" LIMIT 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "acceptance_profiles_code_unique" ON "acceptance_profiles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "acceptance_profiles_default_unique" ON "acceptance_profiles" USING btree ("is_default") WHERE "acceptance_profiles"."is_default";--> statement-breakpoint
ALTER TABLE "acceptance_profiles" ADD CONSTRAINT "acceptance_profiles_default_active" CHECK (not "acceptance_profiles"."is_default" or "acceptance_profiles"."is_active");