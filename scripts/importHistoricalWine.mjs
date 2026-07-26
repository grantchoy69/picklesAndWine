import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_SOURCE = "ourNotes.json";
const HOUSEHOLD_ID = 1;
const PERSON_IDS = new Map([
  ["grant", 1],
  ["gracie", 1],
  ["kyle", 2],
]);

const PALATE_METRICS = new Map([
  ["dry_sweet", "sweetness"],
  ["light_body_full_body", "body"],
  ["low_acid_high_acid", "acidity"],
  ["soft_tannins_firm_tannins", "tannin_firmness"],
  ["simple_complex", "complexity"],
  ["short_finish_long_finish", "finish_length"],
]);

const VIBE_PROMPTS = new Map([
  ["vibeField1", "vibe_field_1"],
  ["vibeField2", "vibe_field_2"],
  ["vibeField3", "vibe_field_3"],
]);

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableUuid(namespace, value) {
  const hex = sha256(`${namespace}:${value}`).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8).join(""),
    hex.slice(8, 12).join(""),
    hex.slice(12, 16).join(""),
    hex.slice(16, 20).join(""),
    hex.slice(20, 32).join(""),
  ].join("-");
}

function normalized(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function personIdFor(rawTaster) {
  return PERSON_IDS.get(normalized(rawTaster)) ?? null;
}

function numericRating(rawRating) {
  return typeof rawRating === "number" && Number.isFinite(rawRating)
    ? rawRating
    : null;
}

function rawScalar(value) {
  if (value === undefined || value === null) {
    return null;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function explicitTenPointValue(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }
  const match = rawValue.match(/\((\d+(?:\.\d+)?)\s*\/\s*10\)/i);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return value >= 0 && value <= 10 ? value : null;
}

function sourceIdentity(record) {
  const basics = record.wine_basics ?? {};
  return {
    producer: String(basics.Producer ?? "").trim(),
    vintage: String(basics.vintage ?? "").trim(),
    grape: String(basics.grape_s ?? "").trim(),
  };
}

function sessionKey(record) {
  const identity = sourceIdentity(record);
  return [
    normalized(identity.producer),
    normalized(identity.vintage),
    normalized(identity.grape),
  ].join("|");
}

function uniqueNonBlank(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot serialize non-finite SQL number: ${value}`);
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonbLiteral(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function parseVintage(rawVintage) {
  return /^\d{4}$/.test(rawVintage) ? Number(rawVintage) : null;
}

function parsePrice(rawPrice) {
  const match = String(rawPrice ?? "").trim().match(/^\$(\d+(?:\.\d{1,2})?)$/);
  return match ? Number(match[1]) : null;
}

function acquisitionType(rawPrice) {
  if (/^gift$/i.test(String(rawPrice ?? "").trim())) {
    return "gift";
  }
  return parsePrice(rawPrice) === null ? "unknown" : "purchased";
}

function classifyGroup(group) {
  const geographyValues = uniqueNonBlank(
    group.records.map(({ record }) => record.wine_basics?.region_country),
  );
  const priceValues = uniqueNonBlank(
    group.records.map(({ record }) => record.wine_basics?.price),
  );
  const tasterIds = group.records.map(({ record }) => personIdFor(record.taster));
  const identity = sourceIdentity(group.records[0].record);
  const flags = [];

  if (geographyValues.length > 1) {
    flags.push({
      code: "conflicting_geography",
      severity: "review",
      message: `Probable shared bottle has ${geographyValues.length} geography strings.`,
      details: { values: geographyValues },
    });
  }

  if (priceValues.length > 1) {
    flags.push({
      code: "conflicting_price",
      severity: "review",
      message: `Probable shared bottle has ${priceValues.length} price strings.`,
      details: { values: priceValues },
    });
  }

  if (new Set(tasterIds).size !== tasterIds.length) {
    flags.push({
      code: "duplicate_taster_in_session",
      severity: "blocking",
      message: "The proposed session contains more than one review for the same person.",
      details: { tasterIds },
    });
  }

  return {
    key: group.key,
    identity,
    sourceIndexes: group.records.map(({ index }) => index),
    tasters: group.records.map(({ record }) => record.taster),
    geographyValues,
    priceValues,
    confidence: flags.some((flag) => flag.code === "conflicting_geography") ? 0.7 : 1,
    flags,
  };
}

export function analyzeHistoricalWine(records, sourceName = DEFAULT_SOURCE) {
  if (!Array.isArray(records)) {
    throw new TypeError("Historical wine source must be a JSON array.");
  }

  const recordReports = records.map((record, index) => {
    const tasterId = personIdFor(record.taster);
    const flags = [];
    const rating = numericRating(record.rating);

    if (tasterId === null) {
      flags.push({
        code: "unknown_taster",
        severity: "blocking",
        field: "taster",
        raw: record.taster,
      });
    }

    if (rating === null) {
      flags.push({
        code: rawScalar(record.rating) ? "non_numeric_rating" : "missing_rating",
        severity: "review",
        field: "rating",
        raw: rawScalar(record.rating),
      });
    }

    for (const [legacyField, metricCode] of PALATE_METRICS) {
      const raw = record.palate?.[legacyField];
      if (raw && explicitTenPointValue(raw) === null) {
        flags.push({
          code: "categorical_measurement_preserved",
          severity: "info",
          field: `palate.${legacyField}`,
          metricCode,
          raw,
        });
      }
    }

    const notesBlob = [
      ...(record.aromas?.extra_notes ?? []),
      record.personal_notes ?? "",
    ].join(" ");
    if (/referment|didn'?t dry before bottling/i.test(notesBlob)) {
      flags.push({
        code: "candidate_fault_refermentation",
        severity: "review",
        field: "aromas.extra_notes/personal_notes",
        raw: notesBlob,
      });
    }

    return {
      sourceIndex: index,
      sourceHash: sha256(canonicalJson(record)),
      tasterRaw: record.taster,
      personId: tasterId,
      proposedSessionKey: sessionKey(record),
      numericRating: rating,
      flags,
    };
  });

  const groups = new Map();
  for (const [index, record] of records.entries()) {
    const key = sessionKey(record);
    const group = groups.get(key) ?? { key, records: [] };
    group.records.push({ index, record });
    groups.set(key, group);
  }

  const sessions = [...groups.values()].map(classifyGroup);
  const blockingIssues = [
    ...recordReports.flatMap((record) => record.flags),
    ...sessions.flatMap((session) => session.flags),
  ].filter((flag) => flag.severity === "blocking");

  return {
    mode: "dry-run",
    sourceName,
    householdId: HOUSEHOLD_ID,
    identityMap: {
      historicalGrant: 1,
      Gracie: 1,
      Kyle: 2,
    },
    counts: {
      sourceReviews: records.length,
      proposedSessions: sessions.length,
      numericRatings: recordReports.filter((record) => record.numericRating !== null).length,
      recordsNeedingReview: recordReports.filter((record) =>
        record.flags.some((flag) => flag.severity === "review"),
      ).length,
      blockingIssues: blockingIssues.length,
    },
    sessions,
    records: recordReports,
    readyToGenerateSql:
      records.length > 0 && sessions.length > 0 && blockingIssues.length === 0,
  };
}

function insertSql(table, columns, values, conflict = "do nothing") {
  return `insert into ${table} (${columns.join(", ")})\nvalues (${values
    .map(sqlLiteral)
    .join(", ")})\non conflict ${conflict};`;
}

export function buildHistoricalImportSql(records, report, sourceName = DEFAULT_SOURCE) {
  if (!report.readyToGenerateSql) {
    throw new Error("Dry-run report is not ready to generate SQL.");
  }

  const groups = new Map();
  for (const [index, record] of records.entries()) {
    const key = sessionKey(record);
    const group = groups.get(key) ?? { key, records: [] };
    group.records.push({ index, record });
    groups.set(key, group);
  }

  const lines = [
    "-- Generated by scripts/importHistoricalWine.mjs.",
    "-- Historical source payloads remain immutable; reruns are idempotent.",
    "begin;",
    "",
  ];

  for (const group of groups.values()) {
    const summary = classifyGroup(group);
    const identity = summary.identity;
    const producerKey = normalized(identity.producer);
    const wineKey = `${producerKey}|${normalized(identity.grape)}`;
    const releaseKey = `${wineKey}|${normalized(identity.vintage)}`;
    const producerId = stableUuid("producer", producerKey);
    const wineId = stableUuid("wine", wineKey);
    const releaseId = stableUuid("release", releaseKey);
    const bottleId = stableUuid("bottle", group.key);
    const tastingSessionId = stableUuid("tasting-session", group.key);
    const geographyRaw = summary.geographyValues.join(" | ") || null;
    const firstPrice = group.records[0].record.wine_basics?.price ?? "";
    const locationValues = uniqueNonBlank(
      group.records.map(({ record }) => record.wine_basics?.where_we_tasted_it),
    );
    const atHome = locationValues.every((value) => /^home\b/i.test(value));

    lines.push(
      insertSql(
        "wine.producers",
        ["id", "household_id", "name", "normalized_name"],
        [producerId, HOUSEHOLD_ID, identity.producer, producerKey],
      ),
      insertSql(
        "wine.wines",
        [
          "id",
          "household_id",
          "producer_id",
          "cuvee_name",
          "normalized_cuvee_name",
          "wine_name_raw",
        ],
        [wineId, HOUSEHOLD_ID, producerId, identity.grape, normalized(identity.grape), identity.grape],
      ),
      insertSql(
        "wine.releases",
        [
          "id",
          "household_id",
          "wine_id",
          "vintage_year",
          "vintage_raw",
          "is_non_vintage",
          "geography_raw",
        ],
        [
          releaseId,
          HOUSEHOLD_ID,
          wineId,
          parseVintage(identity.vintage),
          identity.vintage || null,
          false,
          geographyRaw,
        ],
      ),
    );

    if (identity.grape) {
      const grapeName = identity.grape.trim();
      const grapeId = stableUuid("grape", normalized(grapeName));
      lines.push(
        insertSql(
          "wine.grapes",
          ["id", "household_id", "canonical_name", "normalized_name"],
          [grapeId, HOUSEHOLD_ID, grapeName, normalized(grapeName)],
        ),
        insertSql(
          "wine.release_grapes",
          ["id", "household_id", "release_id", "grape_id", "source_text"],
          [
            stableUuid("release-grape", `${releaseId}|${grapeId}`),
            HOUSEHOLD_ID,
            releaseId,
            grapeId,
            grapeName,
          ],
        ),
      );
    }

    lines.push(
      insertSql(
        "wine.bottles",
        [
          "id",
          "household_id",
          "release_id",
          "price_amount",
          "price_raw",
          "currency_code",
          "acquisition_type",
        ],
        [
          bottleId,
          HOUSEHOLD_ID,
          releaseId,
          parsePrice(firstPrice),
          rawScalar(firstPrice),
          parsePrice(firstPrice) === null ? null : "USD",
          acquisitionType(firstPrice),
        ],
      ),
      insertSql(
        "wine.tasting_sessions",
        [
          "id",
          "household_id",
          "bottle_id",
          "date_precision",
          "location_name",
          "location_context",
          "source_confidence",
        ],
        [
          tastingSessionId,
          HOUSEHOLD_ID,
          bottleId,
          "unknown",
          atHome ? "Home" : null,
          locationValues.join(" | ") || null,
          summary.confidence,
        ],
      ),
    );

    const pizzaPairing =
      locationValues.some((value) => /pizza/i.test(value)) ||
      group.records.some(({ record }) => /pizza/i.test(record.personal_notes ?? ""));
    const pairingId = pizzaPairing ? stableUuid("pairing", `${group.key}|pizza`) : null;
    if (pairingId) {
      lines.push(
        insertSql(
          "wine.pairings",
          [
            "id",
            "household_id",
            "tasting_session_id",
            "pairing_type",
            "name",
            "sequence_number",
          ],
          [pairingId, HOUSEHOLD_ID, tastingSessionId, "food", "Pizza", 1],
        ),
      );
    }

    lines.push(
      insertSql(
        "wine.data_quality_issues",
        [
          "id",
          "household_id",
          "entity_type",
          "entity_id",
          "issue_code",
          "severity",
          "message",
          "details",
        ],
        [
          stableUuid("quality-issue", `${group.key}|inferred-session`),
          HOUSEHOLD_ID,
          "tasting_session",
          tastingSessionId,
          "inferred_session_grouping",
          "review",
          "Historical reviews were grouped heuristically into one probable tasting session.",
          JSON.stringify({
            sourceIndexes: summary.sourceIndexes,
            tasters: summary.tasters,
            confidence: summary.confidence,
          }),
        ],
      ),
    );

    for (const flag of summary.flags) {
      lines.push(
        insertSql(
          "wine.data_quality_issues",
          [
            "id",
            "household_id",
            "entity_type",
            "entity_id",
            "issue_code",
            "severity",
            "message",
            "details",
          ],
          [
            stableUuid("quality-issue", `${group.key}|${flag.code}`),
            HOUSEHOLD_ID,
            "tasting_session",
            tastingSessionId,
            flag.code,
            flag.severity,
            flag.message,
            JSON.stringify(flag.details ?? {}),
          ],
        ),
      );
    }

    for (const { index, record } of group.records) {
      const recordReport = report.records[index];
      const personId = recordReport.personId;
      const sourceRecordId = stableUuid("source-record", recordReport.sourceHash);
      const reviewId = stableUuid("review", `${sourceRecordId}|${personId}`);
      const checkpointId = stableUuid("checkpoint", `${reviewId}|initial`);
      const ratingRaw = rawScalar(record.rating);
      const needsReview = recordReport.flags.some((flag) => flag.severity === "review");

      lines.push(
        `insert into wine.source_records (
  id, household_id, source_type, source_name, source_index, source_hash,
  raw_payload, imported_at, resolution_status
)
values (
  ${sqlLiteral(sourceRecordId)}, ${HOUSEHOLD_ID}, 'legacy_json',
  ${sqlLiteral(sourceName)}, ${index}, ${sqlLiteral(recordReport.sourceHash)},
  ${jsonbLiteral(record)}, now(), ${sqlLiteral(needsReview ? "needs_review" : "proposed")}
)
on conflict do nothing;`,
        insertSql(
          "wine.reviews",
          [
            "id",
            "household_id",
            "tasting_session_id",
            "person_id",
            "overall_enjoyment",
            "overall_rating_raw",
            "personal_notes",
            "review_status",
            "form_version",
          ],
          [
            reviewId,
            HOUSEHOLD_ID,
            tastingSessionId,
            personId,
            numericRating(record.rating),
            ratingRaw,
            record.personal_notes ?? null,
            needsReview ? "needs_review" : "complete",
            "legacy-json-v1",
          ],
        ),
        insertSql(
          "wine.review_checkpoints",
          [
            "id",
            "household_id",
            "review_id",
            "sequence_number",
            "stage",
            "pairing_id",
            "enjoyment_rating",
          ],
          [
            checkpointId,
            HOUSEHOLD_ID,
            reviewId,
            1,
            "initial",
            null,
            numericRating(record.rating),
          ],
        ),
        insertSql(
          "wine.appearance_observations",
          [
            "id",
            "household_id",
            "review_id",
            "color_intensity_raw",
            "hue_raw",
            "clarity_raw",
            "viscosity_raw",
          ],
          [
            stableUuid("appearance", reviewId),
            HOUSEHOLD_ID,
            reviewId,
            record.appearance?.color || null,
            record.appearance?.huse || null,
            record.appearance?.clarity || null,
            record.appearance?.viscosity || null,
          ],
        ),
      );

      for (const [legacyField, metricCode] of PALATE_METRICS) {
        const rawValue = record.palate?.[legacyField];
        if (!rawValue) {
          continue;
        }
        const explicitValue = explicitTenPointValue(rawValue);
        lines.push(
          insertSql(
            "wine.checkpoint_measurements",
            [
              "id",
              "household_id",
              "checkpoint_id",
              "metric_code",
              "value_numeric",
              "value_raw",
              "normalization_method",
              "normalization_confidence",
            ],
            [
              stableUuid("measurement", `${checkpointId}|${metricCode}`),
              HOUSEHOLD_ID,
              checkpointId,
              metricCode,
              explicitValue,
              rawValue,
              explicitValue === null ? "raw_only" : "explicit_parenthetical",
              explicitValue === null ? null : 1,
            ],
          ),
        );
      }

      const descriptorSections = [
        ["fruit", record.aromas?.fruit ?? []],
        ["non_fruit", record.aromas?.non_fruit ?? []],
        ["extra_notes", record.aromas?.extra_notes ?? []],
      ];
      for (const [sourceSection, descriptors] of descriptorSections) {
        for (const [descriptorIndex, rawText] of descriptors.entries()) {
          lines.push(
            insertSql(
              "wine.descriptor_observations",
              [
                "id",
                "household_id",
                "checkpoint_id",
                "source_section",
                "raw_text",
                "certainty",
                "sequence_number",
              ],
              [
                stableUuid(
                  "descriptor-observation",
                  `${checkpointId}|${sourceSection}|${descriptorIndex}`,
                ),
                HOUSEHOLD_ID,
                checkpointId,
                sourceSection,
                rawText,
                /\?\s*$/.test(rawText) ? 0.5 : null,
                descriptorIndex + 1,
              ],
            ),
          );
        }
      }

      for (const [legacyField, promptCode] of VIBE_PROMPTS) {
        const response = record.vibes_personality?.[legacyField];
        if (response === undefined || response === null) {
          continue;
        }
        const responseId = stableUuid("prompt-response", `${reviewId}|${promptCode}`);
        lines.push(`insert into wine.prompt_responses (
  id, household_id, review_id, prompt_definition_id, response_text, sequence_number
)
select
  ${sqlLiteral(responseId)},
  ${HOUSEHOLD_ID},
  ${sqlLiteral(reviewId)},
  prompt.id,
  ${sqlLiteral(response)},
  prompt.sequence_number
from wine.prompt_definitions as prompt
where prompt.household_id = ${HOUSEHOLD_ID}
  and prompt.form_version = 'legacy-json-v1'
  and prompt.prompt_code = ${sqlLiteral(promptCode)}
on conflict do nothing;`);
      }

      lines.push(
        insertSql(
          "wine.source_links",
          [
            "id",
            "household_id",
            "source_record_id",
            "review_id",
            "link_method",
            "link_confidence",
          ],
          [
            stableUuid("source-link", `${sourceRecordId}|${reviewId}`),
            HOUSEHOLD_ID,
            sourceRecordId,
            reviewId,
            "deterministic_legacy_import",
            1,
          ],
        ),
      );

      for (const flag of recordReport.flags.filter((item) => item.severity === "review")) {
        lines.push(
          insertSql(
            "wine.data_quality_issues",
            [
              "id",
              "household_id",
              "source_record_id",
              "entity_type",
              "entity_id",
              "issue_code",
              "field_path",
              "severity",
              "message",
              "details",
            ],
            [
              stableUuid("quality-issue", `${sourceRecordId}|${flag.code}|${flag.field}`),
              HOUSEHOLD_ID,
              sourceRecordId,
              "review",
              reviewId,
              flag.code,
              flag.field,
              flag.severity,
              `Historical field requires human review: ${flag.field}.`,
              JSON.stringify({ raw: flag.raw ?? null }),
            ],
          ),
        );
      }
    }

    lines.push("");
  }

  lines.push("commit;", "");
  return lines.join("\n");
}

async function backupBeforeOverwrite(targetPath) {
  if (!existsSync(targetPath)) {
    return null;
  }

  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const backupPath = `${targetPath}.${timestamp}.bak`;
  await copyFile(targetPath, backupPath);
  return backupPath;
}

async function writeOutput(targetPath, contents) {
  const absoluteTarget = path.resolve(targetPath);
  await mkdir(path.dirname(absoluteTarget), { recursive: true });
  const backupPath = await backupBeforeOverwrite(absoluteTarget);
  await writeFile(absoluteTarget, contents, "utf8");
  return { target: absoluteTarget, backup: backupPath };
}

function parseArguments(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    report: null,
    emitSql: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source") {
      options.source = argv[++index];
    } else if (argument === "--report") {
      options.report = argv[++index];
    } else if (argument === "--emit-sql") {
      options.emitSql = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function usage() {
  return `Historical Wine Importer

Default behavior is a read-only dry run:
  node scripts/importHistoricalWine.mjs

Options:
  --source PATH       Historical JSON source (default: ourNotes.json)
  --report PATH       Write the dry-run report; backs up an existing target first
  --emit-sql PATH     Write idempotent import SQL; backs up an existing target first
  --help              Show this message
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const sourcePath = path.resolve(options.source);
  const sourceText = await readFile(sourcePath, "utf8");
  const sourceHashBefore = sha256(sourceText);
  const records = JSON.parse(sourceText);
  const report = analyzeHistoricalWine(records, path.basename(sourcePath));

  const outputs = [];
  if (options.report) {
    outputs.push(
      await writeOutput(options.report, `${JSON.stringify(report, null, 2)}\n`),
    );
  }
  if (options.emitSql) {
    outputs.push(
      await writeOutput(
        options.emitSql,
        buildHistoricalImportSql(records, report, path.basename(sourcePath)),
      ),
    );
  }

  const sourceHashAfter = sha256(await readFile(sourcePath, "utf8"));
  if (sourceHashAfter !== sourceHashBefore) {
    throw new Error("Source JSON changed while the importer was running.");
  }

  console.log(
    JSON.stringify(
      {
        ...report,
        sourceFileSha256: sourceHashBefore,
        sourceUnchanged: true,
        outputs,
      },
      null,
      2,
    ),
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
