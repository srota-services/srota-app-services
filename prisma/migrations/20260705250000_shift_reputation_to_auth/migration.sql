-- Drop reputation tables moved to auth-service
DROP TABLE IF EXISTS "organization_reviews";
DROP TABLE IF EXISTS "author_reviews";
DROP TABLE IF EXISTS "organization_tiers";
DROP TABLE IF EXISTS "author_tiers";

DROP TYPE IF EXISTS "ReviewerType";
DROP TYPE IF EXISTS "ReputationTierLevel";
