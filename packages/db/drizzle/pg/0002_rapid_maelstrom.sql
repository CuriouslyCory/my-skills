ALTER TABLE "config" DROP CONSTRAINT "config_key_unique";--> statement-breakpoint
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_repo_url_skill_name_unique";--> statement-breakpoint
ALTER TABLE "skills" DROP CONSTRAINT "skills_name_unique";--> statement-breakpoint
ALTER TABLE "skills" DROP CONSTRAINT "skills_dir_path_unique";--> statement-breakpoint
ALTER TABLE "compositions" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "config" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "compositions" ADD CONSTRAINT "compositions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config" ADD CONSTRAINT "config_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config" ADD CONSTRAINT "config_user_id_key_unique" UNIQUE("user_id","key");--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_repo_url_skill_name_unique" UNIQUE("user_id","repo_url","skill_name");--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_name_unique" UNIQUE("user_id","name");--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_dir_path_unique" UNIQUE("user_id","dir_path");