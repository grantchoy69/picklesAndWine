-- Additive API functions; existing tables, observations, and RLS are preserved.
create or replace function lab.get_pickle_tastings(p_batch_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object(
    'state', to_jsonb(s),
    'foodPairings', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from pickle.food_pairings f where f.fermentation_state_id=s.id and f.household_id=s.household_id and f.taster_person_id=t.taster_person_id),
    'picklebacks', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from pickle.pickleback_pairings p where p.fermentation_state_id=s.id and p.household_id=s.household_id and p.taster_person_id=t.taster_person_id)
  ) order by s.observed_at desc nulls last, t.created_at desc), '[]'::jsonb)
  from pickle.tastings t join pickle.fermentation_states s on s.id=t.fermentation_state_id and s.household_id=t.household_id
  where s.batch_id=p_batch_id;
$$;

create or replace function lab.create_pickle_tasting(p_batch_id uuid, p_tasting jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_household smallint;
  v_recorder smallint := private.current_person_id();
  v_taster smallint := nullif(p_tasting->>'tasterPersonId','')::smallint;
  v_state uuid := nullif(p_tasting->>'requestId','')::uuid;
  v_id uuid;
  v_pair jsonb;
  v_observed timestamptz := nullif(p_tasting->>'observedAt','')::timestamptz;
begin
  select household_id into v_household from pickle.batches where id=p_batch_id;
  if v_recorder is null or v_household is null or not private.can_edit_household(v_household) then
    raise exception 'This batch is unavailable or you cannot edit it';
  end if;
  if not exists(select 1 from lab.memberships where household_id=v_household and person_id=v_taster and active) then
    raise exception 'Choose a taster from this household';
  end if;
  if v_state is null or v_observed is null then raise exception 'Tasting date and request ID are required'; end if;
  -- A retry after a lost network response must not create a second tasting.
  perform pg_advisory_xact_lock(hashtextextended(v_state::text,0));
  if exists(select 1 from pickle.fermentation_states where id=v_state) then
    select t.id into v_id from pickle.tastings t join pickle.fermentation_states s on s.id=t.fermentation_state_id
      where s.id=v_state and s.batch_id=p_batch_id and t.recorded_by_person_id=v_recorder and t.taster_person_id=v_taster;
    if v_id is null then raise exception 'Tasting request conflicts with an existing record'; end if;
    return v_id;
  end if;
  if nullif(p_tasting->>'fermentationDay','')::numeric < 0 then raise exception 'Fermentation day cannot be negative'; end if;
  insert into pickle.fermentation_states(id,household_id,batch_id,state_code,observed_at,fermentation_day,storage_stage,ph,temperature_c,aroma,texture,brine_appearance)
  values(v_state,v_household,p_batch_id,'tasting-'||v_state::text,v_observed,
    nullif(p_tasting->>'fermentationDay','')::numeric,nullif(p_tasting->>'storageStage',''),
    nullif(p_tasting->>'ph','')::numeric,nullif(p_tasting->>'temperatureC','')::numeric,
    nullif(p_tasting->>'aroma',''),nullif(p_tasting->>'texture',''),nullif(p_tasting->>'brineAppearance',''));
  insert into pickle.tastings(household_id,fermentation_state_id,taster_person_id,recorded_by_person_id,
    overall_rating,raw_rating_text,crunch,salt_balance,sourness,heat,flavor_intensity,interestingness,
    would_eat_again,would_explore_branch,verbatim_comments,rating_context)
  values(v_household,v_state,v_taster,v_recorder,
    nullif(p_tasting->>'overallRating','')::numeric,nullif(p_tasting->>'rawRatingText',''),
    nullif(p_tasting->>'crunch','')::numeric,nullif(p_tasting->>'saltBalance','')::numeric,
    nullif(p_tasting->>'sourness','')::numeric,nullif(p_tasting->>'heat','')::numeric,
    nullif(p_tasting->>'flavorIntensity','')::numeric,nullif(p_tasting->>'interestingness','')::numeric,
    nullif(p_tasting->>'wouldEatAgain','')::boolean,nullif(p_tasting->>'wouldExploreBranch','')::boolean,
    case when nullif(p_tasting->>'notes','') is null then '[]'::jsonb else jsonb_build_array(p_tasting->>'notes') end,
    coalesce(nullif(p_tasting->>'ratingContext',''),'contemporaneous')) returning id into v_id;
  for v_pair in select value from jsonb_array_elements(coalesce(p_tasting->'foodPairings','[]'::jsonb)) loop
    if nullif(btrim(v_pair->>'food'),'') is null then raise exception 'Enter the food for each pairing'; end if;
    insert into pickle.food_pairings(household_id,fermentation_state_id,taster_person_id,recorded_by_person_id,food_raw,rating,notes)
    values(v_household,v_state,v_taster,v_recorder,v_pair->>'food',nullif(v_pair->>'rating','')::numeric,nullif(v_pair->>'notes',''));
  end loop;
  for v_pair in select value from jsonb_array_elements(coalesce(p_tasting->'picklebacks','[]'::jsonb)) loop
    if nullif(btrim(v_pair->>'spirit'),'') is null then raise exception 'Enter the spirit for each pickleback'; end if;
    insert into pickle.pickleback_pairings(household_id,fermentation_state_id,taster_person_id,recorded_by_person_id,liquor_raw,rating,notes)
    values(v_household,v_state,v_taster,v_recorder,v_pair->>'spirit',nullif(v_pair->>'rating','')::numeric,nullif(v_pair->>'notes',''));
  end loop;
  return v_id;
end;
$$;
revoke all on function lab.get_pickle_tastings(uuid) from public, anon;
revoke all on function lab.create_pickle_tasting(uuid,jsonb) from public, anon;
grant execute on function lab.get_pickle_tastings(uuid) to authenticated, service_role;
grant execute on function lab.create_pickle_tasting(uuid,jsonb) to authenticated, service_role;
notify pgrst, 'reload schema';
