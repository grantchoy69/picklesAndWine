-- Repository copy of the RPC already applied to production.
-- This file restores migration parity between GitHub and Supabase.
create or replace function wine.create_tasting(
  p_producer_name text,
  p_wine_name text,
  p_vintage_year smallint default null,
  p_geography text default null,
  p_color_style text default null,
  p_started_at timestamptz default now(),
  p_location_name text default 'Home',
  p_location_context text default 'Home',
  p_occasion_notes text default null,
  p_gracie_enjoyment numeric default null,
  p_gracie_notes text default null,
  p_kyle_enjoyment numeric default null,
  p_kyle_notes text default null
) returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_household_id constant smallint := 1;
  v_creator_person_id smallint;
  v_producer_id uuid;
  v_wine_id uuid;
  v_release_id uuid;
  v_bottle_id uuid;
  v_session_id uuid;
  v_normalized_producer text;
  v_normalized_wine text;
begin
  if p_producer_name is null or length(btrim(p_producer_name)) = 0 then
    raise exception 'Producer is required';
  end if;
  if p_wine_name is null or length(btrim(p_wine_name)) = 0 then
    raise exception 'Wine name is required';
  end if;
  if p_color_style is not null and p_color_style not in ('red','white','rose','orange','other') then
    raise exception 'Unsupported color style';
  end if;

  v_creator_person_id := private.current_person_id();
  if v_creator_person_id is null or not private.can_edit_household(v_household_id) then
    raise exception 'Current user cannot edit this household';
  end if;

  v_normalized_producer := lower(regexp_replace(btrim(p_producer_name), '\s+', ' ', 'g'));
  v_normalized_wine := lower(regexp_replace(btrim(p_wine_name), '\s+', ' ', 'g'));

  insert into wine.producers (household_id,name,normalized_name,created_by_person_id)
  values (v_household_id,btrim(p_producer_name),v_normalized_producer,v_creator_person_id)
  on conflict (household_id,normalized_name) do update
    set name = excluded.name, updated_at = now()
  returning id into v_producer_id;

  insert into wine.wines (household_id,producer_id,cuvee_name,normalized_cuvee_name,wine_name_raw,color_style,sparkling_style,created_by_person_id)
  values (v_household_id,v_producer_id,btrim(p_wine_name),v_normalized_wine,btrim(p_wine_name),p_color_style,'still',v_creator_person_id)
  on conflict (household_id,producer_id,normalized_cuvee_name) do update
    set cuvee_name = excluded.cuvee_name,
        wine_name_raw = excluded.wine_name_raw,
        color_style = coalesce(excluded.color_style,wine.wines.color_style),
        updated_at = now()
  returning id into v_wine_id;

  insert into wine.releases (household_id,wine_id,vintage_year,vintage_raw,is_non_vintage,geography_raw,created_by_person_id)
  values (v_household_id,v_wine_id,p_vintage_year,case when p_vintage_year is null then 'Unknown' else p_vintage_year::text end,false,nullif(btrim(p_geography),''),v_creator_person_id)
  returning id into v_release_id;

  insert into wine.bottles (household_id,release_id,acquisition_type,created_by_person_id)
  values (v_household_id,v_release_id,'unknown',v_creator_person_id)
  returning id into v_bottle_id;

  insert into wine.tasting_sessions (household_id,bottle_id,started_at,date_precision,location_name,location_context,occasion_notes,source_confidence,created_by_person_id)
  values (v_household_id,v_bottle_id,coalesce(p_started_at,now()),'minute',nullif(btrim(p_location_name),''),nullif(btrim(p_location_context),''),nullif(btrim(p_occasion_notes),''),1,v_creator_person_id)
  returning id into v_session_id;

  insert into wine.reviews (household_id,tasting_session_id,person_id,overall_enjoyment,overall_rating_raw,personal_notes,review_status,form_version)
  values
    (v_household_id,v_session_id,1,p_gracie_enjoyment,case when p_gracie_enjoyment is null then null else p_gracie_enjoyment::text end,nullif(btrim(p_gracie_notes),''),case when p_gracie_enjoyment is null and nullif(btrim(p_gracie_notes),'') is null then 'draft' else 'complete' end,'wine-lab-mvp-v1'),
    (v_household_id,v_session_id,2,p_kyle_enjoyment,case when p_kyle_enjoyment is null then null else p_kyle_enjoyment::text end,nullif(btrim(p_kyle_notes),''),case when p_kyle_enjoyment is null and nullif(btrim(p_kyle_notes),'') is null then 'draft' else 'complete' end,'wine-lab-mvp-v1');

  return v_session_id;
end;
$$;

revoke all on function wine.create_tasting(text,text,smallint,text,text,timestamptz,text,text,text,numeric,text,numeric,text) from public, anon;
grant execute on function wine.create_tasting(text,text,smallint,text,text,timestamptz,text,text,text,numeric,text,numeric,text) to authenticated;
