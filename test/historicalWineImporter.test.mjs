import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeHistoricalWine,
  buildHistoricalImportSql,
} from "../scripts/importHistoricalWine.mjs";

const records = JSON.parse(
  await readFile(new URL("../ourNotes.json", import.meta.url), "utf8"),
);

test("historical dry run reconciles the known source inventory", () => {
  const report = analyzeHistoricalWine(records);

  assert.equal(report.counts.sourceReviews, 11);
  assert.equal(report.counts.proposedSessions, 6);
  assert.equal(report.counts.blockingIssues, 0);
  assert.equal(report.readyToGenerateSql, true);
});

test("historical Grant maps to Gracie without mutating raw source", () => {
  const before = JSON.stringify(records);
  const report = analyzeHistoricalWine(records);

  assert.equal(report.identityMap.historicalGrant, 1);
  assert.equal(report.identityMap.Gracie, 1);
  assert.equal(JSON.stringify(records), before);
});

test("ambiguous ratings remain null and enter the review queue", () => {
  const report = analyzeHistoricalWine(records);
  const proseRating = report.records.find(
    (record) => record.flags.some((flag) => flag.code === "non_numeric_rating"),
  );
  const missingRating = report.records.find(
    (record) => record.flags.some((flag) => flag.code === "missing_rating"),
  );

  assert.equal(proseRating.numericRating, null);
  assert.equal(missingRating.numericRating, null);
});

test("generated SQL is transactional, idempotent, and preserves raw payloads", () => {
  const report = analyzeHistoricalWine(records);
  const sql = buildHistoricalImportSql(records, report);

  assert.match(sql, /^-- Generated/m);
  assert.match(sql, /\nbegin;\n/);
  assert.match(sql, /\ncommit;\n?$/);
  assert.match(sql, /on conflict do nothing;/);
  assert.match(sql, /raw_payload/);
  assert.equal((sql.match(/insert into wine\.source_records/g) ?? []).length, 11);
});
