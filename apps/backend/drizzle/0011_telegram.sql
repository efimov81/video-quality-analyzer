CREATE TABLE "telegram_job_notifications" (
	"video_id" uuid PRIMARY KEY NOT NULL,
	"bot_id" text NOT NULL,
	"telegram_user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" integer NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"retry_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_preferences" (
	"telegram_user_id" text PRIMARY KEY NOT NULL,
	"language" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_job_notifications" ADD CONSTRAINT "telegram_job_notifications_video_id_jobs_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_notification_message_unique" ON "telegram_job_notifications" USING btree ("bot_id","chat_id","message_id");--> statement-breakpoint
CREATE INDEX "telegram_notifications_pending_idx" ON "telegram_job_notifications" USING btree ("bot_id","retry_at") WHERE "telegram_job_notifications"."state" = 'pending';