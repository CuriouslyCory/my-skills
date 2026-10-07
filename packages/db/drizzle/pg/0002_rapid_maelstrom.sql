ALTER TABLE "config" DROP CONSTRAINT "config_key_unique";--> statement-breakpoint
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_repo_url_skill_name_unique";--> statement-breakpoint
ALTER TABLE "skills" DROP CONSTRAINT "skills_name_unique";--> statement-breakpoint
ALTER TABLE "skills" DROP CONSTRAINT "skills_dir_path_unique";--> statement-breakpoint
-- Ownership is added nullable, backfilled, then tightened to NOT NULL: adding a
-- NOT NULL column without a default fails outright on any populated table.
ALTER TABLE "compositions" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "user_id" text;--> statement-breakpoint
-- Pre-ownership rows came from the single-user era. They are assigned to the
-- auto-provisioned local user (the same `local@my-skills.local` account that
-- local mode's `ensureLocalUser` resolves by email, and that the SQLite upgrade
-- in `src/sqlite-upgrade.ts` backfills to). That account has no credentials or
-- linked OAuth identity, so in hosted mode the legacy rows stay unreachable
-- rather than being handed to an arbitrary signed-up user; an operator can
-- reassign them by updating `user_id`. The user is only created when there is
-- something to own.
INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'Local', 'local@my-skills.local', true, now(), now()
WHERE EXISTS (SELECT 1 FROM "compositions")
	OR EXISTS (SELECT 1 FROM "config")
	OR EXISTS (SELECT 1 FROM "favorites")
	OR EXISTS (SELECT 1 FROM "skills")
ON CONFLICT ("email") DO NOTHING;--> statement-breakpoint
UPDATE "compositions" SET "user_id" = (SELECT "id" FROM "user" WHERE "email" = 'local@my-skills.local') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "config" SET "user_id" = (SELECT "id" FROM "user" WHERE "email" = 'local@my-skills.local') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "favorites" SET "user_id" = (SELECT "id" FROM "user" WHERE "email" = 'local@my-skills.local') WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "skills" SET "user_id" = (SELECT "id" FROM "user" WHERE "email" = 'local@my-skills.local') WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "compositions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "config" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "compositions" ADD CONSTRAINT "compositions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config" ADD CONSTRAINT "config_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config" ADD CONSTRAINT "config_user_id_key_unique" UNIQUE("user_id","key");--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_repo_url_skill_name_unique" UNIQUE("user_id","repo_url","skill_name");--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_name_unique" UNIQUE("user_id","name");--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_dir_path_unique" UNIQUE("user_id","dir_path");
