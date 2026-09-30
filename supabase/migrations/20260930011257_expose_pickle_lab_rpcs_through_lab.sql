create or replace function lab.get_pickle_lab()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pickle.get_pickle_lab();
$$;

create or replace function lab.create_pickle_batch(p_batch jsonb)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select pickle.create_batch(p_batch);
$$;

revoke all on function lab.get_pickle_lab() from public, anon;
revoke all on function lab.create_pickle_batch(jsonb) from public, anon;

grant execute on function lab.get_pickle_lab() to authenticated, service_role;
grant execute on function lab.create_pickle_batch(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
