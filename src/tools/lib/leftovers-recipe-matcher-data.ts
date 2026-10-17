// Small hand-written recipe set for the leftovers matcher.
// Row: name | minutes | tags (v = vegetarian, vg = vegan, gf = gluten-free) | ingredients (? = optional) | method
export const RECIPES_RAW = `Fried rice|20|v|cooked rice,egg,soy sauce,green onion,frozen peas?,carrot?,garlic?|Fry garlic and diced veg in a hot pan, push aside and scramble the eggs, add cold rice and soy sauce, toss until hot, finish with green onion.
Spanish omelette|35|v gf|potato,egg,onion,olive oil|Slice potato and onion thinly, cook slowly in oil until soft, mix with beaten eggs, cook in a pan until set, flip and finish.
Frittata|25|v gf|egg,cheese,spinach?,onion?,bell pepper?,ham?,milk?|Sauté the veg, pour over eggs beaten with milk and cheese, cook on low, then finish under the grill.
Bubble and squeak|25|v gf|potato,cabbage,onion,butter|Mash leftover potato with chopped cooked cabbage and onion, fry patties in butter until crisp on both sides.
Pasta aglio e olio|15|vg|pasta,garlic,olive oil,chili flakes,parsley?|Boil pasta, gently fry sliced garlic and chili in plenty of oil, toss with pasta and a splash of pasta water.
Tomato pasta|25|vg|pasta,canned tomato,garlic,onion,olive oil,basil?|Soften onion and garlic, add tomatoes and simmer 15 min, toss with pasta.
Carbonara|20||pasta,egg,bacon,parmesan,black pepper|Crisp the bacon, mix eggs with parmesan, toss hot pasta off the heat with bacon and egg mix, loosen with pasta water.
Mac and cheese|30|v|pasta,cheese,milk,butter,flour|Make a roux with butter and flour, whisk in milk, melt in cheese, stir through cooked macaroni.
Pasta bake|40|v|pasta,canned tomato,cheese,onion,zucchini?,bell pepper?|Mix cooked pasta with a quick tomato sauce and veg, top with cheese, bake 20 min at 200 °C.
Chicken stir-fry|20||chicken,bell pepper,soy sauce,garlic,ginger?,broccoli?,rice?|Stir-fry sliced chicken, add veg and garlic, splash in soy sauce, serve over rice.
Vegetable stir-fry|15|vg|broccoli,carrot,bell pepper,soy sauce,garlic,noodles?|Stir-fry hard veg first then soft ones, add garlic and soy sauce, toss with noodles.
Chicken curry|45|gf|chicken,onion,canned tomato,curry powder,garlic,ginger?,coconut milk?,rice?|Brown onion, add spices, garlic and chicken, then tomatoes and coconut milk; simmer 25 min.
Chickpea curry|30|vg gf|chickpeas,onion,canned tomato,curry powder,garlic,coconut milk?,spinach?|Fry onion and spices, add chickpeas, tomatoes and coconut milk, simmer 15 min, wilt in spinach.
Lentil soup|40|vg gf|lentils,carrot,onion,celery?,garlic,cumin?|Soften the veg, add lentils and water or stock, simmer 25 min, season and blend partly.
Minestrone|45|vg|onion,carrot,celery,canned tomato,pasta,beans?,zucchini?|Soften veg, add tomatoes and stock, simmer, add small pasta and beans for the last 10 min.
Potato leek soup|35|v gf|potato,leek,butter,milk?|Sweat leeks in butter, add diced potato and stock, simmer until soft, blend, add milk.
Tomato soup|30|vg gf|canned tomato,onion,garlic,olive oil,basil?|Cook onion and garlic, add tomatoes and some water, simmer 15 min and blend.
Chicken noodle soup|35||chicken,noodles,carrot,celery,onion|Simmer chicken with veg in stock, shred the meat, add noodles and cook until tender.
Banana bread|70|v|banana,flour,sugar,egg,butter,baking soda|Mash ripe bananas, mix with melted butter, sugar and egg, fold in flour and soda, bake 55 min at 175 °C.
Pancakes|20|v|flour,milk,egg,sugar?,butter?|Whisk flour, milk and egg into a smooth batter, cook ladlefuls in a buttered pan.
French toast|15|v|bread,egg,milk,butter,cinnamon?|Soak bread slices in egg beaten with milk and cinnamon, fry in butter until golden.
Bread pudding|50|v|bread,milk,egg,sugar,raisins?|Layer torn bread in a dish, pour over custard of milk, eggs and sugar, bake 35 min at 180 °C.
Panzanella|15|vg|bread,tomato,cucumber,red onion,olive oil,vinegar?|Toast stale bread cubes, toss with chopped tomato, cucumber, onion, oil and vinegar.
Croutons|15|vg|bread,olive oil,garlic?|Cube stale bread, toss in oil and garlic, bake 10 min at 200 °C.
Quesadillas|15|v|tortilla,cheese,beans?,bell pepper?,chicken?,salsa?|Fill tortillas with cheese and fillings, fold, toast in a dry pan until melted.
Burrito bowl|25|gf|rice,beans,corn,salsa,cheese?,avocado?,chicken?|Pile rice, beans, corn and salsa in bowls, top with cheese, avocado or chicken.
Chili con carne|60|gf|ground beef,beans,canned tomato,onion,chili powder,garlic|Brown beef and onion, add spices, tomatoes and beans, simmer 40 min.
Bean chili|45|vg gf|beans,canned tomato,onion,chili powder,bell pepper,corn?|Soften onion and pepper, add spices, tomatoes, beans and corn, simmer 30 min.
Shepherd's pie|70|gf|ground lamb,potato,onion,carrot,frozen peas?,butter|Cook mince with veg in gravy, top with mashed potato, bake 25 min until golden.
Cottage pie|70|gf|ground beef,potato,onion,carrot,butter,frozen peas?|As shepherd's pie but with beef mince.
Spaghetti bolognese|50||pasta,ground beef,canned tomato,onion,garlic,carrot?|Brown mince with onion and carrot, add tomatoes, simmer 30 min, serve over spaghetti.
Meatballs|40||ground beef,bread,egg,onion,canned tomato|Mix mince with soaked bread, egg and onion, roll balls, brown and simmer in tomato sauce.
Chicken salad|15|gf|chicken,lettuce,tomato,cucumber,mayonnaise?|Toss shredded cooked chicken with salad and a creamy dressing.
Greek salad|10|v gf|tomato,cucumber,feta,red onion,olive oil,olives?|Chop and combine, top with feta and oil.
Coleslaw|10|v gf|cabbage,carrot,mayonnaise,vinegar?|Shred cabbage and carrot, dress with mayonnaise and a splash of vinegar.
Potato salad|25|v gf|potato,mayonnaise,green onion,egg?,mustard?|Boil and cool potatoes, mix with mayonnaise, mustard, onion and chopped egg.
Roasted vegetables|45|vg gf|potato,carrot,onion,olive oil,bell pepper?,zucchini?|Chop into chunks, toss in oil and salt, roast 35 min at 210 °C.
Ratatouille|60|vg gf|eggplant,zucchini,bell pepper,canned tomato,onion,garlic|Cook each veg until soft, combine with tomatoes and garlic, simmer 20 min.
Shakshuka|25|v gf|egg,canned tomato,onion,bell pepper,cumin?,garlic?|Make a spiced tomato and pepper sauce, crack in eggs, cover until the whites set.
Egg fried noodles|15|v|noodles,egg,soy sauce,green onion,cabbage?|Stir-fry cooked noodles with egg, cabbage and soy, top with green onion.
Ramen upgrade|10||instant noodles,egg,green onion,spinach?,ham?|Cook noodles, add greens, top with a soft-boiled egg and green onion.
Tuna pasta|20||pasta,tuna,canned tomato,onion?,olives?|Warm tuna in a quick tomato sauce, toss with pasta.
Tuna melt|15||bread,tuna,cheese,mayonnaise|Mix tuna and mayonnaise, spread on bread, top with cheese, grill until bubbling.
Fish cakes|35||fish,potato,egg,breadcrumbs,parsley?|Mix flaked cooked fish with mashed potato, shape, dip in egg and crumbs, fry.
Salmon rice bowl|20|gf|salmon,rice,cucumber,soy sauce,avocado?|Flake cooked salmon over rice with cucumber, avocado and a drizzle of soy sauce.
Chicken fajitas|25||chicken,tortilla,bell pepper,onion,chili powder,sour cream?|Fry spiced chicken strips with peppers and onion, wrap in warm tortillas.
Baked potatoes|60|v gf|potato,butter,cheese?,beans?,sour cream?|Bake potatoes 50–60 min at 200 °C, split and fill.
Hash browns|20|vg gf|potato,onion?,olive oil|Grate potato, squeeze dry, fry flat cakes until crisp.
Cheese toastie|10|v|bread,cheese,butter|Butter the outside of a cheese sandwich, toast in a pan until golden and melted.
Mushroom risotto|40|v gf|rice,mushroom,onion,parmesan,butter,garlic?|Toast rice with onion, add stock gradually while stirring, fold in sautéed mushrooms, butter and parmesan.
Mushroom toast|15|v|bread,mushroom,garlic,butter,parsley?|Fry mushrooms with garlic in butter, pile on toast.
Creamy mushroom pasta|20|v|pasta,mushroom,cream,garlic,parmesan?|Brown mushrooms and garlic, add cream and simmer, toss with pasta.
Fruit smoothie|5|v gf|banana,milk,yogurt?,berries?,honey?|Blend everything until smooth.
Overnight oats|5|v|oats,milk,yogurt?,berries?,honey?|Stir oats with milk and yogurt, chill overnight, top with fruit.
Apple crumble|50|v|apple,flour,butter,sugar,oats?,cinnamon?|Slice apples into a dish, rub flour, butter and sugar into crumbs, scatter on top, bake 35 min.
Rice pudding|45|v gf|rice,milk,sugar,cinnamon?|Simmer rice slowly in milk and sugar, stirring, until creamy.
Hummus|10|vg gf|chickpeas,tahini,lemon,garlic,olive oil|Blend chickpeas with tahini, lemon, garlic and a little water until smooth.
Guacamole|10|vg gf|avocado,lime,red onion,tomato?,cilantro?|Mash avocado with lime, fold in finely chopped onion, tomato and cilantro.
Stuffed peppers|50|gf|bell pepper,rice,ground beef,canned tomato,cheese?|Fill halved peppers with rice, cooked mince and tomato, top with cheese, bake 30 min.
Veggie fritters|25|v|zucchini,flour,egg,cheese?,green onion?|Grate zucchini, squeeze dry, mix with egg, flour and cheese, fry spoonfuls.
Corn fritters|20|v|corn,flour,egg,milk,green onion?|Mix corn into a thick batter, fry spoonfuls until golden.
Egg salad sandwich|15|v|egg,bread,mayonnaise,mustard?,green onion?|Chop hard-boiled eggs, mix with mayonnaise, sandwich in bread.
Cauliflower cheese|40|v gf|cauliflower,cheese,milk,butter,flour|Par-boil cauliflower, cover with cheese sauce, bake 20 min.
Broccoli cheddar soup|35|v|broccoli,cheese,milk,onion,butter,flour|Make a roux with onion, add stock and milk, simmer broccoli, blend part and melt in cheddar.
Teriyaki salmon|20||salmon,soy sauce,honey,garlic,rice?|Glaze salmon with soy, honey and garlic, pan-fry or bake 12 min.
Pork stir-fry|20||pork,cabbage,soy sauce,garlic,ginger?,noodles?|Stir-fry thin pork slices, add cabbage, garlic and soy sauce.`
