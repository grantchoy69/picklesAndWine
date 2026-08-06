create schema if not exists pickle;
comment on schema pickle is 'Private fermented-pickle experiments, tastings, pairings, and ingestion records.';
revoke all on schema pickle from public, anon;

create table pickle.experiments (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  title text not null,
  research_question text,
  hypothesis text,
  purpose text not null default 'explore' check (purpose in ('refine','extend','explore','replicate','recombine','legacy')),
  status text not null default 'planned' check (status in ('planned','active','completed','abandoned')),
  designed_by_person_id smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id,id),
  foreign key (household_id,designed_by_person_id) references lab.people(household_id,id)
);

create table pickle.batches (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  experiment_id uuid,
  batch_code text not null,
  fermentation_type text not null default 'lacto_fermented' check (fermentation_type='lacto_fermented'),
  prepared_at timestamptz,
  record_status text not null default 'active' check (record_status in ('planned','active','evaluated','failed_spoilage','failed_texture','incomplete','discarded','unknown')),
  analysis_eligibility text not null default 'eligible' check (analysis_eligibility in ('include','eligible','limited_legacy','exclude_failed','exclude_discarded')),
  recipe_payload jsonb not null default '{}'::jsonb,
  process_payload jsonb not null default '{}'::jsonb,
  source_confidence numeric(4,3) check (source_confidence between 0 and 1),
  created_by_person_id smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id,id),
  unique (household_id,batch_code),
  foreign key (household_id,experiment_id) references pickle.experiments(household_id,id),
  foreign key (household_id,created_by_person_id) references lab.people(household_id,id)
);

create table pickle.batch_parents (
  household_id smallint not null references lab.households(id) on delete restrict,
  child_batch_id uuid not null,
  parent_batch_id uuid not null,
  branch_purpose text,
  changes_from_parent jsonb not null default '[]'::jsonb,
  primary key (child_batch_id,parent_batch_id),
  foreign key (household_id,child_batch_id) references pickle.batches(household_id,id) on delete cascade,
  foreign key (household_id,parent_batch_id) references pickle.batches(household_id,id) on delete restrict,
  check (child_batch_id <> parent_batch_id)
);

create table pickle.ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  normalized_name text not null,
  display_name text not null,
  ingredient_role text not null check (ingredient_role in ('vegetable','aromatic','spice','sweetener','other')),
  created_at timestamptz not null default now(),
  unique (household_id,id),
  unique (household_id,normalized_name)
);

create table pickle.batch_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  batch_id uuid not null,
  ingredient_id uuid not null,
  role text not null,
  quantity_value numeric,
  quantity_unit text,
  raw_text text,
  confidence numeric(4,3) check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (household_id,id),
  foreign key (household_id,batch_id) references pickle.batches(household_id,id) on delete cascade,
  foreign key (household_id,ingredient_id) references pickle.ingredients(household_id,id) on delete restrict
);

create table pickle.fermentation_states (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  batch_id uuid not null,
  state_code text not null,
  observed_at timestamptz,
  fermentation_day numeric,
  storage_stage text,
  ph numeric check (ph is null or (ph >= 0 and ph <= 14)),
  temperature_c numeric,
  visual_activity text,
  aroma text,
  texture text,
  brine_appearance text,
  checkpoint_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id,id),
  unique (household_id,state_code),
  foreign key (household_id,batch_id) references pickle.batches(household_id,id) on delete cascade
);

create table pickle.tastings (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  fermentation_state_id uuid not null,
  taster_person_id smallint not null,
  recorded_by_person_id smallint not null,
  overall_rating numeric check (overall_rating is null or overall_rating between 0 and 20),
  raw_rating_text text,
  crunch numeric check (crunch is null or crunch between 0 and 10),
  salt_balance numeric check (salt_balance is null or salt_balance between 0 and 10),
  sourness numeric check (sourness is null or sourness between 0 and 10),
  heat numeric check (heat is null or heat between 0 and 10),
  flavor_intensity numeric check (flavor_intensity is null or flavor_intensity between 0 and 10),
  interestingness numeric check (interestingness is null or interestingness between 0 and 10),
  would_eat_again boolean,
  would_explore_branch boolean,
  verbatim_comments jsonb not null default '[]'::jsonb,
  rating_context text not null default 'contemporaneous' check (rating_context in ('contemporaneous','retrospective_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id,id),
  foreign key (household_id,fermentation_state_id) references pickle.fermentation_states(household_id,id) on delete cascade,
  foreign key (household_id,taster_person_id) references lab.people(household_id,id),
  foreign key (household_id,recorded_by_person_id) references lab.people(household_id,id)
);

create table pickle.food_pairings (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  fermentation_state_id uuid not null,
  taster_person_id smallint not null,
  recorded_by_person_id smallint not null,
  food_raw text not null,
  food_normalized text,
  rating numeric check (rating is null or rating between 0 and 20),
  notes text,
  confidence numeric(4,3) check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (household_id,id),
  foreign key (household_id,fermentation_state_id) references pickle.fermentation_states(household_id,id) on delete cascade,
  foreign key (household_id,taster_person_id) references lab.people(household_id,id),
  foreign key (household_id,recorded_by_person_id) references lab.people(household_id,id)
);

create table pickle.pickleback_pairings (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  fermentation_state_id uuid not null,
  taster_person_id smallint not null,
  recorded_by_person_id smallint not null,
  liquor_raw text not null,
  spirit_category text,
  brand text,
  proof numeric,
  brine_to_spirit_ratio numeric,
  serving_sequence text,
  rating numeric check (rating is null or rating between 0 and 20),
  notes text,
  confidence numeric(4,3) check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (household_id,id),
  foreign key (household_id,fermentation_state_id) references pickle.fermentation_states(household_id,id) on delete cascade,
  foreign key (household_id,taster_person_id) references lab.people(household_id,id),
  foreign key (household_id,recorded_by_person_id) references lab.people(household_id,id)
);

create table pickle.observations (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  batch_id uuid,
  fermentation_state_id uuid,
  observer_person_id smallint not null,
  observation_type text not null check (observation_type in ('process','behavioral','confounder','failure','general')),
  note text not null,
  details jsonb,
  created_at timestamptz not null default now(),
  unique (household_id,id),
  check (num_nonnulls(batch_id,fermentation_state_id)=1),
  foreign key (household_id,batch_id) references pickle.batches(household_id,id) on delete cascade,
  foreign key (household_id,fermentation_state_id) references pickle.fermentation_states(household_id,id) on delete cascade,
  foreign key (household_id,observer_person_id) references lab.people(household_id,id)
);

create table pickle.source_records (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  source_type text not null check (source_type in ('legacy_json','card_ocr','manual_import','other')),
  source_name text not null,
  source_index integer not null check (source_index >= 0),
  source_key text not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  raw_payload jsonb not null,
  imported_at timestamptz,
  resolution_status text not null default 'resolved' check (resolution_status in ('pending','proposed','resolved','needs_review','rejected')),
  created_at timestamptz not null default now(),
  unique (household_id,id),
  unique (household_id,source_type,source_name,source_index),
  unique (household_id,source_hash),
  unique (household_id,source_key)
);

create table pickle.source_links (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  source_record_id uuid not null,
  batch_id uuid not null,
  link_method text not null,
  link_confidence numeric(4,3) check (link_confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (household_id,id),
  unique (source_record_id,batch_id),
  foreign key (household_id,source_record_id) references pickle.source_records(household_id,id) on delete restrict,
  foreign key (household_id,batch_id) references pickle.batches(household_id,id) on delete restrict
);

create index pickle_batches_status_idx on pickle.batches(household_id,record_status);
create index pickle_states_batch_idx on pickle.fermentation_states(household_id,batch_id);
create index pickle_tastings_state_idx on pickle.tastings(household_id,fermentation_state_id);
create index pickle_food_pairings_state_idx on pickle.food_pairings(household_id,fermentation_state_id);
create index pickle_picklebacks_state_idx on pickle.pickleback_pairings(household_id,fermentation_state_id);
create index pickle_source_records_idx on pickle.source_records(household_id,resolution_status);

do $$
declare t text;
begin
  foreach t in array array['experiments','batches','fermentation_states','tastings'] loop
    execute format('create trigger %I_set_updated_at before update on pickle.%I for each row execute function private.set_updated_at()',t,t);
  end loop;
end $$;
