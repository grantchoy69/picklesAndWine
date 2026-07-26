import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";

import {
  analyzeHistoricalWine,
  buildHistoricalImportSql,
} from "./importHistoricalWine.mjs";

const GRACIE_AUTH_ID = "11111111-1111-4111-8111-111111111111";
const KYLE_AUTH_ID = "22222222-2222-4222-8222-222222222222";
const OUTSIDER_AUTH_ID = "33333333-3333-4333-8333-333333333333";

async function scalar(database, sql) {
  const result = await database.query(sql);
  return Object.values(result.rows[0])[0];
}

async function bootstrapSupabaseShims(database) {
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;

    create or replace function public.rls_auto_enable()
    returns void
    language plpgsql
    security definer
    set search_path = 'pg_catalog'
    as $$
    begin
      null;
    end;
    $$;

    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text not null unique
    );
    insert into auth.users (id, email)
    values
      ('${GRACIE_AUTH_ID}', 'grant@handymangrant.com'),
      ('${KYLE_AUTH_ID}', 'kyleaamundson@gmail.com'),
      ('${OUTSIDER_AUTH_ID}', 'outsider@example.com');

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      bucket_id text not null,
      name text not null,
      primary key (bucket_id, name)
    );
    alter table storage.objects enable row level security;

    create or replace function storage.foldername(object_name text)
    returns text[]
    language sql
    immutable
    as $$
      select (string_to_array(object_name, '/'))[
        1:greatest(cardinality(string_to_array(object_name, '/')) - 1, 0)
      ];
    $$;

    grant usage on schema storage to authenticated, service_role;
    grant select, insert, update, delete on storage.objects to authenticated, service_role;
  `);
}

async function applyMigrations(database) {
  const migrationDirectory = path.resolve("supabase/migrations");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  assert.equal(migrationFiles.length, 6);
  for (const migrationFile of migrationFiles) {
    const sql = await readFile(path.join(migrationDirectory, migrationFile), "utf8");
    await database.exec(sql);
  }

  assert.equal(
    await scalar(
      database,
      "select has_function_privilege('anon', 'public.rls_auto_enable()', 'execute')",
    ),
    false,
  );
  assert.equal(
    await scalar(
      database,
      `select count(*)::integer
       from lab.memberships
       where auth_user_id = '${GRACIE_AUTH_ID}'
         and household_id = 1
         and person_id = 1
         and role = 'owner'
         and active`,
    ),
    1,
  );
  assert.equal(
    await scalar(
      database,
      `select count(*)::integer
       from lab.memberships
       where auth_user_id = '${KYLE_AUTH_ID}'
         and household_id = 1
         and person_id = 2
         and role = 'editor'
         and active`,
    ),
    1,
  );
}

async function assertRls(database) {
  await database.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '${GRACIE_AUTH_ID}';
  `);
  assert.equal(await scalar(database, "select count(*)::integer from wine.reviews"), 11);
  assert.equal(await scalar(database, "select count(*)::integer from lab.people"), 2);
  await database.exec(`
    insert into storage.objects (bucket_id, name)
    values ('wine-card-images', '1/card.jpg');
  `);
  await database.exec("reset role");

  await database.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '${OUTSIDER_AUTH_ID}';
  `);
  assert.equal(await scalar(database, "select count(*)::integer from wine.reviews"), 0);
  assert.equal(await scalar(database, "select count(*)::integer from lab.people"), 0);
  await assert.rejects(
    database.exec(`
      insert into storage.objects (bucket_id, name)
      values ('wine-card-images', '1/outsider.jpg');
    `),
  );
  await database.exec("reset role");

  await database.exec("set role anon");
  await assert.rejects(
    database.query("select count(*) from wine.reviews"),
  );
  await database.exec("reset role");
}

async function main() {
  const database = new PGlite();
  await database.waitReady;
  await bootstrapSupabaseShims(database);
  await applyMigrations(database);

  const records = JSON.parse(await readFile("ourNotes.json", "utf8"));
  const report = analyzeHistoricalWine(records);
  const importSql = buildHistoricalImportSql(records, report);

  await database.exec(importSql);
  assert.equal(await scalar(database, "select count(*)::integer from wine.reviews"), 11);
  assert.equal(
    await scalar(database, "select count(*)::integer from wine.tasting_sessions"),
    6,
  );
  assert.equal(
    await scalar(database, "select count(*)::integer from wine.source_records"),
    11,
  );

  await database.exec(importSql);
  assert.equal(await scalar(database, "select count(*)::integer from wine.reviews"), 11);
  assert.equal(
    await scalar(database, "select count(*)::integer from wine.tasting_sessions"),
    6,
  );

  await assertRls(database);
  await database.close();

  console.log(
    JSON.stringify(
      {
        migrationsApplied: 6,
        historicalReviews: 11,
        proposedSessions: 6,
        idempotentRerun: true,
        memberAccess: true,
        outsiderIsolation: true,
        anonymousAccessBlocked: true,
        storagePathIsolation: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
