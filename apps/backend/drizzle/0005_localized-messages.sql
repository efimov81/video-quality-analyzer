ALTER TABLE "analysis_check_results" ADD COLUMN "message_code" text;--> statement-breakpoint
ALTER TABLE "analysis_check_results" ADD COLUMN "message_params" jsonb;--> statement-breakpoint
ALTER TABLE "analysis_evidence" ADD COLUMN "message_code" text;--> statement-breakpoint
ALTER TABLE "analysis_evidence" ADD COLUMN "message_params" jsonb;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "error_code" text;