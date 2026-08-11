-- User passwords must always be supplied by application code and stored hashed.
ALTER TABLE "User" ALTER COLUMN "password" DROP DEFAULT;
