UPDATE "acceptance_profiles"
SET "version" = "version" + 1,
	"criteria" = jsonb_set(
		jsonb_set("criteria", '{resolution,minAspectRatio}', '0.3'::jsonb, true),
		'{resolution,maxAspectRatio}', '2.4'::jsonb, true
	),
	"updated_at" = now()
WHERE "id" = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
INSERT INTO "acceptance_profile_versions" ("profile_id", "version", "name", "description", "is_active", "criteria")
SELECT "id", "version", "name", "description", "is_active", "criteria"
FROM "acceptance_profiles"
WHERE "id" = '00000000-0000-4000-8000-000000000001';
