CREATE INDEX "compositions_user_id_idx" ON "compositions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "variations_skill_id_idx" ON "variations" USING btree ("skill_id");