UPDATE "acceptance_profiles"
SET "version" = "version" + 1,
	"criteria" = jsonb_set(
		jsonb_set("criteria", '{resolution,minAspectRatio}', '0.3'::jsonb, true),
		'{resolution,maxAspectRatio}', '2.4'::jsonb, true
	),
	"updated_at" = now()
WHERE "criteria" #> '{resolution,minAspectRatio}' IS NULL
	OR "criteria" #> '{resolution,maxAspectRatio}' IS NULL;--> statement-breakpoint
INSERT INTO "acceptance_profile_versions" ("profile_id", "version", "name", "description", "is_active", "criteria")
SELECT profile."id", profile."version", profile."name", profile."description", profile."is_active", profile."criteria"
FROM "acceptance_profiles" AS profile
WHERE NOT EXISTS (
	SELECT 1 FROM "acceptance_profile_versions" AS version
	WHERE version."profile_id" = profile."id" AND version."version" = profile."version"
);
