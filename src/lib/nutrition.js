import { DAYS, SPLIT_MAP } from "../constants";
import { getToday } from "../utils";

export function buildMealContext(data) {
  const today = getToday();
  const todayMeals = data.meals[today] || { calories:0, protein:0, carbs:0, fat:0, items:[] };
  const currentW = [...data.weightLog].filter(w=>w.weight).pop()?.weight || 175.8;
  const dayName = DAYS[new Date().getDay()];
  const isTrainingDay = !!SPLIT_MAP[dayName];
  const calTarget = isTrainingDay ? data.profile.calorieTarget.training : data.profile.calorieTarget.rest;

  return `ATHLETE: 6'1", 34M, ${currentW} lbs, lean bulk goal 185-195 @ 8-10% BF. Training day: ${isTrainingDay ? "yes" : "no"}.
TARGETS today: ${calTarget} kcal · ${data.profile.proteinTarget}g protein · 350-400g carbs · 90-100g fat.
TODAY SO FAR: ${todayMeals.calories} kcal · ${todayMeals.protein}g protein · ${todayMeals.carbs}g carbs · ${todayMeals.fat}g fat${todayMeals.items?.length ? " | "+todayMeals.items.join(", ") : ""}.
REMAINING: ~${Math.max(0, calTarget - todayMeals.calories)} kcal · ~${Math.max(0, data.profile.proteinTarget - todayMeals.protein)}g protein.`;
}

export function buildMacroPrompt(ctx, foodInput) {
  return `${ctx}

You are estimating food macros for an athletic adult male on a lean bulk. Goal: ACCURATE estimates, not conservative ones.

RULES:
1. ITEMIZE every food component you identify — give per-item macros
2. Use realistic substantial adult home/restaurant portions when quantities aren't specified
3. Include cooking fats, oils, butters, sauces, dressings — they add real calories that get missed
4. For brand-name foods (Kodiak, RXBAR, specific protein powders), use that brand's actual nutrition label
5. For "Xg protein drink/shake" — that X is the protein content, not powder weight
6. For multi-component meals, identify EVERY part — don't lump things together
7. Don't undershoot — when uncertain between two estimates, pick the higher realistic one
8. Sum ALL items. Verify: total fields MUST equal the sum of item fields
9. ⚠️ ONLY include foods explicitly mentioned by the user OR clearly visible in the photo. DO NOT assume sides, drinks, condiments, or accompaniments the user didn't mention (e.g. don't add milk to cereal unless they said milk; don't add a side salad to a steak unless they said it). When in doubt, leave it out and flag uncertainty in the "comment" field.

Each item: { "name": "specific food with quantity", "calories": kcal, "protein": g, "carbs": g, "fat": g, "fiber": g_or_null, "sugar": g_or_null, "sodium": mg_or_null, "potassium": mg_or_null, "vitaminD": mcg_or_null, "calcium": mg_or_null, "iron": mg_or_null, "zinc": mg_or_null }

${foodInput ? `\nFOOD: ${foodInput}` : "\nAnalyze the attached food photo."}

Return ONLY valid JSON, no markdown:
{
  "items": [{"name": "...", "calories": N, "protein": N, "carbs": N, "fat": N, "fiber": N_or_null, "sugar": N_or_null, "sodium": N_or_null, "potassium": N_or_null, "vitaminD": N_or_null, "calcium": N_or_null, "iron": N_or_null, "zinc": N_or_null}, ...],
  "calories": <sum of item calories>,
  "protein": <sum of item protein>,
  "carbs": <sum of item carbs>,
  "fat": <sum of item fat>,
  "micros": { "fiber": N_or_null, "sugar": N_or_null, "sodium": N_or_null, "potassium": N_or_null, "vitaminD": N_or_null, "calcium": N_or_null, "iron": N_or_null, "zinc": N_or_null },
  "description": "short meal label (e.g. 'Breakfast: pancakes + fruit + shake')",
  "slot": "<exactly one of: breakfast | lunch | snack | pre_workout | post_workout | dinner — infer from text ('breakfast', 'lunch', 'pre-workout' wins) else from typical time of day>",
  "comment": "one sentence: how this fits today's targets, what's left to hit"
}`;
}
