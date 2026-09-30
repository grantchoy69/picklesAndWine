create schema if not exists kitchen;

revoke all on schema kitchen from public, anon;
grant usage on schema kitchen to authenticated, service_role;

create table if not exists kitchen.ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  display_name text not null,
  normalized_name text not null,
  category text,
  default_unit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, normalized_name),
  check (length(btrim(display_name)) > 0),
  check (length(btrim(normalized_name)) > 0)
);

create table if not exists kitchen.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  title text not null,
  subtitle text,
  description text,
  source_url text,
  photo_path text,
  servings numeric,
  prep_minutes integer,
  cook_minutes integer,
  category text,
  tags text[] not null default '{}'::text[],
  status text not null default 'active',
  created_by_person_id smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, created_by_person_id)
    references lab.people(household_id, id),
  check (length(btrim(title)) > 0),
  check (status in ('draft', 'active', 'retired')),
  check (servings is null or servings > 0),
  check (prep_minutes is null or prep_minutes >= 0),
  check (cook_minutes is null or cook_minutes >= 0)
);

create table if not exists kitchen.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  recipe_id uuid not null,
  ingredient_id uuid not null,
  section_name text,
  quantity_value numeric,
  quantity_text text,
  unit text,
  preparation text,
  raw_text text,
  optional boolean not null default false,
  sequence_number integer not null,
  created_at timestamptz not null default now(),
  unique (household_id, id),
  unique (recipe_id, sequence_number),
  foreign key (household_id, recipe_id)
    references kitchen.recipes(household_id, id) on delete cascade,
  foreign key (household_id, ingredient_id)
    references kitchen.ingredients(household_id, id) on delete restrict,
  check (quantity_value is null or quantity_value >= 0),
  check (sequence_number > 0)
);

create table if not exists kitchen.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  household_id smallint not null references lab.households(id) on delete restrict,
  recipe_id uuid not null,
  section_name text,
  instruction text not null,
  sequence_number integer not null,
  timer_minutes integer,
  created_at timestamptz not null default now(),
  unique (household_id, id),
  unique (recipe_id, sequence_number),
  foreign key (household_id, recipe_id)
    references kitchen.recipes(household_id, id) on delete cascade,
  check (length(btrim(instruction)) > 0),
  check (sequence_number > 0),
  check (timer_minutes is null or timer_minutes >= 0)
);

create index if not exists kitchen_recipes_household_created_idx
  on kitchen.recipes (household_id, created_at desc);
create index if not exists kitchen_recipe_ingredients_recipe_idx
  on kitchen.recipe_ingredients (household_id, recipe_id, sequence_number);
create index if not exists kitchen_recipe_steps_recipe_idx
  on kitchen.recipe_steps (household_id, recipe_id, sequence_number);

drop trigger if exists kitchen_ingredients_set_updated_at on kitchen.ingredients;
create trigger kitchen_ingredients_set_updated_at
before update on kitchen.ingredients
for each row execute function private.set_updated_at();

drop trigger if exists kitchen_recipes_set_updated_at on kitchen.recipes;
create trigger kitchen_recipes_set_updated_at
before update on kitchen.recipes
for each row execute function private.set_updated_at();

alter table kitchen.ingredients enable row level security;
alter table kitchen.recipes enable row level security;
alter table kitchen.recipe_ingredients enable row level security;
alter table kitchen.recipe_steps enable row level security;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'ingredients', 'recipes', 'recipe_ingredients', 'recipe_steps'
  ]
  loop
    execute format('drop policy if exists %I on kitchen.%I', v_table || '_select_for_members', v_table);
    execute format(
      'create policy %I on kitchen.%I for select to authenticated using ((select private.has_active_membership(household_id)))',
      v_table || '_select_for_members', v_table
    );

    execute format('drop policy if exists %I on kitchen.%I', v_table || '_insert_for_editors', v_table);
    execute format(
      'create policy %I on kitchen.%I for insert to authenticated with check ((select private.can_edit_household(household_id)))',
      v_table || '_insert_for_editors', v_table
    );

    execute format('drop policy if exists %I on kitchen.%I', v_table || '_update_for_editors', v_table);
    execute format(
      'create policy %I on kitchen.%I for update to authenticated using ((select private.can_edit_household(household_id))) with check ((select private.can_edit_household(household_id)))',
      v_table || '_update_for_editors', v_table
    );

    execute format('drop policy if exists %I on kitchen.%I', v_table || '_delete_for_editors', v_table);
    execute format(
      'create policy %I on kitchen.%I for delete to authenticated using ((select private.can_edit_household(household_id)))',
      v_table || '_delete_for_editors', v_table
    );
  end loop;
end;
$$;

revoke all on all tables in schema kitchen from public, anon;
grant select, insert, update, delete on all tables in schema kitchen to authenticated;
grant all on all tables in schema kitchen to service_role;

alter default privileges for role postgres in schema kitchen
  revoke all on tables from public, anon;
alter default privileges for role postgres in schema kitchen
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema kitchen
  grant all on tables to service_role;

create or replace function lab.get_recipe_library()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when not private.has_active_membership(1::smallint) then '[]'::jsonb
    else coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'title', r.title,
            'subtitle', r.subtitle,
            'description', r.description,
            'sourceUrl', r.source_url,
            'photoPath', r.photo_path,
            'servings', r.servings,
            'prepMinutes', r.prep_minutes,
            'cookMinutes', r.cook_minutes,
            'category', r.category,
            'tags', to_jsonb(r.tags),
            'status', r.status,
            'createdByPersonId', r.created_by_person_id,
            'createdAt', r.created_at,
            'updatedAt', r.updated_at,
            'ingredients', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', ri.id,
                    'ingredientId', i.id,
                    'name', i.display_name,
                    'category', i.category,
                    'section', ri.section_name,
                    'quantityValue', ri.quantity_value,
                    'quantityText', ri.quantity_text,
                    'unit', ri.unit,
                    'preparation', ri.preparation,
                    'rawText', ri.raw_text,
                    'optional', ri.optional,
                    'sequence', ri.sequence_number
                  ) order by ri.sequence_number
                )
                from kitchen.recipe_ingredients ri
                join kitchen.ingredients i
                  on i.household_id = ri.household_id
                 and i.id = ri.ingredient_id
                where ri.household_id = r.household_id
                  and ri.recipe_id = r.id
              ),
              '[]'::jsonb
            ),
            'steps', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', rs.id,
                    'section', rs.section_name,
                    'instruction', rs.instruction,
                    'sequence', rs.sequence_number,
                    'timerMinutes', rs.timer_minutes
                  ) order by rs.sequence_number
                )
                from kitchen.recipe_steps rs
                where rs.household_id = r.household_id
                  and rs.recipe_id = r.id
              ),
              '[]'::jsonb
            )
          ) order by r.created_at desc
        )
        from kitchen.recipes r
        where r.household_id = 1
          and r.status <> 'retired'
      ),
      '[]'::jsonb
    )
  end;
$$;

create or replace function lab.create_recipe(p_recipe jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id constant smallint := 1;
  v_creator_person_id smallint;
  v_recipe_id uuid;
  v_title text;
  v_item jsonb;
  v_step jsonb;
  v_ingredient_id uuid;
  v_ingredient_name text;
  v_normalized_name text;
  v_sequence integer := 0;
  v_tags text[] := '{}'::text[];
begin
  p_recipe := coalesce(p_recipe, '{}'::jsonb);
  v_creator_person_id := private.current_person_id();

  if v_creator_person_id is null
     or not private.can_edit_household(v_household_id) then
    raise exception 'Current user cannot edit this household';
  end if;

  v_title := nullif(btrim(p_recipe->>'title'), '');
  if v_title is null then
    raise exception 'Recipe title is required';
  end if;

  if jsonb_typeof(p_recipe->'tags') = 'array' then
    select coalesce(array_agg(tag order by tag), '{}'::text[])
      into v_tags
    from (
      select distinct btrim(value) as tag
      from jsonb_array_elements_text(p_recipe->'tags') tags(value)
      where length(btrim(value)) > 0
    ) cleaned;
  end if;

  v_recipe_id := coalesce(nullif(p_recipe->>'id', '')::uuid, gen_random_uuid());

  insert into kitchen.recipes (
    id,
    household_id,
    title,
    subtitle,
    description,
    source_url,
    photo_path,
    servings,
    prep_minutes,
    cook_minutes,
    category,
    tags,
    status,
    created_by_person_id
  )
  values (
    v_recipe_id,
    v_household_id,
    v_title,
    nullif(btrim(p_recipe->>'subtitle'), ''),
    nullif(btrim(p_recipe->>'description'), ''),
    nullif(btrim(p_recipe->>'sourceUrl'), ''),
    nullif(btrim(p_recipe->>'photoPath'), ''),
    nullif(p_recipe->>'servings', '')::numeric,
    nullif(p_recipe->>'prepMinutes', '')::integer,
    nullif(p_recipe->>'cookMinutes', '')::integer,
    nullif(btrim(p_recipe->>'category'), ''),
    v_tags,
    'active',
    v_creator_person_id
  );

  if jsonb_typeof(p_recipe->'ingredients') = 'array' then
    v_sequence := 0;
    for v_item in
      select value from jsonb_array_elements(p_recipe->'ingredients') ingredient(value)
    loop
      v_ingredient_name := nullif(btrim(v_item->>'name'), '');
      if v_ingredient_name is null then
        continue;
      end if;

      v_sequence := v_sequence + 1;
      v_normalized_name := lower(regexp_replace(v_ingredient_name, '\s+', ' ', 'g'));

      insert into kitchen.ingredients (
        household_id,
        display_name,
        normalized_name,
        category,
        default_unit
      )
      values (
        v_household_id,
        v_ingredient_name,
        v_normalized_name,
        nullif(btrim(v_item->>'category'), ''),
        nullif(btrim(v_item->>'unit'), '')
      )
      on conflict (household_id, normalized_name)
      do update set
        display_name = excluded.display_name,
        category = coalesce(excluded.category, kitchen.ingredients.category),
        default_unit = coalesce(excluded.default_unit, kitchen.ingredients.default_unit),
        updated_at = now()
      returning id into v_ingredient_id;

      insert into kitchen.recipe_ingredients (
        household_id,
        recipe_id,
        ingredient_id,
        section_name,
        quantity_value,
        quantity_text,
        unit,
        preparation,
        raw_text,
        optional,
        sequence_number
      )
      values (
        v_household_id,
        v_recipe_id,
        v_ingredient_id,
        nullif(btrim(v_item->>'section'), ''),
        nullif(v_item->>'quantityValue', '')::numeric,
        nullif(btrim(v_item->>'quantityText'), ''),
        nullif(btrim(v_item->>'unit'), ''),
        nullif(btrim(v_item->>'preparation'), ''),
        nullif(btrim(v_item->>'rawText'), ''),
        coalesce((v_item->>'optional')::boolean, false),
        v_sequence
      );
    end loop;
  end if;

  if jsonb_typeof(p_recipe->'steps') = 'array' then
    v_sequence := 0;
    for v_step in
      select value from jsonb_array_elements(p_recipe->'steps') step(value)
    loop
      if nullif(btrim(v_step->>'instruction'), '') is null then
        continue;
      end if;

      v_sequence := v_sequence + 1;
      insert into kitchen.recipe_steps (
        household_id,
        recipe_id,
        section_name,
        instruction,
        sequence_number,
        timer_minutes
      )
      values (
        v_household_id,
        v_recipe_id,
        nullif(btrim(v_step->>'section'), ''),
        btrim(v_step->>'instruction'),
        v_sequence,
        nullif(v_step->>'timerMinutes', '')::integer
      );
    end loop;
  end if;

  return v_recipe_id;
end;
$$;

alter table pickle.batches drop constraint if exists batches_fermentation_type_check;
alter table pickle.batches
  add constraint batches_fermentation_type_check
  check (fermentation_type in (
    'lacto_fermented',
    'vinegar_quick',
    'refrigerator',
    'hybrid'
  ));

create or replace function pickle.get_pickle_lab()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when not private.has_active_membership(1::smallint) then '[]'::jsonb
    else coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'batchCode', b.batch_code,
            'fermentationType', b.fermentation_type,
            'preparedAt', b.prepared_at,
            'recordStatus', b.record_status,
            'analysisEligibility', b.analysis_eligibility,
            'recipePayload', b.recipe_payload,
            'processPayload', b.process_payload,
            'createdAt', b.created_at,
            'experiment', case when e.id is null then null else jsonb_build_object(
              'id', e.id,
              'title', e.title,
              'researchQuestion', e.research_question,
              'hypothesis', e.hypothesis,
              'purpose', e.purpose,
              'status', e.status
            ) end,
            'ingredients', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', bi.id,
                    'name', i.display_name,
                    'role', bi.role,
                    'quantityValue', bi.quantity_value,
                    'quantityUnit', bi.quantity_unit,
                    'rawText', bi.raw_text
                  ) order by bi.created_at
                )
                from pickle.batch_ingredients bi
                join pickle.ingredients i
                  on i.household_id = bi.household_id
                 and i.id = bi.ingredient_id
                where bi.household_id = b.household_id
                  and bi.batch_id = b.id
              ),
              '[]'::jsonb
            ),
            'latestState', (
              select jsonb_build_object(
                'id', fs.id,
                'stateCode', fs.state_code,
                'observedAt', fs.observed_at,
                'fermentationDay', fs.fermentation_day,
                'storageStage', fs.storage_stage,
                'ph', fs.ph,
                'temperatureC', fs.temperature_c,
                'visualActivity', fs.visual_activity,
                'aroma', fs.aroma,
                'texture', fs.texture,
                'brineAppearance', fs.brine_appearance,
                'checkpointPayload', fs.checkpoint_payload
              )
              from pickle.fermentation_states fs
              where fs.household_id = b.household_id
                and fs.batch_id = b.id
              order by fs.observed_at desc nulls last, fs.created_at desc
              limit 1
            ),
            'tastingCount', (
              select count(*)
              from pickle.tastings t
              join pickle.fermentation_states fs
                on fs.household_id = t.household_id
               and fs.id = t.fermentation_state_id
              where fs.household_id = b.household_id
                and fs.batch_id = b.id
            )
          ) order by coalesce(b.prepared_at, b.created_at) desc
        )
        from pickle.batches b
        left join pickle.experiments e
          on e.household_id = b.household_id
         and e.id = b.experiment_id
        where b.household_id = 1
      ),
      '[]'::jsonb
    )
  end;
$$;

create or replace function pickle.create_batch(p_batch jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id constant smallint := 1;
  v_creator_person_id smallint;
  v_experiment_id uuid;
  v_batch_id uuid;
  v_batch_code text;
  v_title text;
  v_method text;
  v_item jsonb;
  v_ingredient_id uuid;
  v_ingredient_name text;
  v_normalized_name text;
  v_role text;
begin
  p_batch := coalesce(p_batch, '{}'::jsonb);
  v_creator_person_id := private.current_person_id();

  if v_creator_person_id is null
     or not private.can_edit_household(v_household_id) then
    raise exception 'Current user cannot edit this household';
  end if;

  v_title := nullif(btrim(p_batch->>'title'), '');
  v_batch_code := nullif(btrim(p_batch->>'batchCode'), '');
  v_method := coalesce(nullif(btrim(p_batch->>'fermentationType'), ''), 'lacto_fermented');

  if v_title is null then
    raise exception 'Batch title is required';
  end if;
  if v_batch_code is null then
    raise exception 'Batch code is required';
  end if;
  if v_method not in ('lacto_fermented', 'vinegar_quick', 'refrigerator', 'hybrid') then
    raise exception 'Unsupported pickle method';
  end if;

  insert into pickle.experiments (
    household_id,
    title,
    research_question,
    hypothesis,
    purpose,
    status,
    designed_by_person_id
  )
  values (
    v_household_id,
    v_title,
    nullif(btrim(p_batch->>'researchQuestion'), ''),
    nullif(btrim(p_batch->>'hypothesis'), ''),
    coalesce(nullif(btrim(p_batch->>'purpose'), ''), 'explore'),
    'active',
    v_creator_person_id
  )
  returning id into v_experiment_id;

  insert into pickle.batches (
    household_id,
    experiment_id,
    batch_code,
    fermentation_type,
    prepared_at,
    record_status,
    analysis_eligibility,
    recipe_payload,
    process_payload,
    created_by_person_id
  )
  values (
    v_household_id,
    v_experiment_id,
    v_batch_code,
    v_method,
    coalesce(nullif(p_batch->>'preparedAt', '')::timestamptz, now()),
    'active',
    'eligible',
    coalesce(p_batch->'recipePayload', '{}'::jsonb),
    coalesce(p_batch->'processPayload', '{}'::jsonb),
    v_creator_person_id
  )
  returning id into v_batch_id;

  if jsonb_typeof(p_batch->'ingredients') = 'array' then
    for v_item in
      select value from jsonb_array_elements(p_batch->'ingredients') ingredient(value)
    loop
      v_ingredient_name := nullif(btrim(v_item->>'name'), '');
      if v_ingredient_name is null then
        continue;
      end if;

      v_role := coalesce(nullif(btrim(v_item->>'role'), ''), 'other');
      if v_role not in ('vegetable', 'aromatic', 'spice', 'sweetener', 'other') then
        v_role := 'other';
      end if;
      v_normalized_name := lower(regexp_replace(v_ingredient_name, '\s+', ' ', 'g'));

      insert into pickle.ingredients (
        household_id,
        normalized_name,
        display_name,
        ingredient_role
      )
      values (
        v_household_id,
        v_normalized_name,
        v_ingredient_name,
        v_role
      )
      on conflict (household_id, normalized_name)
      do update set
        display_name = excluded.display_name
      returning id into v_ingredient_id;

      insert into pickle.batch_ingredients (
        household_id,
        batch_id,
        ingredient_id,
        role,
        quantity_value,
        quantity_unit,
        raw_text,
        confidence
      )
      values (
        v_household_id,
        v_batch_id,
        v_ingredient_id,
        coalesce(nullif(btrim(v_item->>'batchRole'), ''), v_role),
        nullif(v_item->>'quantityValue', '')::numeric,
        nullif(btrim(v_item->>'quantityUnit'), ''),
        nullif(btrim(v_item->>'rawText'), ''),
        1
      );
    end loop;
  end if;

  insert into pickle.fermentation_states (
    household_id,
    batch_id,
    state_code,
    observed_at,
    fermentation_day,
    storage_stage,
    checkpoint_payload
  )
  values (
    v_household_id,
    v_batch_id,
    v_batch_code || '-initial',
    coalesce(nullif(p_batch->>'preparedAt', '')::timestamptz, now()),
    0,
    case when v_method = 'lacto_fermented' then 'counter' else 'refrigerator' end,
    coalesce(p_batch->'initialState', '{}'::jsonb)
  );

  return v_batch_id;
end;
$$;

revoke all on function lab.get_recipe_library() from public, anon;
revoke all on function lab.create_recipe(jsonb) from public, anon;
revoke all on function pickle.get_pickle_lab() from public, anon;
revoke all on function pickle.create_batch(jsonb) from public, anon;

grant execute on function lab.get_recipe_library() to authenticated, service_role;
grant execute on function lab.create_recipe(jsonb) to authenticated, service_role;
grant execute on function pickle.get_pickle_lab() to authenticated, service_role;
grant execute on function pickle.create_batch(jsonb) to authenticated, service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'recipe-images',
  'recipe-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists recipe_images_select_for_members on storage.objects;
create policy recipe_images_select_for_members
on storage.objects for select to authenticated
using (
  bucket_id = 'recipe-images'
  and case
    when split_part(name, '/', 1) ~ '^[0-9]+$'
      then private.has_active_membership(split_part(name, '/', 1)::smallint)
    else false
  end
);

drop policy if exists recipe_images_insert_for_editors on storage.objects;
create policy recipe_images_insert_for_editors
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recipe-images'
  and case
    when split_part(name, '/', 1) ~ '^[0-9]+$'
      then private.can_edit_household(split_part(name, '/', 1)::smallint)
    else false
  end
);

drop policy if exists recipe_images_update_for_editors on storage.objects;
create policy recipe_images_update_for_editors
on storage.objects for update to authenticated
using (
  bucket_id = 'recipe-images'
  and case
    when split_part(name, '/', 1) ~ '^[0-9]+$'
      then private.can_edit_household(split_part(name, '/', 1)::smallint)
    else false
  end
)
with check (
  bucket_id = 'recipe-images'
  and case
    when split_part(name, '/', 1) ~ '^[0-9]+$'
      then private.can_edit_household(split_part(name, '/', 1)::smallint)
    else false
  end
);

drop policy if exists recipe_images_delete_for_editors on storage.objects;
create policy recipe_images_delete_for_editors
on storage.objects for delete to authenticated
using (
  bucket_id = 'recipe-images'
  and case
    when split_part(name, '/', 1) ~ '^[0-9]+$'
      then private.can_edit_household(split_part(name, '/', 1)::smallint)
    else false
  end
);
