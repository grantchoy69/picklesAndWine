create table wine.producers (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  normalized_name text not null check (length(btrim(normalized_name)) > 0),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  notes text,
  created_by_person_id smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, normalized_name),
  foreign key (household_id, created_by_person_id)
    references lab.people(household_id, id)
);

create table wine.wines (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  producer_id uuid not null,
  cuvee_name text,
  normalized_cuvee_name text not null default '',
  wine_name_raw text,
  color_style text check (
    color_style is null
    or color_style in ('red', 'white', 'rose', 'orange', 'other')
  ),
  sparkling_style text check (
    sparkling_style is null
    or sparkling_style in ('still', 'petillant', 'sparkling', 'other')
  ),
  sweetness_style text,
  notes text,
  created_by_person_id smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, producer_id, normalized_cuvee_name),
  foreign key (household_id, producer_id)
    references wine.producers(household_id, id)
    on delete restrict,
  foreign key (household_id, created_by_person_id)
    references lab.people(household_id, id)
);

create table wine.releases (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  wine_id uuid not null,
  vintage_year smallint check (vintage_year is null or vintage_year between 1000 and 2200),
  vintage_raw text,
  is_non_vintage boolean not null default false,
  appellation text,
  region text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  geography_raw text,
  abv numeric(4,2) check (abv is null or abv between 0 and 30),
  technical_notes text,
  created_by_person_id smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check (not (vintage_year is not null and is_non_vintage)),
  foreign key (household_id, wine_id)
    references wine.wines(household_id, id)
    on delete restrict,
  foreign key (household_id, created_by_person_id)
    references lab.people(household_id, id)
);

create table wine.grapes (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  canonical_name text not null check (length(btrim(canonical_name)) > 0),
  normalized_name text not null check (length(btrim(normalized_name)) > 0),
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, normalized_name)
);

create table wine.release_grapes (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  release_id uuid not null,
  grape_id uuid not null,
  percentage numeric(5,2) check (percentage is null or percentage between 0 and 100),
  is_primary boolean,
  source_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (release_id, grape_id),
  foreign key (household_id, release_id)
    references wine.releases(household_id, id)
    on delete cascade,
  foreign key (household_id, grape_id)
    references wine.grapes(household_id, id)
    on delete restrict
);

create table wine.bottles (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  release_id uuid not null,
  bottle_size_ml integer check (bottle_size_ml is null or bottle_size_ml > 0),
  price_amount numeric(10,2) check (price_amount is null or price_amount >= 0),
  price_raw text,
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  acquisition_type text not null default 'unknown' check (
    acquisition_type in ('purchased', 'gift', 'restaurant', 'unknown')
  ),
  acquisition_source text,
  purchase_date date,
  storage_notes text,
  bottle_code text,
  created_by_person_id smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, bottle_code),
  foreign key (household_id, release_id)
    references wine.releases(household_id, id)
    on delete restrict,
  foreign key (household_id, created_by_person_id)
    references lab.people(household_id, id)
);

create table wine.tasting_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  bottle_id uuid not null,
  started_at timestamptz,
  date_precision text not null default 'unknown' check (
    date_precision in ('minute', 'day', 'month', 'year', 'unknown')
  ),
  location_name text,
  location_context text,
  occasion_notes text,
  service_notes text,
  source_confidence numeric(4,3) check (
    source_confidence is null or source_confidence between 0 and 1
  ),
  created_by_person_id smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, bottle_id)
    references wine.bottles(household_id, id)
    on delete restrict,
  foreign key (household_id, created_by_person_id)
    references lab.people(household_id, id)
);

create table wine.reviews (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  tasting_session_id uuid not null,
  person_id smallint not null,
  overall_enjoyment numeric(4,2) check (
    overall_enjoyment is null or overall_enjoyment between 0 and 10
  ),
  overall_rating_raw text,
  technical_quality numeric(4,2) check (
    technical_quality is null or technical_quality between 0 and 10
  ),
  novelty_interest numeric(4,2) check (
    novelty_interest is null or novelty_interest between 0 and 10
  ),
  typicity numeric(4,2) check (typicity is null or typicity between 0 and 10),
  confidence numeric(4,2) check (confidence is null or confidence between 0 and 10),
  repurchase_intent text,
  personal_notes text,
  review_status text not null default 'draft' check (
    review_status in ('draft', 'complete', 'needs_review')
  ),
  form_version text not null default 'legacy-json-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (tasting_session_id, person_id),
  foreign key (household_id, tasting_session_id)
    references wine.tasting_sessions(household_id, id)
    on delete cascade,
  foreign key (household_id, person_id)
    references lab.people(household_id, id)
    on delete restrict
);

create table wine.pairings (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  tasting_session_id uuid not null,
  pairing_type text not null check (
    pairing_type in ('food', 'water', 'other_beverage', 'none')
  ),
  name text not null check (length(btrim(name)) > 0),
  description text,
  sequence_number integer not null default 1 check (sequence_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (tasting_session_id, sequence_number),
  foreign key (household_id, tasting_session_id)
    references wine.tasting_sessions(household_id, id)
    on delete cascade
);

create table wine.review_checkpoints (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  review_id uuid not null,
  sequence_number integer not null check (sequence_number > 0),
  stage text not null default 'initial' check (
    stage in ('initial', 'with_food', 'after_time', 'warmer', 'next_day', 'custom')
  ),
  elapsed_open_minutes integer check (
    elapsed_open_minutes is null or elapsed_open_minutes >= 0
  ),
  serving_temperature_c numeric(5,2),
  pairing_id uuid,
  enjoyment_rating numeric(4,2) check (
    enjoyment_rating is null or enjoyment_rating between 0 and 10
  ),
  finish_pleasure numeric(4,2) check (
    finish_pleasure is null or finish_pleasure between 0 and 10
  ),
  interest_rating numeric(4,2) check (
    interest_rating is null or interest_rating between 0 and 10
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (review_id, sequence_number),
  foreign key (household_id, review_id)
    references wine.reviews(household_id, id)
    on delete cascade,
  foreign key (household_id, pairing_id)
    references wine.pairings(household_id, id)
    on delete restrict
);

create table wine.metric_definitions (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  metric_code text not null check (metric_code ~ '^[a-z][a-z0-9_]*$'),
  display_name text not null,
  low_anchor text,
  high_anchor text,
  scale_min numeric(8,3) not null default 0,
  scale_max numeric(8,3) not null default 10,
  unit text,
  active_from_form_version text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, metric_code),
  check (scale_max > scale_min)
);

create table wine.checkpoint_measurements (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  checkpoint_id uuid not null,
  metric_code text not null,
  value_numeric numeric(8,3),
  value_raw text,
  normalization_method text,
  normalization_confidence numeric(4,3) check (
    normalization_confidence is null or normalization_confidence between 0 and 1
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (checkpoint_id, metric_code),
  foreign key (household_id, checkpoint_id)
    references wine.review_checkpoints(household_id, id)
    on delete cascade,
  foreign key (household_id, metric_code)
    references wine.metric_definitions(household_id, metric_code)
    on delete restrict
);

create table wine.appearance_observations (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  review_id uuid not null,
  color_intensity_numeric numeric(4,2) check (
    color_intensity_numeric is null or color_intensity_numeric between 0 and 10
  ),
  color_intensity_raw text,
  hue_normalized text,
  hue_raw text,
  clarity_normalized text,
  clarity_raw text,
  viscosity_numeric numeric(4,2) check (
    viscosity_numeric is null or viscosity_numeric between 0 and 10
  ),
  viscosity_raw text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (review_id),
  foreign key (household_id, review_id)
    references wine.reviews(household_id, id)
    on delete cascade
);

create table wine.descriptors (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  canonical_name text not null,
  normalized_name text not null,
  descriptor_family text,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, normalized_name)
);

create table wine.descriptor_observations (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  checkpoint_id uuid not null,
  descriptor_id uuid,
  source_section text not null check (
    source_section in ('fruit', 'non_fruit', 'extra_notes', 'palate', 'other')
  ),
  raw_text text not null,
  intensity numeric(4,2) check (intensity is null or intensity between 0 and 10),
  certainty numeric(4,3) check (certainty is null or certainty between 0 and 1),
  sequence_number integer not null check (sequence_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (checkpoint_id, source_section, sequence_number),
  foreign key (household_id, checkpoint_id)
    references wine.review_checkpoints(household_id, id)
    on delete cascade,
  foreign key (household_id, descriptor_id)
    references wine.descriptors(household_id, id)
    on delete restrict
);

create table wine.prompt_definitions (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  prompt_code text not null check (prompt_code ~ '^[a-z][a-z0-9_]*$'),
  form_version text not null,
  prompt_text text not null,
  sequence_number integer not null check (sequence_number > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, form_version, prompt_code)
);

create table wine.prompt_responses (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  review_id uuid not null,
  prompt_definition_id uuid not null,
  response_text text,
  sequence_number integer not null check (sequence_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (review_id, prompt_definition_id),
  foreign key (household_id, review_id)
    references wine.reviews(household_id, id)
    on delete cascade,
  foreign key (household_id, prompt_definition_id)
    references wine.prompt_definitions(household_id, id)
    on delete restrict
);

create table wine.fault_definitions (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  fault_code text not null check (fault_code ~ '^[a-z][a-z0-9_]*$'),
  display_name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, fault_code)
);

create table wine.fault_observations (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  tasting_session_id uuid not null,
  observed_by_person_id smallint not null,
  fault_code text not null,
  severity numeric(4,2) check (severity is null or severity between 0 and 10),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  note text,
  confirmed boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, tasting_session_id)
    references wine.tasting_sessions(household_id, id)
    on delete cascade,
  foreign key (household_id, observed_by_person_id)
    references lab.people(household_id, id)
    on delete restrict,
  foreign key (household_id, fault_code)
    references wine.fault_definitions(household_id, fault_code)
    on delete restrict
);

create index producers_household_idx on wine.producers (household_id);
create index wines_producer_idx on wine.wines (household_id, producer_id);
create index releases_wine_idx on wine.releases (household_id, wine_id);
create index bottles_release_idx on wine.bottles (household_id, release_id);
create index tasting_sessions_bottle_idx on wine.tasting_sessions (household_id, bottle_id);
create index reviews_session_idx on wine.reviews (household_id, tasting_session_id);
create index reviews_person_idx on wine.reviews (household_id, person_id);
create index checkpoints_review_idx on wine.review_checkpoints (household_id, review_id);
create index descriptor_observations_checkpoint_idx
  on wine.descriptor_observations (household_id, checkpoint_id);
create index fault_observations_session_idx
  on wine.fault_observations (household_id, tasting_session_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'producers', 'wines', 'releases', 'grapes', 'release_grapes', 'bottles',
    'tasting_sessions', 'reviews', 'pairings', 'review_checkpoints',
    'metric_definitions', 'checkpoint_measurements', 'appearance_observations',
    'descriptors', 'descriptor_observations', 'prompt_definitions',
    'prompt_responses', 'fault_definitions', 'fault_observations'
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

insert into wine.metric_definitions (
  household_id,
  metric_code,
  display_name,
  low_anchor,
  high_anchor
)
values
  (1, 'sweetness', 'Sweetness', 'Dry', 'Sweet'),
  (1, 'body', 'Body', 'Light', 'Full'),
  (1, 'acidity', 'Acidity', 'Low', 'High'),
  (1, 'tannin_firmness', 'Tannin firmness', 'Soft', 'Firm'),
  (1, 'complexity', 'Complexity', 'Simple', 'Complex'),
  (1, 'finish_length', 'Finish length', 'Short', 'Long'),
  (1, 'finish_pleasure', 'Finish pleasure', 'Unpleasant', 'Pleasurable'),
  (1, 'aroma_intensity', 'Aroma intensity', 'Low', 'High'),
  (1, 'flavor_intensity', 'Flavor intensity', 'Low', 'High'),
  (1, 'alcohol_warmth', 'Alcohol warmth', 'Low', 'High')
on conflict (household_id, metric_code) do nothing;

insert into wine.prompt_definitions (
  household_id,
  prompt_code,
  form_version,
  prompt_text,
  sequence_number
)
values
  (1, 'vibe_field_1', 'legacy-json-v1', 'Vibe / personality field 1', 1),
  (1, 'vibe_field_2', 'legacy-json-v1', 'Vibe / personality field 2', 2),
  (1, 'vibe_field_3', 'legacy-json-v1', 'Vibe / personality field 3', 3)
on conflict (household_id, form_version, prompt_code) do nothing;

insert into wine.fault_definitions (
  household_id,
  fault_code,
  display_name
)
values
  (1, 'volatile_acidity', 'Volatile acidity'),
  (1, 'brettanomyces', 'Brettanomyces markers'),
  (1, 'oxidation', 'Oxidation'),
  (1, 'reduction', 'Reduction'),
  (1, 'refermentation', 'Unintended refermentation'),
  (1, 'cork_taint', 'Cork taint'),
  (1, 'heat_damage', 'Heat damage'),
  (1, 'other', 'Other')
on conflict (household_id, fault_code) do nothing;
