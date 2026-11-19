CREATE TYPE "public"."job_status" AS ENUM('QUEUED', 'DOWNLOADING', 'DOWNLOADED', 'FAILED');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_url" text NOT NULL,
	"title" text,
	"description" text,
	"local_path" text,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
