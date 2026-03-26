path = "supabase/migrations/20260304142601_remote_schema.sql"
prefix = "DO $$ BEGIN\n  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'readonly') THEN\n    CREATE ROLE readonly;\n  END IF;\nEND $$;\n\n"
content = open(path).read()
open(path, "w").write(prefix + content)
print("Done")
