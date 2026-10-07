CREATE TABLE "compositions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"fragments" text DEFAULT '[]' NOT NULL,
	"order" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" text PRIMARY KEY NOT NULL,
	"repo_url" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"skill_name" text,
	"type" text DEFAULT 'repo' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_repo_url_skill_name_unique" UNIQUE("repo_url","skill_name")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"tags" text DEFAULT '[]' NOT NULL,
	"author" text,
	"version" text,
	"content" text NOT NULL,
	"dir_path" text,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_name_unique" UNIQUE("name"),
	CONSTRAINT "skills_dir_path_unique" UNIQUE("dir_path")
);
--> statement-breakpoint
CREATE TABLE "variations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" text,
	"content" text NOT NULL,
	"file_path" text,
	"skill_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "variations" ADD CONSTRAINT "variations_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;