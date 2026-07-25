-- Optional accent-insensitive search support. Managed Postgres may require
-- extension privileges; Prisma migrate deploy will skip creation if present.
CREATE EXTENSION IF NOT EXISTS unaccent;
