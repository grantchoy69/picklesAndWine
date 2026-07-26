create table wine.hypotheses (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  statement text not null check (length(btrim(statement)) > 0),
  status text not null default 'proposed' check (
    status in ('proposed', 'active', 'supported', 'weakened', 'inconclusive', 'retired')
  ),
  priority smallint check (priority is null or priority between 1 and 5),
  created_by_person_id smallint not null,
  opened_at timestamptz,
  closed_at timestamptz,
  conclusion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check (closed_at is null or opened_at is null or closed_at >= opened_at),
  foreign key (household_id, created_by_person_id)
    references lab.people(household_id, id)
    on delete restrict
);

create table wine.hypothesis_evidence (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  hypothesis_id uuid not null,
  tasting_session_id uuid,
  review_id uuid,
  checkpoint_id uuid,
  direction text not null check (
    direction in ('supports', 'weakens', 'neutral', 'complicates')
  ),
  weight numeric(4,3) check (weight is null or weight between 0 and 1),
  interpretation text not null,
  added_by_person_id smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check (num_nonnulls(tasting_session_id, review_id, checkpoint_id) = 1),
  foreign key (household_id, hypothesis_id)
    references wine.hypotheses(household_id, id)
    on delete cascade,
  foreign key (household_id, tasting_session_id)
    references wine.tasting_sessions(household_id, id)
    on delete cascade,
  foreign key (household_id, review_id)
    references wine.reviews(household_id, id)
    on delete cascade,
  foreign key (household_id, checkpoint_id)
    references wine.review_checkpoints(household_id, id)
    on delete cascade,
  foreign key (household_id, added_by_person_id)
    references lab.people(household_id, id)
    on delete restrict
);

create table wine.source_records (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  source_type text not null check (
    source_type in ('legacy_json', 'card_ocr', 'manual_import', 'other')
  ),
  source_name text not null,
  source_index integer not null check (source_index >= 0),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  raw_payload jsonb not null,
  imported_at timestamptz,
  resolution_status text not null default 'pending' check (
    resolution_status in ('pending', 'proposed', 'resolved', 'needs_review', 'rejected')
  ),
  created_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, source_type, source_name, source_index),
  unique (household_id, source_hash)
);

create table wine.source_links (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  source_record_id uuid not null,
  release_id uuid,
  bottle_id uuid,
  tasting_session_id uuid,
  review_id uuid,
  link_method text not null,
  link_confidence numeric(4,3) check (
    link_confidence is null or link_confidence between 0 and 1
  ),
  created_at timestamptz not null default now(),
  unique (household_id, id),
  unique (source_record_id, release_id, bottle_id, tasting_session_id, review_id),
  check (num_nonnulls(release_id, bottle_id, tasting_session_id, review_id) = 1),
  foreign key (household_id, source_record_id)
    references wine.source_records(household_id, id)
    on delete restrict,
  foreign key (household_id, release_id)
    references wine.releases(household_id, id)
    on delete restrict,
  foreign key (household_id, bottle_id)
    references wine.bottles(household_id, id)
    on delete restrict,
  foreign key (household_id, tasting_session_id)
    references wine.tasting_sessions(household_id, id)
    on delete restrict,
  foreign key (household_id, review_id)
    references wine.reviews(household_id, id)
    on delete restrict
);

create table wine.source_documents (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null,
  page_count integer check (page_count is null or page_count > 0),
  uploaded_by_person_id smallint not null,
  document_type text not null check (
    document_type in ('wine_tasting_card', 'wine_profile_card', 'other')
  ),
  form_version text,
  status text not null default 'uploaded' check (
    status in ('uploaded', 'extracting', 'needs_review', 'approved', 'rejected', 'failed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, sha256),
  unique (household_id, storage_path),
  foreign key (household_id, uploaded_by_person_id)
    references lab.people(household_id, id)
    on delete restrict
);

create table wine.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  source_document_id uuid not null,
  provider text not null,
  model text not null,
  model_version text,
  prompt_version text not null,
  raw_output jsonb,
  proposed_payload jsonb,
  confidence_summary jsonb,
  status text not null default 'extracting' check (
    status in ('extracting', 'needs_review', 'completed', 'failed')
  ),
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check (completed_at is null or completed_at >= started_at),
  foreign key (household_id, source_document_id)
    references wine.source_documents(household_id, id)
    on delete cascade
);

create table wine.ingestion_drafts (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  source_document_id uuid not null,
  extraction_run_id uuid,
  draft_payload jsonb not null,
  validation_errors jsonb not null default '[]'::jsonb,
  reviewed_by_person_id smallint,
  reviewed_at timestamptz,
  status text not null default 'needs_review' check (
    status in ('needs_review', 'approved', 'rejected')
  ),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (source_document_id, extraction_run_id),
  check (
    (status <> 'approved')
    or (reviewed_by_person_id is not null and reviewed_at is not null and approved_at is not null)
  ),
  foreign key (household_id, source_document_id)
    references wine.source_documents(household_id, id)
    on delete cascade,
  foreign key (household_id, extraction_run_id)
    references wine.extraction_runs(household_id, id)
    on delete restrict,
  foreign key (household_id, reviewed_by_person_id)
    references lab.people(household_id, id)
    on delete restrict
);

create table wine.data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  source_record_id uuid,
  entity_type text,
  entity_id uuid,
  issue_code text not null,
  field_path text,
  severity text not null default 'review' check (
    severity in ('info', 'review', 'blocking')
  ),
  message text not null,
  details jsonb,
  status text not null default 'open' check (
    status in ('open', 'resolved', 'accepted')
  ),
  resolved_by_person_id smallint,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, source_record_id)
    references wine.source_records(household_id, id)
    on delete restrict,
  foreign key (household_id, resolved_by_person_id)
    references lab.people(household_id, id)
    on delete restrict
);

create index hypotheses_household_status_idx
  on wine.hypotheses (household_id, status);
create index hypothesis_evidence_hypothesis_idx
  on wine.hypothesis_evidence (household_id, hypothesis_id);
create index source_records_resolution_idx
  on wine.source_records (household_id, resolution_status);
create index source_links_source_idx
  on wine.source_links (household_id, source_record_id);
create index source_documents_status_idx
  on wine.source_documents (household_id, status);
create index ingestion_drafts_status_idx
  on wine.ingestion_drafts (household_id, status);
create index data_quality_issues_status_idx
  on wine.data_quality_issues (household_id, status, severity);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'hypotheses', 'hypothesis_evidence', 'source_documents', 'extraction_runs',
    'ingestion_drafts', 'data_quality_issues'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on wine.%I
       for each row execute function private.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create view wine.review_fact
with (security_invoker = true)
as
select
  review.household_id,
  review.id as review_id,
  review.person_id,
  person.display_name as taster_name,
  review.tasting_session_id,
  session.bottle_id,
  bottle.release_id,
  release.wine_id,
  producer.name as producer_name,
  wine_record.cuvee_name,
  release.vintage_year,
  release.vintage_raw,
  review.overall_enjoyment,
  review.technical_quality,
  review.novelty_interest,
  review.review_status,
  review.created_at
from wine.reviews as review
join lab.people as person
  on person.household_id = review.household_id
 and person.id = review.person_id
join wine.tasting_sessions as session
  on session.household_id = review.household_id
 and session.id = review.tasting_session_id
join wine.bottles as bottle
  on bottle.household_id = session.household_id
 and bottle.id = session.bottle_id
join wine.releases as release
  on release.household_id = bottle.household_id
 and release.id = bottle.release_id
join wine.wines as wine_record
  on wine_record.household_id = release.household_id
 and wine_record.id = release.wine_id
join wine.producers as producer
  on producer.household_id = wine_record.household_id
 and producer.id = wine_record.producer_id;

create view wine.checkpoint_fact
with (security_invoker = true)
as
select
  checkpoint.household_id,
  checkpoint.id as checkpoint_id,
  checkpoint.review_id,
  review.person_id,
  review.tasting_session_id,
  checkpoint.sequence_number,
  checkpoint.stage,
  checkpoint.elapsed_open_minutes,
  checkpoint.serving_temperature_c,
  checkpoint.enjoyment_rating,
  checkpoint.finish_pleasure,
  checkpoint.interest_rating,
  checkpoint.pairing_id
from wine.review_checkpoints as checkpoint
join wine.reviews as review
  on review.household_id = checkpoint.household_id
 and review.id = checkpoint.review_id;

create view wine.data_quality_queue
with (security_invoker = true)
as
select
  issue.household_id,
  issue.id,
  issue.source_record_id,
  issue.entity_type,
  issue.entity_id,
  issue.issue_code,
  issue.field_path,
  issue.severity,
  issue.message,
  issue.details,
  issue.created_at
from wine.data_quality_issues as issue
where issue.status = 'open';
