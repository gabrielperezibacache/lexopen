ALTER TABLE "CaseDocumentIntake"
    DROP CONSTRAINT "CaseDocumentIntake_source_check",
    ADD CONSTRAINT "CaseDocumentIntake_source_check" CHECK ("source" IN ('manual', 'mail', 'drive', 'ojv'));
