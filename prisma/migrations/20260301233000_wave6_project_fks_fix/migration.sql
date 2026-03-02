DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Avvik_projectId_fkey'
    ) THEN
        ALTER TABLE "Avvik"
            ADD CONSTRAINT "Avvik_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'MaterialItem_projectId_fkey'
    ) THEN
        ALTER TABLE "MaterialItem"
            ADD CONSTRAINT "MaterialItem_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;