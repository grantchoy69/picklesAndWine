create index if not exists kitchen_recipe_ingredients_ingredient_idx
  on kitchen.recipe_ingredients (household_id, ingredient_id);

create index if not exists kitchen_recipes_creator_idx
  on kitchen.recipes (household_id, created_by_person_id);
