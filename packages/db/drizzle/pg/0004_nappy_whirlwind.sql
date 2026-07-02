CREATE TABLE "publish_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repo_name" text NOT NULL,
	"repo_owner" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"selection" text DEFAULT '[]' NOT NULL,
	"last_commit_sha" text,
	"last_published_at" timestamp with time zone,
	"artifact_state" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publish_targets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "publish_targets" ADD CONSTRAINT "publish_targets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;