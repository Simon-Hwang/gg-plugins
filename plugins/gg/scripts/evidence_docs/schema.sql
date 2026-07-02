PRAGMA foreign_keys = ON;

CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE claims (
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  statement TEXT NOT NULL,
  fact_type TEXT NOT NULL,
  risk TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  PRIMARY KEY (id, revision)
);

CREATE TABLE evidence_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  raw_json TEXT NOT NULL
);

CREATE TABLE verdicts (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  claim_revision INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  raw_json TEXT NOT NULL,
  FOREIGN KEY (claim_id, claim_revision) REFERENCES claims(id, revision)
);

CREATE TABLE findings (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE UNIQUE INDEX one_active_finding_per_fingerprint
ON findings(fingerprint)
WHERE status IN ('open','acknowledged','fixing','pending-validation','pending-review','disputed','reopened');

CREATE VIRTUAL TABLE claim_fts USING fts5(id UNINDEXED, statement);

CREATE TRIGGER claims_ai AFTER INSERT ON claims BEGIN
  INSERT INTO claim_fts(rowid, id, statement) VALUES (new.rowid, new.id, new.statement);
END;
