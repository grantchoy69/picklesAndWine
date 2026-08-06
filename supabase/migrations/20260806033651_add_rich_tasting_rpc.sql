insert into wine.prompt_definitions (
  household_id,
  prompt_code,
  form_version,
  prompt_text,
  sequence_number,
  active
)
values
  (1, 'vibe_field_1', 'wine-lab-v2', 'Wine personality / character', 1, true),
  (1, 'vibe_field_2', 'wine-lab-v2', 'Setting, occasion, or relationship', 2, true),
  (1, 'vibe_field_3', 'wine-lab-v2', 'Other vibe or final impression', 3, true)
on conflict (household_id, form_version, prompt_code)
do update set
  prompt_text = excluded.prompt_text,
  sequence_number = excluded.sequence_number,
  active = excluded.active,
  updated_at = now();

create or replace function wine.create_rich_tasting(
  p_bottle jsonb,
  p_gracie_review jsonb default '{}'::jsonb,
  p_kyle_review jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id constant smallint := 1;
  v_creator_person_id smallint;
  v_producer_id uuid;
  v_wine_id uuid;
  v_release_id uuid;
  v_bottle_id uuid;
  v_session_id uuid;
  v_review_id uuid;
  v_checkpoint_id uuid;
  v_grape_id uuid;
  v_normalized_producer text;
  v_normalized_wine text;
  v_normalized_grape text;
  v_producer_name text;
  v_wine_name text;
  v_color_style text;
  v_review jsonb;
  v_appearance jsonb;
  v_metric jsonb;
  v_person_id smallint;
  v_enjoyment numeric;
  v_numeric numeric;
  v_metric_code text;
  v_section text;
  v_descriptor text;
  v_grape_name text;
  v_response text;
  v_sequence integer;
  v_index integer;
  v_prompt record;
begin
  p_bottle := coalesce(p_bottle, '{}'::jsonb);
  p_gracie_review := coalesce(p_gracie_review, '{}'::jsonb);
  p_kyle_review := coalesce(p_kyle_review, '{}'::jsonb);

  v_producer_name := nullif(btrim(p_bottle->>'producerName'), '');
  v_wine_name := nullif(btrim(p_bottle->>'wineName'), '');
  v_color_style := nullif(btrim(p_bottle->>'colorStyle'), '');

  if v_producer_name is null then
    raise exception 'Producer is required';
  end if;

  if v_wine_name is null then
    raise exception 'Wine name is required';
  end if;

  if v_color_style is not null
     and v_color_style not in ('red', 'white', 'rose', 'orange', 'other') then
    raise exception 'Unsupported color style';
  end if;

  if nullif(p_bottle->>'priceAmount', '') is not null
     and (p_bottle->>'priceAmount')::numeric < 0 then
    raise exception 'Price cannot be negative';
  end if;

  v_creator_person_id := private.current_person_id();
  if v_creator_person_id is null
     or not private.can_edit_household(v_household_id) then
    raise exception 'Current user cannot edit this household';
  end if;

  v_normalized_producer :=
    lower(regexp_replace(v_producer_name, '\s+', ' ', 'g'));
  v_normalized_wine :=
    lower(regexp_replace(v_wine_name, '\s+', ' ', 'g'));

  insert into wine.producers (
    household_id,
    name,
    normalized_name,
    created_by_person_id
  )
  values (
    v_household_id,
    v_producer_name,
    v_normalized_producer,
    v_creator_person_id
  )
  on conflict (household_id, normalized_name)
  do update set
    name = excluded.name,
    updated_at = now()
  returning id into v_producer_id;

  insert into wine.wines (
    household_id,
    producer_id,
    cuvee_name,
    normalized_cuvee_name,
    wine_name_raw,
    color_style,
    sparkling_style,
    created_by_person_id
  )
  values (
    v_household_id,
    v_producer_id,
    v_wine_name,
    v_normalized_wine,
    v_wine_name,
    v_color_style,
    'still',
    v_creator_person_id
  )
  on conflict (household_id, producer_id, normalized_cuvee_name)
  do update set
    cuvee_name = excluded.cuvee_name,
    wine_name_raw = excluded.wine_name_raw,
    color_style = coalesce(excluded.color_style, wine.wines.color_style),
    updated_at = now()
  returning id into v_wine_id;

  insert into wine.releases (
    household_id,
    wine_id,
    vintage_year,
    vintage_raw,
    is_non_vintage,
    geography_raw,
    created_by_person_id
  )
  values (
    v_household_id,
    v_wine_id,
    nullif(p_bottle->>'vintageYear', '')::smallint,
    coalesce(nullif(p_bottle->>'vintageYear', ''), 'Unknown'),
    false,
    nullif(btrim(p_bottle->>'geography'), ''),
    v_creator_person_id
  )
  returning id into v_release_id;

  if jsonb_typeof(p_bottle->'grapes') = 'array' then
    v_sequence := 0;
    for v_grape_name in
      select btrim(value)
      from jsonb_array_elements_text(p_bottle->'grapes') as grape(value)
      where length(btrim(value)) > 0
    loop
      v_sequence := v_sequence + 1;
      v_normalized_grape :=
        lower(regexp_replace(v_grape_name, '\s+', ' ', 'g'));

      insert into wine.grapes (
        household_id,
        canonical_name,
        normalized_name
      )
      values (
        v_household_id,
        v_grape_name,
        v_normalized_grape
      )
      on conflict (household_id, normalized_name)
      do update set
        canonical_name = excluded.canonical_name,
        updated_at = now()
      returning id into v_grape_id;

      insert into wine.release_grapes (
        household_id,
        release_id,
        grape_id,
        is_primary,
        source_text
      )
      values (
        v_household_id,
        v_release_id,
        v_grape_id,
        v_sequence = 1,
        v_grape_name
      )
      on conflict (release_id, grape_id)
      do update set
        is_primary = excluded.is_primary,
        source_text = excluded.source_text,
        updated_at = now();
    end loop;
  end if;

  insert into wine.bottles (
    household_id,
    release_id,
    price_amount,
    price_raw,
    currency_code,
    acquisition_type,
    acquisition_source,
    created_by_person_id
  )
  values (
    v_household_id,
    v_release_id,
    nullif(p_bottle->>'priceAmount', '')::numeric,
    nullif(btrim(p_bottle->>'priceRaw'), ''),
    case
      when nullif(p_bottle->>'priceAmount', '') is null then null
      else coalesce(nullif(upper(btrim(p_bottle->>'currencyCode')), ''), 'USD')
    end,
    case
      when nullif(p_bottle->>'priceAmount', '') is null
       and nullif(btrim(p_bottle->>'acquisitionSource'), '') is null
        then 'unknown'
      else 'purchased'
    end,
    nullif(btrim(p_bottle->>'acquisitionSource'), ''),
    v_creator_person_id
  )
  returning id into v_bottle_id;

  insert into wine.tasting_sessions (
    household_id,
    bottle_id,
    started_at,
    date_precision,
    location_name,
    location_context,
    occasion_notes,
    source_confidence,
    created_by_person_id
  )
  values (
    v_household_id,
    v_bottle_id,
    coalesce(nullif(p_bottle->>'startedAt', '')::timestamptz, now()),
    'minute',
    nullif(btrim(p_bottle->>'locationName'), ''),
    nullif(btrim(p_bottle->>'locationContext'), ''),
    nullif(btrim(p_bottle->>'occasionNotes'), ''),
    1,
    v_creator_person_id
  )
  returning id into v_session_id;

  for v_index in 1..2 loop
    v_person_id := case when v_index = 1 then 1 else 2 end;
    v_review := case
      when v_index = 1 then p_gracie_review
      else p_kyle_review
    end;
    v_appearance := coalesce(v_review->'appearance', '{}'::jsonb);
    v_enjoyment := nullif(v_review->>'overallEnjoyment', '')::numeric;

    if v_enjoyment is not null and (v_enjoyment < 0 or v_enjoyment > 10) then
      raise exception 'Enjoyment must be between 0 and 10';
    end if;

    insert into wine.reviews (
      household_id,
      tasting_session_id,
      person_id,
      overall_enjoyment,
      overall_rating_raw,
      personal_notes,
      review_status,
      form_version
    )
    values (
      v_household_id,
      v_session_id,
      v_person_id,
      v_enjoyment,
      case when v_enjoyment is null then null else v_enjoyment::text end,
      nullif(btrim(v_review->>'personalNotes'), ''),
      case when v_review = '{}'::jsonb then 'draft' else 'complete' end,
      'wine-lab-v2'
    )
    returning id into v_review_id;

    insert into wine.appearance_observations (
      household_id,
      review_id,
      color_intensity_numeric,
      color_intensity_raw,
      hue_raw,
      clarity_raw,
      viscosity_numeric,
      viscosity_raw,
      notes
    )
    values (
      v_household_id,
      v_review_id,
      nullif(v_appearance->>'colorIntensityNumeric', '')::numeric,
      nullif(btrim(v_appearance->>'colorIntensity'), ''),
      nullif(btrim(v_appearance->>'hue'), ''),
      nullif(btrim(v_appearance->>'clarity'), ''),
      nullif(v_appearance->>'viscosityNumeric', '')::numeric,
      nullif(btrim(v_appearance->>'viscosity'), ''),
      nullif(btrim(v_appearance->>'notes'), '')
    );

    insert into wine.review_checkpoints (
      household_id,
      review_id,
      sequence_number,
      stage,
      enjoyment_rating,
      finish_pleasure,
      notes
    )
    values (
      v_household_id,
      v_review_id,
      1,
      'initial',
      v_enjoyment,
      nullif(v_review->'metrics'->'finish_pleasure'->>'numeric', '')::numeric,
      nullif(btrim(v_review->>'checkpointNotes'), '')
    )
    returning id into v_checkpoint_id;

    foreach v_metric_code in array array[
      'sweetness',
      'acidity',
      'tannin_firmness',
      'body',
      'alcohol_warmth',
      'aroma_intensity',
      'flavor_intensity',
      'finish_length',
      'finish_pleasure',
      'complexity'
    ] loop
      v_metric := v_review->'metrics'->v_metric_code;
      if jsonb_typeof(v_metric) = 'object'
         and (
           nullif(v_metric->>'numeric', '') is not null
           or nullif(btrim(v_metric->>'raw'), '') is not null
         ) then
        v_numeric := nullif(v_metric->>'numeric', '')::numeric;
        if v_numeric is not null and (v_numeric < 0 or v_numeric > 10) then
          raise exception 'Metric % must be between 0 and 10', v_metric_code;
        end if;

        insert into wine.checkpoint_measurements (
          household_id,
          checkpoint_id,
          metric_code,
          value_numeric,
          value_raw,
          normalization_method,
          normalization_confidence
        )
        values (
          v_household_id,
          v_checkpoint_id,
          v_metric_code,
          v_numeric,
          nullif(btrim(v_metric->>'raw'), ''),
          case when v_numeric is null then null else 'wine-lab-v2-select' end,
          case when v_numeric is null then null else 1 end
        );
      end if;
    end loop;

    foreach v_section in array array['fruit', 'non_fruit', 'extra_notes'] loop
      if jsonb_typeof(v_review->'aromas'->v_section) = 'array' then
        v_sequence := 0;
        for v_descriptor in
          select btrim(value)
          from jsonb_array_elements_text(v_review->'aromas'->v_section) as descriptor(value)
          where length(btrim(value)) > 0
        loop
          v_sequence := v_sequence + 1;
          insert into wine.descriptor_observations (
            household_id,
            checkpoint_id,
            source_section,
            raw_text,
            sequence_number
          )
          values (
            v_household_id,
            v_checkpoint_id,
            v_section,
            v_descriptor,
            v_sequence
          );
        end loop;
      end if;
    end loop;

    for v_prompt in
      select id, prompt_code, sequence_number
      from wine.prompt_definitions
      where household_id = v_household_id
        and form_version = 'wine-lab-v2'
        and active
      order by sequence_number
    loop
      v_response := nullif(btrim(v_review->'vibes'->>v_prompt.prompt_code), '');
      if v_response is not null then
        insert into wine.prompt_responses (
          household_id,
          review_id,
          prompt_definition_id,
          response_text,
          sequence_number
        )
        values (
          v_household_id,
          v_review_id,
          v_prompt.id,
          v_response,
          v_prompt.sequence_number
        );
      end if;
    end loop;
  end loop;

  return v_session_id;
end;
$$;

revoke all on function wine.create_rich_tasting(jsonb, jsonb, jsonb)
from public, anon;

grant execute on function wine.create_rich_tasting(jsonb, jsonb, jsonb)
to authenticated;
