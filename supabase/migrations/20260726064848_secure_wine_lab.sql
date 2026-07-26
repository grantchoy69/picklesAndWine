alter table lab.households enable row level security;
alter table lab.people enable row level security;
alter table lab.memberships enable row level security;

create policy households_select_for_members
on lab.households
for select
to authenticated
using (private.has_active_membership(id));

create policy people_select_for_members
on lab.people
for select
to authenticated
using (private.has_active_membership(household_id));

create policy memberships_select_self
on lab.memberships
for select
to authenticated
using (auth_user_id = (select auth.uid()) and active);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'producers', 'wines', 'releases', 'grapes', 'release_grapes', 'bottles',
    'tasting_sessions', 'reviews', 'pairings', 'review_checkpoints',
    'metric_definitions', 'checkpoint_measurements', 'appearance_observations',
    'descriptors', 'descriptor_observations', 'prompt_definitions',
    'prompt_responses', 'fault_definitions', 'fault_observations',
    'hypotheses', 'hypothesis_evidence', 'source_records', 'source_links',
    'source_documents', 'extraction_runs', 'ingestion_drafts',
    'data_quality_issues'
  ]
  loop
    execute format('alter table wine.%I enable row level security', table_name);

    execute format(
      'create policy %I on wine.%I for select to authenticated
       using (private.has_active_membership(household_id))',
      table_name || '_select_for_members',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'producers', 'wines', 'releases', 'grapes', 'release_grapes', 'bottles',
    'tasting_sessions', 'reviews', 'pairings', 'review_checkpoints',
    'metric_definitions', 'checkpoint_measurements', 'appearance_observations',
    'descriptors', 'descriptor_observations', 'prompt_definitions',
    'prompt_responses', 'fault_definitions', 'fault_observations',
    'hypotheses', 'hypothesis_evidence', 'source_documents', 'extraction_runs',
    'ingestion_drafts', 'data_quality_issues'
  ]
  loop
    execute format(
      'create policy %I on wine.%I for insert to authenticated
       with check (private.can_edit_household(household_id))',
      table_name || '_insert_for_editors',
      table_name
    );

    execute format(
      'create policy %I on wine.%I for update to authenticated
       using (private.can_edit_household(household_id))
       with check (private.can_edit_household(household_id))',
      table_name || '_update_for_editors',
      table_name
    );

    execute format(
      'create policy %I on wine.%I for delete to authenticated
       using (private.can_edit_household(household_id))',
      table_name || '_delete_for_editors',
      table_name
    );
  end loop;
end;
$$;

grant usage on schema lab, wine, private to authenticated;
grant usage on schema lab, wine, private to service_role;

grant select on lab.households, lab.people, lab.memberships to authenticated;
grant all on all tables in schema lab to service_role;

grant select, insert, update, delete on
  wine.producers,
  wine.wines,
  wine.releases,
  wine.grapes,
  wine.release_grapes,
  wine.bottles,
  wine.tasting_sessions,
  wine.reviews,
  wine.pairings,
  wine.review_checkpoints,
  wine.metric_definitions,
  wine.checkpoint_measurements,
  wine.appearance_observations,
  wine.descriptors,
  wine.descriptor_observations,
  wine.prompt_definitions,
  wine.prompt_responses,
  wine.fault_definitions,
  wine.fault_observations,
  wine.hypotheses,
  wine.hypothesis_evidence,
  wine.source_documents,
  wine.extraction_runs,
  wine.ingestion_drafts,
  wine.data_quality_issues
to authenticated;

grant select on
  wine.source_records,
  wine.source_links,
  wine.review_fact,
  wine.checkpoint_fact,
  wine.data_quality_queue
to authenticated;

grant all on all tables in schema wine to service_role;

grant execute on function private.has_active_membership(smallint) to authenticated;
grant execute on function private.can_edit_household(smallint) to authenticated;
grant execute on function private.current_person_id() to authenticated;
grant execute on function private.set_updated_at() to service_role;
grant execute on function private.has_active_membership(smallint) to service_role;
grant execute on function private.can_edit_household(smallint) to service_role;
grant execute on function private.current_person_id() to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'wine-card-images',
  'wine-card-images',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy wine_card_images_select_for_members
on storage.objects
for select
to authenticated
using (
  bucket_id = 'wine-card-images'
  and private.has_active_membership(
    case
      when (storage.foldername(name))[1] ~ '^[0-9]+$'
        then ((storage.foldername(name))[1])::smallint
      else null
    end
  )
);

create policy wine_card_images_insert_for_editors
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'wine-card-images'
  and private.can_edit_household(
    case
      when (storage.foldername(name))[1] ~ '^[0-9]+$'
        then ((storage.foldername(name))[1])::smallint
      else null
    end
  )
);

create policy wine_card_images_update_for_editors
on storage.objects
for update
to authenticated
using (
  bucket_id = 'wine-card-images'
  and private.can_edit_household(
    case
      when (storage.foldername(name))[1] ~ '^[0-9]+$'
        then ((storage.foldername(name))[1])::smallint
      else null
    end
  )
)
with check (
  bucket_id = 'wine-card-images'
  and private.can_edit_household(
    case
      when (storage.foldername(name))[1] ~ '^[0-9]+$'
        then ((storage.foldername(name))[1])::smallint
      else null
    end
  )
);

create policy wine_card_images_delete_for_editors
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'wine-card-images'
  and private.can_edit_household(
    case
      when (storage.foldername(name))[1] ~ '^[0-9]+$'
        then ((storage.foldername(name))[1])::smallint
      else null
    end
  )
);
