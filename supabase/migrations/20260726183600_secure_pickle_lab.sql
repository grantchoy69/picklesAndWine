do $$
declare t text;
begin
  foreach t in array array[
    'experiments','batches','batch_parents','ingredients','batch_ingredients','fermentation_states',
    'tastings','food_pairings','pickleback_pairings','observations','source_records','source_links'
  ] loop
    execute format('alter table pickle.%I enable row level security',t);
    execute format('create policy %I on pickle.%I for select to authenticated using (private.has_active_membership(household_id))',t||'_select_for_members',t);
    execute format('create policy %I on pickle.%I for insert to authenticated with check (private.can_edit_household(household_id))',t||'_insert_for_editors',t);
    execute format('create policy %I on pickle.%I for update to authenticated using (private.can_edit_household(household_id)) with check (private.can_edit_household(household_id))',t||'_update_for_editors',t);
    execute format('create policy %I on pickle.%I for delete to authenticated using (private.can_edit_household(household_id))',t||'_delete_for_editors',t);
  end loop;
end $$;

grant usage on schema pickle to authenticated, service_role;
grant select,insert,update,delete on all tables in schema pickle to authenticated;
grant all on all tables in schema pickle to service_role;
alter default privileges in schema pickle grant select,insert,update,delete on tables to authenticated;
alter default privileges in schema pickle grant all on tables to service_role;
