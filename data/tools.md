# 1000 Browser Tools for GitHub Pages

Every tool runs 100% client-side (static HTML/JS + CDN libraries/WebAssembly), so it can be hosted free on GitHub Pages and user files never leave the device.
Each entry: **name** `[2D|3D]` — what it is. *Build:* how to implement it.


## 1. Personal Finance & Budget — *Chart.js, IndexedDB, Papa Parse, Tesseract.js*
1. **Monthly Budget Planner** `[2D]` — zero-based budget with category envelopes. *Build:* IndexedDB storage, editable category table, Chart.js donut of allocations, JSON backup export.
2. **Expense Tracker** `[2D]` — log daily spending and view trends. *Build:* localStorage entries, quick-add form, Chart.js monthly bars, category filters, CSV export.
3. **Bank CSV Analyzer** `[2D]` — categorize transactions from exported bank statements. *Build:* Papa Parse import, keyword rule engine, Chart.js category breakdown, merchant totals table.
4. **Debt Payoff Planner** `[2D]` — compare snowball and avalanche payoff strategies. *Build:* month-by-month simulation loop, Chart.js balance lines, payoff dates, interest saved summary.
5. **Savings Goal Tracker** `[2D]` — track progress toward multiple savings targets. *Build:* localStorage goals, SVG progress rings, required monthly contribution formula, deadline countdown.
6. **Compound Interest Calculator** `[2D]` — project growth with regular contributions over time. *Build:* future value formula, adjustable compounding frequency, Chart.js stacked principal versus interest chart.
7. **Mortgage Comparison Tool** `[2D]` — compare home loan offers side by side. *Build:* annuity formula per offer, amortization tables, total cost comparison, Chart.js overlay chart.
8. **Rent vs Buy Calculator** `[2D]` — compare long-term costs of renting and buying. *Build:* yearly simulation with appreciation, rent growth, opportunity cost, Chart.js net worth lines.
9. **Net Worth Tracker** `[2D]` — record assets and liabilities over time. *Build:* IndexedDB monthly snapshots, editable account list, Chart.js area chart, percentage change indicators.
10. **Subscription Auditor** `[2D]` — list recurring subscriptions and total yearly cost. *Build:* localStorage list, billing cycle normalization, renewal date reminders, sortable cost table.
11. **Bill Split Calculator** `[2D]` — split shared bills fairly among group members. *Build:* dynamic participant rows, weighted or equal shares, minimal settle-up transfers algorithm, shareable URL hash.
12. **Retirement Projection** `[3D]` — visualize retirement savings across ages and returns. *Build:* Monte Carlo simulation in Web Worker, Three.js surface of age, return, balance.
13. **Paycheck Estimator** `[2D]` — estimate take-home pay after taxes and deductions. *Build:* editable tax bracket JSON, pre-tax deduction inputs, per-period breakdown table, Chart.js pie.
14. **Offline Currency Converter** `[2D]` — convert currencies with cached or manual rates. *Build:* optional free keyless rates API fetch, localStorage cache, manual rate override, multi-currency table.
15. **Receipt Scanner** `[2D]` — extract totals from receipt photos into expenses. *Build:* camera capture, Tesseract.js OCR in browser, regex total detection, IndexedDB expense storage.
16. **Envelope Cash Planner** `[2D]` — divide cash into physical spending envelopes. *Build:* denomination breakdown algorithm, per-envelope amounts, printable labels via CSS print stylesheet.
17. **Inflation Calculator** `[2D]` — see purchasing power changes across years. *Build:* bundled CPI dataset JSON, cumulative inflation formula, Chart.js value over time line.
18. **Investment Fee Analyzer** `[2D]` — show long-term impact of fund fees. *Build:* compound growth with expense ratios, side-by-side scenarios, Chart.js lost-returns gap visualization.
19. **Portfolio Rebalancer** `[2D]` — calculate trades to reach target allocation. *Build:* holdings input table, target percentages, buy-sell delta calculation, Chart.js current versus target donuts.
20. **Emergency Fund Calculator** `[2D]` — determine months of expenses needed for safety. *Build:* essential expense inputs, job stability factors, target fund formula, progress bar tracker.
21. **Shared Household Ledger** `[2D]` — track who owes whom among roommates. *Build:* localStorage transactions, running balances per person, debt simplification algorithm, JSON export import.
22. **Spending Heatmap Calendar** `[2D]` — calendar heatmap showing daily spending intensity. *Build:* imported CSV or tracker data, D3.js calendar heatmap, click-through daily transaction details.
23. **Money Flow Sankey** `[2D]` — visualize income flowing into spending categories. *Build:* income and expense inputs, d3-sankey diagram rendering, SVG and PNG export buttons.
24. **Wealth Stack Visualizer** `[3D]` — show savings as stacked 3D coin towers. *Build:* Three.js instanced cylinders scaled by amount, OrbitControls, goal comparison towers, screenshot export.
25. **Invoice Generator** `[2D]` — create printable invoices for freelance work. *Build:* form-driven template, line item totals, jsPDF export, localStorage client and item presets.

## 2. Health & Fitness — *Chart.js, MediaPipe, Three.js, Web Audio*
26. **Body Composition Calculator** `[2D]` — estimate BMI and body fat with formulas. *Build:* Navy and BMI formulas, unit toggles, informational range chart, clear non-medical disclaimer text.
27. **Workout Logger** `[2D]` — log sets, reps, and weights per exercise. *Build:* IndexedDB sessions, exercise templates, personal record detection, Chart.js volume progression charts.
28. **Interval Timer** `[2D]` — customizable HIIT and Tabata workout timer. *Build:* requestAnimationFrame countdown, Web Audio beeps, Wake Lock API, saved presets in localStorage.
29. **Posture Checker** `[3D]` — webcam posture feedback with 3D skeleton view. *Build:* MediaPipe Pose in browser, neck angle computation, Three.js skeleton rendering, gentle alerts.
30. **Rep Counter Camera** `[2D]` — count squats and pushups using webcam. *Build:* MediaPipe Pose landmarks, joint angle thresholds, state machine counting, spoken counts via SpeechSynthesis.
31. **Heart Rate Zones** `[2D]` — compute training zones from age and resting rate. *Build:* Karvonen formula, zone table with colors, Chart.js zone bar, informational notes.
32. **Running Pace Calculator** `[2D]` — convert pace, distance, and finish time. *Build:* solve-for-any-field form, split table generation, race predictor with Riegel formula.
33. **Water Intake Tracker** `[2D]` — track daily water and set reminders. *Build:* localStorage daily logs, tap-to-add glass buttons, Notifications API reminders, weekly Chart.js bars.
34. **Sleep Log Analyzer** `[2D]` — record sleep times and view patterns. *Build:* IndexedDB entries, sleep duration and consistency metrics, Chart.js timeline, CSV export.
35. **Stretching Routine Builder** `[3D]` — build stretch sequences with 3D pose previews. *Build:* Three.js rigged mannequin from glTF, preset pose library, timed sequence player.
36. **Breathing Exercise Guide** `[2D]` — guided box and 4-7-8 breathing animations. *Build:* CSS animated expanding circle, configurable phase durations, Web Audio tones, session counter.
37. **Body Measurement Tracker** `[3D]` — track body measurements with a 3D silhouette. *Build:* IndexedDB measurement history, Three.js parametric body mesh scaled by inputs, Chart.js trends.
38. **Step Goal Tracker** `[2D]` — log daily steps and streaks manually. *Build:* localStorage entries, streak calculation, monthly calendar view, SVG goal progress rings.
39. **One Rep Max Calculator** `[2D]` — estimate one-rep max and percentage tables. *Build:* Epley and Brzycki formulas, averaged estimate, percentage loading table, plate breakdown.
40. **Plate Loading Calculator** `[2D]` — show which plates to load per barbell side. *Build:* greedy plate algorithm, configurable plate inventory, SVG barbell drawing, kg and lb toggle.
41. **Medication Schedule** `[2D]` — reminder schedule for daily medications and supplements. *Build:* localStorage schedule, Notifications API reminders, taken checkboxes, printable weekly chart.
42. **Symptom Journal** `[2D]` — log symptoms to share with your doctor. *Build:* IndexedDB entries with severity sliders, tag filtering, Chart.js trends, PDF export with jsPDF.
43. **Eye Break Reminder** `[2D]` — 20-20-20 reminders to rest your eyes. *Build:* setInterval timer, Notifications API, fullscreen break overlay, daily break count in localStorage.
44. **Desk Ergonomics Calculator** `[3D]` — compute ideal desk, chair, and monitor heights. *Build:* anthropometric ratios from height, Three.js desk scene with adjustable model, measurement labels.
45. **Muscle Group Map** `[3D]` — highlight muscles worked by each exercise. *Build:* Three.js anatomy glTF model, clickable muscle meshes, exercise database JSON lookup.
46. **Menstrual Cycle Tracker** `[2D]` — track cycles and view predicted dates. *Build:* IndexedDB private logs, average cycle length calculation, calendar overlay, local-only data notice.
47. **Calorie Burn Estimator** `[2D]` — estimate calories burned using MET values. *Build:* bundled MET activity table, weight and duration inputs, daily summary, Chart.js totals.
48. **Blood Pressure Log** `[2D]` — record readings and view informational category trends. *Build:* IndexedDB readings, standard category color bands, Chart.js dual-line chart, CSV and PDF export.
49. **Meditation Timer** `[2D]` — silent or guided timer with interval bells. *Build:* Web Audio synthesized bells, Wake Lock API, session history in localStorage, streak tracking.
50. **Hearing Range Test** `[2D]` — check audible frequency range with tones. *Build:* Web Audio oscillator sweep, left-right channel panning, results chart, non-diagnostic disclaimer.

## 3. Nutrition & Cooking — *Fuse.js, Chart.js, Tesseract.js, Web Speech*
51. **Recipe Scaler** `[2D]` — scale ingredient quantities for any serving count. *Build:* ingredient line parser with fractions, scaling factor, unit normalization, copyable output list.
52. **Kitchen Unit Converter** `[2D]` — convert cups, grams, ounces, and spoons. *Build:* ingredient density table JSON, volume-to-weight conversion, searchable ingredient picker with Fuse.js.
53. **Meal Planner** `[2D]` — plan weekly meals and build shopping lists. *Build:* drag-and-drop week grid with SortableJS, recipe library in IndexedDB, aggregated ingredient list.
54. **Macro Calculator** `[2D]` — compute daily calorie and macronutrient targets. *Build:* Mifflin-St Jeor formula, activity multipliers, goal adjustments, Chart.js macro split donut.
55. **Food Diary** `[2D]` — log meals and track daily nutrient totals. *Build:* bundled open nutrition dataset subset, Fuse.js food search, IndexedDB logs, Chart.js daily totals.
56. **Nutrition Label Maker** `[2D]` — generate standard-style nutrition facts labels. *Build:* recipe ingredient nutrient summing, per-serving math, HTML label template, html2canvas PNG export.
57. **Cooking Timer Hub** `[2D]` — run multiple named kitchen timers simultaneously. *Build:* array of timer objects, Web Audio alarms, Wake Lock API, voice start via Web Speech.
58. **Hands-Free Recipe Reader** `[2D]` — read recipe steps aloud with voice navigation. *Build:* SpeechSynthesis step narration, SpeechRecognition next and back commands, Wake Lock API.
59. **Recipe Card Scanner** `[2D]` — digitize handwritten or printed recipe cards. *Build:* camera capture, Tesseract.js OCR, editable ingredient and step fields, IndexedDB recipe box.
60. **Pantry Inventory** `[2D]` — track pantry items and expiration dates. *Build:* IndexedDB items, barcode scanning with ZXing-js, expiry sort and highlights, shopping list export.
61. **Leftovers Recipe Matcher** `[2D]` — suggest recipes from ingredients you already have. *Build:* bundled recipe JSON dataset, ingredient overlap scoring, Fuse.js fuzzy matching, missing-items list.
62. **Sourdough Hydration Calculator** `[2D]` — compute baker's percentages and dough hydration. *Build:* baker's percentage formulas, starter hydration adjustment, flour blend inputs, printable formula card.
63. **Meat Temperature Guide** `[2D]` — safe internal temperatures and resting times. *Build:* searchable JSON reference table, doneness level selector, Celsius-Fahrenheit toggle, printable chart.
64. **Coffee Brew Ratio** `[2D]` — calculate coffee-to-water ratios for brew methods. *Build:* method presets, ratio slider, bloom and pour schedule, built-in step timer with sounds.
65. **Plate Portion Visualizer** `[3D]` — see recommended portion sizes on a 3D plate. *Build:* Three.js plate scene, scaled food primitive volumes, portion presets, OrbitControls rotation.
66. **Cake Pan Converter** `[3D]` — convert recipes between pan shapes and sizes. *Build:* pan area and volume formulas, scale factor output, Three.js pan shape comparison view.
67. **Grocery List Sorter** `[2D]` — sort shopping lists by store aisle. *Build:* keyword-to-aisle mapping JSON, custom store layout editor, checkable list, localStorage sync.
68. **Unit Price Comparer** `[2D]` — compare unit prices across package sizes. *Build:* price and size inputs, unit normalization, cheapest highlight, saved comparisons in localStorage.
69. **Fermentation Tracker** `[2D]` — track ferments, salt ratios, and timelines. *Build:* brine salt percentage calculator, IndexedDB batches, day counter, photo notes via File API.
70. **Allergen Recipe Checker** `[2D]` — flag common allergens in ingredient lists. *Build:* bundled allergen keyword dictionary, ingredient text parsing, highlighted matches, substitution suggestions table.
71. **Ingredient Substitution Finder** `[2D]` — find substitutes for missing cooking ingredients. *Build:* curated substitution JSON, Fuse.js search, ratio-adjusted quantities, dietary filter tags.
72. **Batch Cooking Planner** `[2D]` — plan meal prep sessions and container portions. *Build:* recipe selection, combined ingredient totals, step scheduling timeline, container count calculator.
73. **Fasting Window Timer** `[2D]` — track intermittent fasting windows and history. *Build:* start-stop timestamps in localStorage, SVG progress ring, Chart.js history bars, notifications.
74. **Wine Pairing Guide** `[2D]` — suggest wine styles for chosen dishes. *Build:* bundled pairing rules JSON, dish category selector, flavor profile matching, explanation cards.
75. **Cake Tier Designer** `[3D]` — design tiered cakes and compute batter amounts. *Build:* Three.js stacked cylinder tiers, volume-based batter calculation, servings estimate, color customization.

## 4. Home, Renovation & DIY — *Three.js, Konva.js, DeviceOrientation, Chart.js*
76. **3D Room Planner** `[3D]` — arrange furniture in a scaled 3D room. *Build:* Three.js room from dimensions, draggable furniture boxes, top and perspective views, JSON save.
77. **Paint Calculator** `[2D]` — estimate paint needed for walls and ceilings. *Build:* wall dimension inputs, door and window subtraction, coat count, coverage rate, can sizing.
78. **Tile Layout Planner** `[3D]` — preview tile patterns and count tiles needed. *Build:* Three.js floor plane with pattern textures, waste percentage, cut count estimation, grout options.
79. **Floor Plan Sketcher** `[2D]` — draw floor plans with measured walls. *Build:* Konva.js canvas, snapping wall tool, auto dimension labels, area calculation, SVG and PNG export.
80. **Wallpaper Roll Calculator** `[2D]` — calculate rolls needed including pattern repeat. *Build:* wall dimensions, roll size inputs, pattern repeat drop math, strip count output.
81. **Lumber Cut Optimizer** `[2D]` — minimize waste when cutting boards to length. *Build:* first-fit decreasing bin packing, kerf width setting, SVG cut diagrams, printable cut list.
82. **Sheet Cut Planner** `[2D]` — optimize plywood panel cuts with guillotine layouts. *Build:* 2D guillotine packing algorithm in Web Worker, Konva.js layout render, waste percentage report.
83. **Stair Calculator** `[3D]` — compute rise, run, and stringer dimensions. *Build:* building code range checks, stringer layout math, Three.js stair model preview, SVG stringer template.
84. **Deck Builder Estimator** `[3D]` — design decks and estimate boards and joists. *Build:* Three.js deck model from dimensions, joist spacing logic, material list, cost totals.
85. **Concrete Volume Calculator** `[2D]` — estimate concrete for slabs, footings, and columns. *Build:* shape-specific volume formulas, waste factor, bag count by size, cubic yard conversion.
86. **Spirit Level** `[2D]` — use phone sensors as a bubble level. *Build:* DeviceOrientation API, calibration offset in localStorage, CSS bubble animation, angle readout display.
87. **Photo Measure Tool** `[2D]` — estimate distances in photos using reference objects. *Build:* File API image load, click-to-measure points, reference scale calibration, canvas annotations.
88. **Home Maintenance Scheduler** `[2D]` — track recurring home maintenance tasks and dates. *Build:* preset seasonal task list, IndexedDB completion history, next-due calculation, ICS calendar export.
89. **Home Inventory Catalog** `[2D]` — catalog belongings with photos for insurance. *Build:* IndexedDB items with images, room grouping, value totals, jsPDF report export.
90. **Energy Usage Estimator** `[2D]` — estimate appliance electricity use and cost. *Build:* appliance wattage presets, hours-per-day inputs, tariff rate, Chart.js cost breakdown.
91. **Solar Panel Estimator** `[3D]` — estimate rooftop panel layout and yearly output. *Build:* Three.js roof model with panel placement, sun angle math, optional free irradiance API.
92. **Room Palette Extractor** `[2D]` — extract paint color palette from room photos. *Build:* File API image load, k-means color quantization on canvas, hex swatches, palette export.
93. **Wall Color Previewer** `[2D]` — recolor walls in photos to preview paint. *Build:* canvas flood fill with tolerance, luminance-preserving HSL recolor, before-after slider comparison.
94. **Insulation R-Value Calculator** `[2D]` — compute total R-value of wall assemblies. *Build:* material R-value table JSON, layer stack builder, U-factor conversion, heat loss estimate.
95. **Shelf Sag Calculator** `[2D]` — estimate shelf deflection under load. *Build:* beam deflection formula, wood species modulus table, span and load inputs, SVG sag diagram.
96. **Fence Material Estimator** `[2D]` — calculate posts, rails, and pickets for fences. *Build:* perimeter segment inputs, spacing rules, gate allowances, material list with cost totals.
97. **Electrical Load Calculator** `[2D]` — sum circuit loads and check breaker capacity. *Build:* appliance amperage presets, per-circuit grouping, 80 percent rule check, warnings table.
98. **DIY Project Tracker** `[2D]` — track renovation tasks, budgets, and receipts. *Build:* kanban columns with SortableJS, IndexedDB tasks, receipt photo attachments, budget variance chart.
99. **Furniture Fit Checker** `[3D]` — check whether furniture fits through doors and hallways. *Build:* Three.js corridor and object boxes, rotation sweep test, pass-fail with clearance values.
100. **Roof Pitch Calculator** `[3D]` — compute roof pitch, area, and shingle bundles. *Build:* rise-run trigonometry, Three.js gable roof preview, area calculation, bundle and waste estimate.

## 5. Gardening & Plants — *Three.js, SunCalc, Chart.js, IndexedDB*
101. **Garden Bed Planner** `[3D]` — lay out raised beds and plants in 3D. *Build:* Three.js garden scene, grid snapping, plant spacing rules, mature size preview.
102. **Square Foot Garden** `[2D]` — plan square foot garden plantings per cell. *Build:* CSS grid editor, plants-per-square rules JSON, companion warnings, printable layout.
103. **Companion Planting Checker** `[2D]` — check which plants grow well together. *Build:* companion matrix JSON, multi-select plant picker, compatibility grid, color-coded conflicts.
104. **Planting Calendar** `[2D]` — sowing and harvest dates by frost dates. *Build:* user frost date inputs, crop timing JSON, Gantt-style timeline with Chart.js, ICS export.
105. **Sun Exposure Mapper** `[3D]` — model sunlight and shadows across your yard. *Build:* SunCalc sun positions, Three.js yard with obstacle boxes, shadow mapping, hourly sun-hours heatmap.
106. **Watering Schedule** `[2D]` — schedule watering by plant needs and weather. *Build:* plant water profiles, localStorage schedule, optional free Open-Meteo rainfall fetch, notifications.
107. **Plant Care Journal** `[2D]` — log watering, fertilizing, and growth photos. *Build:* IndexedDB plant entries, photo timeline via File API, care reminders, growth comparison slider.
108. **Houseplant Light Meter** `[2D]` — estimate light levels using phone camera. *Build:* getUserMedia frames, average luminance calculation, calibrated lux estimate, plant suitability ranges.
109. **Seed Inventory** `[2D]` — track seed packets, viability, and quantities. *Build:* IndexedDB seed records, viability by age table, sowing quantity calculator, CSV export.
110. **Seed Starting Calculator** `[2D]` — calculate indoor seed start and transplant dates. *Build:* last frost date input, crop weeks-before table, sortable schedule, calendar export.
111. **Soil Mix Calculator** `[2D]` — compute volumes of soil components for containers. *Build:* container shape volume formulas, mix ratio presets, bag counts, cost totals.
112. **Compost Ratio Calculator** `[2D]` — balance greens and browns for compost piles. *Build:* carbon-nitrogen ratio material table, ingredient quantities, resulting ratio gauge, adjustment suggestions.
113. **Fertilizer NPK Calculator** `[2D]` — compute fertilizer amounts for target nutrients. *Build:* NPK label inputs, area and rate math, product comparison, mixing instructions output.
114. **Lawn Seed Calculator** `[2D]` — estimate seed and fertilizer needed for lawns. *Build:* polygon area drawing on canvas, grass type rates JSON, product quantities, cost estimate.
115. **Plant Growth Timelapse** `[2D]` — create timelapse videos from plant photos. *Build:* File API photo import, canvas alignment overlay, MediaRecorder WebM export, frame rate control.
116. **Plant Identifier Key** `[2D]` — identify plants through guided dichotomous questions. *Build:* decision tree JSON, step-by-step question UI, illustrated SVG options, result cards.
117. **Greenhouse Climate Log** `[2D]` — log temperature and humidity readings over time. *Build:* IndexedDB readings, CSV import from sensors, Chart.js dual-axis charts, threshold alerts.
118. **Hydroponics Nutrient Calculator** `[2D]` — mix nutrient solutions to target EC and pH. *Build:* product dosing tables, reservoir volume inputs, EC target math, mixing order steps.
119. **Tree Growth Visualizer** `[3D]` — preview mature tree sizes near your house. *Build:* Three.js procedural trees by species dimensions, house box reference, age slider, shadows.
120. **Orchard Spacing Planner** `[2D]` — plan fruit tree spacing and pollination partners. *Build:* canvas grid layout, rootstock spacing rules, pollination group compatibility, tree count output.
121. **Rain Barrel Calculator** `[2D]` — estimate rainwater harvest from roof area. *Build:* roof area and rainfall inputs, runoff coefficient, monthly Chart.js collection, barrel count.
122. **Frost Alert Checker** `[2D]` — check upcoming frost risk for your location. *Build:* Geolocation API, optional free Open-Meteo forecast fetch, minimum temperature thresholds, protection tips.
123. **Pond Volume Calculator** `[3D]` — estimate pond volume, liner size, and pump flow. *Build:* shape-based volume formulas, liner overlap math, Three.js pond shape preview, pump sizing.
124. **Harvest Yield Tracker** `[2D]` — record harvest weights and compare seasons. *Build:* IndexedDB harvest entries per crop, season grouping, Chart.js yield bars, value estimate.
125. **Crop Rotation Planner** `[2D]` — plan multi-year crop rotation across beds. *Build:* plant family grouping JSON, bed-by-year grid, rotation rule warnings, localStorage persistence.

## 6. Travel & Outdoors — *Leaflet, Three.js, SunCalc, togeojson*
126. **Packing List Builder** `[2D]` — generate packing lists by trip type and length. *Build:* template JSON by activity, quantity scaling by days, checkboxes, localStorage saved lists.
127. **Trip Budget Planner** `[2D]` — plan trip costs with multi-currency expenses. *Build:* category budgets, manual exchange rates, per-person split, Chart.js spending breakdown.
128. **GPX Track Viewer** `[2D]` — view and edit GPX tracks on maps. *Build:* Leaflet with OpenStreetMap tiles, togeojson parsing, point editing, GPX re-export.
129. **Hike Elevation Profile** `[2D]` — elevation profile and climb stats for routes. *Build:* GPX parsing, distance-elevation computation, Chart.js profile, Naismith time estimate.
130. **Trail Flyover** `[3D]` — animated 3D flyover of hiking routes. *Build:* Three.js terrain mesh from public elevation tiles, camera following GPX track, MediaRecorder export.
131. **Itinerary Planner** `[2D]` — build day-by-day trip itineraries with maps. *Build:* SortableJS day lists, Leaflet markers, travel time estimates, printable and ICS export.
132. **Time Zone Planner** `[2D]` — find meeting times across multiple time zones. *Build:* Intl.DateTimeFormat conversions, draggable hour slider grid, saved city list, shareable URL.
133. **Jet Lag Planner** `[2D]` — schedule light and sleep shifts before travel. *Build:* time zone difference calculation, gradual shift algorithm, daily schedule table, ICS export.
134. **Offline Phrasebook** `[2D]` — essential travel phrases with pronunciation playback. *Build:* bundled phrase JSON per language, SpeechSynthesis voices, favorites, service worker offline caching.
135. **Sunrise Sunset Planner** `[2D]` — golden hour and twilight times for any location. *Build:* SunCalc library, Leaflet location picker, timeline bar visualization, date range table.
136. **Star Map Viewer** `[3D]` — interactive 3D sky dome for stargazing. *Build:* Three.js celestial sphere, bundled star catalog, local sidereal time math, DeviceOrientation pointing.
137. **Compass and Coordinates** `[2D]` — compass heading and GPS coordinates display. *Build:* DeviceOrientation absolute heading, Geolocation API, coordinate format conversion, copy-to-clipboard.
138. **Camping Gear Checklist** `[2D]` — camping gear checklist with weight totals. *Build:* gear database in IndexedDB, weight sums by category, Chart.js pack weight breakdown, sharing.
139. **Backpack Load Planner** `[3D]` — plan backpack loading with center-of-gravity view. *Build:* Three.js backpack zones, item weight placement, center of mass computation, balance advice.
140. **Moon Phase Calendar** `[2D]` — monthly moon phases and illumination percentages. *Build:* astronomical phase algorithm, SVG moon rendering, monthly grid, rise and set via SunCalc.
141. **Visa Day Counter** `[2D]` — count days spent in rolling travel windows. *Build:* trip date inputs, rolling 180-day window computation, remaining days display, localStorage history.
142. **Travel Document Vault** `[2D]` — encrypted offline storage for document copies. *Build:* Web Crypto AES-GCM encryption, IndexedDB blobs, passphrase unlock, encrypted backup export.
143. **Hiking Time Estimator** `[2D]` — estimate hiking duration from distance and climb. *Build:* Naismith and Tobler formulas, fitness adjustment, break allowances, turnaround time calculation.
144. **Map Distance Measurer** `[2D]` — measure distances and areas on maps. *Build:* Leaflet with OSM tiles, click-to-add polyline and polygon, Turf.js length and area.
145. **Photo Geotag Mapper** `[2D]` — map travel photos using embedded GPS data. *Build:* exifr EXIF parsing, Leaflet marker clusters, thumbnail popups, chronological route line.
146. **Peak Panorama Identifier** `[3D]` — identify visible mountain peaks from your viewpoint. *Build:* Three.js terrain render from public elevation tiles, peak label dataset, compass heading alignment.
147. **Weather Layering Guide** `[2D]` — suggest clothing layers for outdoor conditions. *Build:* temperature, wind, rain inputs, wind chill formula, layering rules JSON, optional Open-Meteo fetch.
148. **Travel Journal** `[2D]` — offline journal with photos and locations. *Build:* IndexedDB entries, Geolocation tagging, canvas image compression, Leaflet map and PDF export.
149. **Luggage Fit Checker** `[3D]` — check bag dimensions against airline size limits. *Build:* bundled carrier size JSON, Three.js bag versus limit box overlay, pass-fail result.
150. **Tent Site Sun Planner** `[2D]` — pick tent orientation for morning sun and wind. *Build:* SunCalc sunrise azimuth, wind direction input, SVG compass diagram, orientation recommendation.

## 7. Parenting & Family — *IndexedDB, Chart.js, Web Speech, Three.js*
151. **Baby Feeding Tracker** `[2D]` — log feeds, sides, and durations. *Build:* one-tap start-stop timers, IndexedDB logs, last-feed summary, Chart.js daily totals.
152. **Diaper and Sleep Log** `[2D]` — track newborn diapers and sleep sessions. *Build:* quick-tap logging buttons, IndexedDB storage, daily timeline visualization, CSV export for pediatrician.
153. **Growth Percentile Chart** `[2D]` — plot child growth against reference percentile curves. *Build:* bundled WHO LMS reference tables, LMS percentile formula, Chart.js curves, informational notes.
154. **Chore Chart** `[2D]` — assign family chores with points and rewards. *Build:* localStorage chore assignments, rotating schedule, checkbox completion, points tally and reward thresholds.
155. **Allowance Tracker** `[2D]` — track kids' allowance, savings, and spending jars. *Build:* per-child ledgers in localStorage, save-spend-give split, interest simulation, Chart.js balances.
156. **Screen Time Planner** `[2D]` — plan and track kids' daily screen time. *Build:* daily budget settings, countdown timer, Web Audio warnings, weekly Chart.js usage summary.
157. **Family Calendar** `[2D]` — family schedule with color-coded members. *Build:* FullCalendar library, IndexedDB events, recurring rules, ICS import and export.
158. **Bedtime Routine Timer** `[2D]` — visual step-by-step bedtime routine for kids. *Build:* picture step cards, per-step timers, Web Audio chimes, progress animation, customizable steps.
159. **Baby Name Explorer** `[2D]` — browse and shortlist baby names with filters. *Build:* bundled public name dataset, Fuse.js search, origin and length filters, partner shortlist via URL.
160. **Due Date Calculator** `[2D]` — estimate due date and pregnancy week milestones. *Build:* Naegele rule calculation, week-by-week timeline, informational milestones, ICS calendar export.
161. **Contraction Timer** `[2D]` — time contraction duration and frequency. *Build:* big start-stop button, interval and duration stats, Wake Lock API, exportable log table.
162. **Adult Height Estimator** `[2D]` — estimate adult height from parents' heights. *Build:* mid-parental height formula, range output, Chart.js projected curve, informational disclaimer.
163. **Car Seat Stage Guide** `[2D]` — informational car seat stage by age and size. *Build:* rules JSON from public guidelines, age-weight-height inputs, stage cards, disclaimer notes.
164. **Homework Planner** `[2D]` — track assignments and due dates for kids. *Build:* subject-colored task list, IndexedDB storage, due-date sorting, notifications and weekly overview.
165. **Reading Log** `[2D]` — track books read and reading minutes. *Build:* IndexedDB book entries, minutes timer, streak badges, optional Open Library cover fetch.
166. **Math Worksheet Generator** `[2D]` — generate printable math worksheets for kids. *Build:* random problem generator by level, CSS print layout, answer key page, seeded randomness.
167. **Nursery Room Planner** `[3D]` — plan nursery furniture layout in 3D. *Build:* Three.js room scene, preset crib and dresser models, clearance checks, JSON save.
168. **Family Tree Builder** `[2D]` — build and visualize family trees. *Build:* D3.js tree layout, editable person records, GEDCOM import and export, SVG download.
169. **Milestone Tracker** `[2D]` — record baby milestones with photos and dates. *Build:* preset milestone checklist, IndexedDB photos, timeline view, printable memory book via jsPDF.
170. **Babysitter Info Sheet** `[2D]` — printable emergency and routine info for sitters. *Build:* form fields for contacts and routines, print stylesheet, QR code via qrcode.js.
171. **Height Comparison Wall** `[3D]` — track child height against familiar 3D objects. *Build:* Three.js scene with scaled reference objects, height history markers, growth animation slider.
172. **Clothing Size Tracker** `[2D]` — track kids' sizes and outgrown clothes. *Build:* per-child size history, IndexedDB clothing inventory, outgrown flags, hand-me-down list export.
173. **Vocabulary Flashcards** `[2D]` — picture and audio flashcards for early learners. *Build:* emoji or image card sets, SpeechSynthesis pronunciation, spaced repetition in localStorage.
174. **Solar System Explorer** `[3D]` — interactive 3D solar system for kids. *Build:* Three.js planets with scaled orbits, clickable info cards, time speed slider.
175. **Family Emergency Plan** `[2D]` — create household emergency plans and contact cards. *Build:* guided form, meeting points, supply checklist, printable wallet cards, offline service worker.

## 8. Productivity & Time — *IndexedDB, Chart.js, SortableJS, 3d-force-graph*
176. **Pomodoro Timer** `[2D]` — focus sessions with breaks and stats. *Build:* configurable intervals, Web Audio chimes, Notifications API, IndexedDB session history, Chart.js stats.
177. **Habit Tracker** `[2D]` — track daily habits with streaks and heatmaps. *Build:* localStorage habits, calendar heatmap with D3.js, streak computation, JSON backup.
178. **Eisenhower Matrix** `[2D]` — sort tasks by urgency and importance. *Build:* four-quadrant drag-and-drop with SortableJS, localStorage persistence, completed archive, export.
179. **Kanban Board** `[2D]` — personal kanban board stored locally. *Build:* SortableJS columns, IndexedDB cards, labels and due dates, JSON import export.
180. **Time Blocking Planner** `[2D]` — plan your day in time blocks. *Build:* draggable resizable blocks on hour grid with interact.js, planned versus actual comparison, print view.
181. **Markdown Notes** `[2D]` — offline markdown notes with full-text search. *Build:* marked.js rendering, IndexedDB notes, MiniSearch full-text index, tags, ZIP export via JSZip.
182. **Voice Memo Transcriber** `[2D]` — record voice notes and transcribe them. *Build:* MediaRecorder audio capture, Web Speech recognition, IndexedDB storage, searchable transcript list.
183. **Meeting Cost Timer** `[2D]` — show running cost of meetings live. *Build:* attendee count and hourly rates, live ticking total, shareable fullscreen view.
184. **Focus Soundscape Mixer** `[2D]` — mix ambient noise for concentration. *Build:* Web Audio generated white, pink, brown noise, layered loops, volume sliders, saved mixes.
185. **OKR Goal Tracker** `[2D]` — set objectives and track key result progress. *Build:* nested objective records, progress percentage rollup, Chart.js progress bars, quarterly archive.
186. **Mind Map Maker** `[2D]` — create mind maps with keyboard shortcuts. *Build:* D3.js tree layout, keyboard node creation, localStorage autosave, SVG and PNG export.
187. **Knowledge Graph Explorer** `[3D]` — explore linked notes as 3D knowledge graph. *Build:* 3d-force-graph library, wiki-link parsing from notes, node search, focus navigation.
188. **Time Tracker** `[2D]` — track time spent per project and client. *Build:* start-stop timers, IndexedDB entries, weekly reports, Chart.js breakdowns, CSV export for invoicing.
189. **Countdown Dashboard** `[2D]` — multiple countdowns to important dates. *Build:* date inputs, live updating cards, localStorage persistence, shareable countdown URLs.
190. **Daily Journal** `[2D]` — private daily journal with prompts and mood. *Build:* IndexedDB entries, rotating prompt list, mood selector, optional Web Crypto encryption.
191. **Weekly Review Guide** `[2D]` — guided weekly review checklist and reflection. *Build:* structured question form, IndexedDB history, previous week comparison, markdown export.
192. **Life in Weeks** `[2D]` — visualize your life as week grid. *Build:* birthdate input, canvas grid of weeks, milestone annotations, PNG export.
193. **Speed Reading Trainer** `[2D]` — RSVP speed reading with adjustable pace. *Build:* word-by-word display, optimal recognition point highlighting, WPM slider, paste or file input.
194. **Meeting Notes Template** `[2D]` — structured meeting notes with action item extraction. *Build:* template sections, checkbox action items, markdown export, IndexedDB history.
195. **Deadline Backward Planner** `[2D]` — plan milestones backward from a deadline. *Build:* task durations input, reverse scheduling algorithm, Frappe Gantt chart, ICS export.
196. **Decision Matrix** `[2D]` — weigh options against weighted criteria. *Build:* editable criteria weights, score grid, weighted totals, Chart.js radar comparison, export.
197. **Snippet Clipboard Pad** `[2D]` — save and reuse frequently copied text snippets. *Build:* Clipboard API paste capture, localStorage snippets, search, one-click copy, categories.
198. **Focus Lock Screen** `[2D]` — fullscreen focus mode with single task display. *Build:* Fullscreen API, Wake Lock API, task and timer display, exit confirmation.
199. **Calendar Load Analyzer** `[2D]` — analyze calendar ICS exports for meeting load. *Build:* ical.js parsing, hours per week computation, Chart.js meeting load heatmap, insights.
200. **Routine Checklist Builder** `[2D]` — morning and evening routine checklists with timers. *Build:* ordered steps with durations, daily reset in localStorage, completion streaks, total time.

## 9. Pets & Animals — *IndexedDB, Chart.js, Leaflet, Three.js*
201. **Pet Health Log** `[2D]` — track vet visits, vaccines, and medications. *Build:* IndexedDB per-pet records, upcoming due reminders, document photo attachments, printable summary.
202. **Pet Weight Tracker** `[2D]` — track pet weight with healthy range info. *Build:* IndexedDB weigh-ins, breed reference ranges JSON, Chart.js trend line, informational notes.
203. **Dog Food Calculator** `[2D]` — estimate daily calories and food portions for dogs. *Build:* RER and MER formulas, activity factors, kibble kcal input, cups per meal.
204. **Cat Food Calculator** `[2D]` — estimate daily wet and dry food portions. *Build:* RER formula with life-stage factors, mixed feeding split, can and gram outputs.
205. **Pet Age Converter** `[2D]` — convert pet age to human-equivalent years. *Build:* species and size-specific formulas, log-based dog formula, life stage display.
206. **Aquarium Volume Calculator** `[3D]` — compute tank volume and stocking guidelines. *Build:* shape formulas, Three.js tank preview with water level, filter turnover, stocking estimate.
207. **Aquarium Water Log** `[2D]` — log ammonia, nitrite, nitrate, and pH tests. *Build:* IndexedDB test entries, safe range bands, Chart.js multi-series, cycle progress indicator.
208. **Dog Walk Tracker** `[2D]` — record walks with distance and route. *Build:* Geolocation watchPosition, Leaflet route drawing, Haversine distance, IndexedDB walk history.
209. **Pet Sitter Instructions** `[2D]` — printable care sheets for pet sitters. *Build:* guided form for feeding and meds, emergency contacts, print stylesheet, QR code sharing.
210. **Puppy Training Planner** `[2D]` — plan training sessions and track skill progress. *Build:* skill checklist JSON, session logs, success rate charts, next-step recommendations.
211. **Clicker Trainer** `[2D]` — on-screen training clicker with session counter. *Build:* Web Audio synthesized click, large tap target, treat counter, session timer.
212. **Toxic Food Checker** `[2D]` — check foods and plants unsafe for pets. *Build:* bundled toxicity reference JSON, Fuse.js search, species filter, severity labels with sources.
213. **Pet Medication Scheduler** `[2D]` — reminders for pet medications and flea treatments. *Build:* recurring schedule rules, Notifications API reminders, given checkboxes, history log.
214. **Pet Expense Tracker** `[2D]` — track spending on food, vet, and supplies. *Build:* localStorage entries per pet, category breakdown, Chart.js monthly costs, yearly projection.
215. **Chicken Coop Planner** `[3D]` — design coops sized for flock count. *Build:* space-per-bird rules, Three.js coop model with nesting boxes, roost length, materials list.
216. **Dog House Builder** `[3D]` — design dog houses sized to your dog. *Build:* breed size inputs, proportional dimension rules, Three.js model preview, cut list output.
217. **Bird Song Recorder** `[2D]` — record bird calls and view spectrograms. *Build:* MediaRecorder capture, Web Audio AnalyserNode spectrogram on canvas, IndexedDB recordings with notes.
218. **Pet Adoption Checklist** `[2D]` — prepare home and supplies for new pets. *Build:* species-specific checklist JSON, progress tracking, cost estimate, printable shopping list.
219. **Pet Gestation Calculator** `[2D]` — estimate due dates for pregnant pets. *Build:* species gestation table JSON, mating date input, timeline milestones, calendar export.
220. **Horse Weight Estimator** `[2D]` — estimate horse weight from tape measurements. *Build:* heartgirth and length formula, unit conversion, daily forage amount estimate.
221. **Reptile Habitat Planner** `[3D]` — plan terrarium layout with heat gradients. *Build:* Three.js enclosure scene, draggable decor, heat zone color overlay, species requirements JSON.
222. **Lost Pet Poster Maker** `[2D]` — create printable lost pet posters quickly. *Build:* photo upload, template layouts, QR code with contact info, PDF export via jsPDF.
223. **Bark Monitor** `[2D]` — detect and log barking while you're away. *Build:* Web Audio analyser volume threshold, timestamped event log, optional recording clips, charts.
224. **Pet Vaccine Schedule** `[2D]` — generate vaccination schedules for puppies and kittens. *Build:* species schedule JSON, birthdate input, timeline table, ICS calendar export, vet disclaimer.
225. **Fish Compatibility Checker** `[2D]` — check aquarium fish species compatibility. *Build:* species traits JSON, temperament and parameter overlap checks, compatibility matrix, warnings.

## 10. Car, Driving & Commute — *Leaflet, Chart.js, Three.js, Geolocation API*
226. **Fuel Cost Calculator** `[2D]` — estimate trip fuel cost by distance. *Build:* consumption and price inputs, unit conversions, round-trip toggle, cost per passenger.
227. **Fuel Economy Log** `[2D]` — log fill-ups and track real fuel economy. *Build:* IndexedDB fill-up records, full-tank calculation method, Chart.js economy trend, cost stats.
228. **Car Maintenance Tracker** `[2D]` — track service history and upcoming maintenance. *Build:* mileage-based intervals JSON, IndexedDB service records, due alerts, receipt photo attachments.
229. **Car Loan Calculator** `[2D]` — compare auto loans and lease costs. *Build:* annuity and lease formulas, down payment and trade-in inputs, total cost comparison.
230. **EV Charging Calculator** `[2D]` — estimate electric car charging cost and time. *Build:* battery size, efficiency, tariff inputs, charger power curves, cost per kilometer.
231. **EV vs Gas Comparer** `[2D]` — compare ownership costs of electric and gas cars. *Build:* multi-year cost simulation, fuel and electricity prices, maintenance estimates, Chart.js cumulative lines.
232. **Commute Cost Analyzer** `[2D]` — calculate true yearly cost of commuting. *Build:* mode-specific cost inputs, time value calculation, yearly totals, Chart.js mode comparison.
233. **Parking Spot Saver** `[2D]` — save parking location and meter countdown. *Build:* Geolocation API, Leaflet map pin, meter timer with notifications, photo note via camera.
234. **Speedometer HUD** `[2D]` — GPS speedometer with windshield mirror mode. *Build:* Geolocation watchPosition speed, large digital display, CSS mirror transform, Wake Lock API.
235. **Trip Mileage Logger** `[2D]` — log business mileage for reimbursement records. *Build:* start-end odometer or GPS distance, purpose fields, IndexedDB log, CSV report export.
236. **Tire Size Comparer** `[3D]` — compare tire sizes and speedometer error. *Build:* tire code parsing, diameter calculations, Three.js side-by-side tire models, speed difference table.
237. **Garage Fit Checker** `[3D]` — check car fits garage with door clearances. *Build:* Three.js garage and car boxes, door swing arcs, clearance measurements, bundled dimension presets.
238. **Learner Driving Log** `[2D]` — track supervised practice hours for learner drivers. *Build:* session timer, day-night classification via SunCalc, IndexedDB log, printable hours report.
239. **Car Depreciation Calculator** `[2D]` — project car value decline over ownership years. *Build:* depreciation curve model, age and mileage inputs, Chart.js value line, resale estimate.
240. **Road Trip Planner** `[2D]` — plan stops, distances, and driving breaks. *Build:* Leaflet map, optional free public OSRM routing, driving segment limits, fuel stop suggestions.
241. **Carpool Cost Splitter** `[2D]` — split commute costs fairly among carpool riders. *Build:* distance per rider, fuel and toll inputs, proportional split algorithm, weekly summary.
242. **Trunk Cargo Loader** `[3D]` — check whether items fit in your trunk. *Build:* Three.js trunk volume box, draggable item boxes, collision checks, bin packing suggestions.
243. **Towing Capacity Checker** `[2D]` — check trailer weights against vehicle limits. *Build:* GVWR, GCWR, tongue weight inputs, percentage checks, color-coded pass-fail table.
244. **Car Document Wallet** `[2D]` — store insurance, registration, and renewal dates. *Build:* IndexedDB document photos, expiry reminders, optional Web Crypto encryption, offline service worker.
245. **Dashboard Light Guide** `[2D]` — identify car warning lights and their meanings. *Build:* SVG icon library, color and shape filters, Fuse.js search, informational action advice.
246. **Drive Time Logger** `[2D]` — record commute times to find best departure. *Build:* one-tap start-stop logging, IndexedDB trips, Chart.js departure time scatter, best window.
247. **Acceleration Timer** `[2D]` — measure zero-to-sixty times using phone GPS. *Build:* high-accuracy Geolocation speed sampling, start detection, run history, passenger-only safety notice.
248. **Turning Radius Visualizer** `[3D]` — visualize car turning circles in tight spaces. *Build:* Ackermann geometry from wheelbase, Three.js top and perspective views, driveway obstacle placement.
249. **Tire Pressure Log** `[2D]` — log tire pressures and tread depth readings. *Build:* per-wheel inputs, IndexedDB history, recommended pressure reference, Chart.js trend per tire.
250. **Car Comparison Sheet** `[2D]` — compare candidate cars across specs and costs. *Build:* editable spec table, weighted scoring, total cost of ownership, Chart.js radar comparison.

## 11. Text & Writing — *Web APIs, compromise.js, diff-match-patch, marked, transformers.js*
251. **Word Counter Pro** `[2D]` — counts words, characters, sentences, reading time. *Build:* textarea input event, Intl.Segmenter word splitting, compute reading and speaking time estimates live.
252. **Readability Scorer** `[2D]` — grades text with Flesch and Gunning Fog. *Build:* syllable counting heuristic in JS, compute formulas, highlight long sentences inline.
253. **Text Diff Checker** `[2D]` — compares two text versions side by side. *Build:* diff-match-patch diff_main, render insertions and deletions with colored spans.
254. **Case Converter** `[2D]` — switches text between title, snake, camel cases. *Build:* regex word splitting, transform functions per case, copy result via Clipboard API.
255. **Markdown Live Editor** `[2D]` — writes Markdown with instant HTML preview. *Build:* marked.js parse on input, DOMPurify sanitize, save drafts to localStorage.
256. **Duplicate Line Remover** `[2D]` — removes repeated lines and sorts lists. *Build:* split on newlines, Set dedupe with optional trim and case-insensitive comparison.
257. **Regex Find Replace** `[2D]` — bulk find and replace using regular expressions. *Build:* RegExp constructor with flags, live match highlighting, replace with capture groups.
258. **Passive Voice Finder** `[2D]` — highlights passive voice and weak adverbs. *Build:* compromise.js verb tagging, detect be-verb plus past participle, mark spans.
259. **Lorem Ipsum Generator** `[2D]` — creates placeholder paragraphs, lists, and headings. *Build:* seeded word bank, random sentence assembly, output plain text or HTML.
260. **Text Summarizer** `[2D]` — extracts key sentences from long text. *Build:* TF-IDF sentence scoring in JS, select top sentences preserving original order.
261. **Private Dictation Pad** `[2D]` — types text by speaking, on-device where the browser supports it. *Build:* Web Speech API with on-device recognition when available, voice punctuation commands, autosaving editor, export TXT.
262. **Text To Speech Reader** `[2D]` — reads documents aloud with adjustable voice. *Build:* SpeechSynthesis API voices list, rate and pitch sliders, highlight current word.
263. **Offline Spell Checker** `[2D]` — flags misspellings with suggestions without uploading. *Build:* Typo.js with Hunspell dictionaries from CDN, underline errors, click for suggestions.
264. **Keyword Density Analyzer** `[2D]` — shows most frequent words and phrases. *Build:* tokenize, remove stopwords, count n-grams, render sortable frequency table.
265. **Email Template Builder** `[2D]` — composes reusable emails with placeholder fields. *Build:* templates in localStorage, {{field}} substitution form, copy as rich text.
266. **Text Cleaner** `[2D]` — strips extra spaces, smart quotes, hidden characters. *Build:* regex pipeline with toggles, normalize Unicode NFC, reveal zero-width characters visually.
267. **Slug Generator** `[2D]` — turns titles into clean URL slugs. *Build:* Unicode normalize, strip diacritics, replace non-alphanumerics with hyphens, lowercase output.
268. **Writing Focus Mode** `[2D]` — distraction-free editor with session word goals. *Build:* full-screen contenteditable, Fullscreen API, autosave IndexedDB, progress bar toward goal.
269. **Word Cloud Maker** `[2D]` — visualizes text frequency as word cloud. *Build:* d3-cloud layout with frequency weights, custom palette, export PNG via canvas.
270. **3D Word Sphere** `[3D]` — displays keywords on rotating interactive sphere. *Build:* Three.js CSS3DRenderer placing words on Fibonacci sphere, OrbitControls, size by frequency.
271. **Translation Glossary Manager** `[2D]` — stores term pairs and checks consistency. *Build:* IndexedDB term table, scan text for source terms, flag mismatched translations.
272. **Citation Formatter** `[2D]` — formats references in APA, MLA, Chicago. *Build:* citation-js library from CDN, form inputs or BibTeX paste, copy formatted output.
273. **Headline Analyzer** `[2D]` — scores headlines for length and emotional words. *Build:* local word lists for power and emotion words, scoring rules, length meter.
274. **Text Encryptor** `[2D]` — encrypts private notes with a passphrase. *Build:* Web Crypto PBKDF2 key derivation, AES-GCM encrypt, output Base64 ciphertext for sharing.
275. **Outline Mind Mapper** `[2D]` — converts indented outlines into visual mind maps. *Build:* parse indentation tree, markmap library rendering SVG, export SVG or PNG.

## 12. PDF & Documents — *pdf-lib, pdf.js, qpdf-wasm, tesseract.js, mammoth.js, JSZip*
276. **PDF Merger** `[2D]` — combine PDFs in chosen order. *Build:* pdf-lib copyPages, drag-to-reorder thumbnails via pdf.js, download Blob.
277. **PDF Splitter** `[2D]` — splits PDF by ranges or every page. *Build:* pdf-lib copyPages into new documents per range, zip outputs with JSZip.
278. **PDF Page Organizer** `[2D]` — reorders, rotates, and deletes PDF pages visually. *Build:* pdf.js thumbnails, SortableJS grid, pdf-lib setRotation and removePage on save.
279. **PDF Compressor** `[2D]` — shrinks PDF size by recompressing images. *Build:* qpdf or Ghostscript compiled to WebAssembly, preset quality levels, compare sizes.
280. **PDF Watermarker** `[2D]` — stamps text or logo watermarks on pages. *Build:* pdf-lib drawText with opacity and rotation, embedPng for logos, all pages.
281. **PDF Signer** `[2D]` — draws or types signatures onto PDFs. *Build:* signature_pad canvas capture, pdf.js preview for placement, pdf-lib embedPng at position.
282. **PDF Form Filler** `[2D]` — fills interactive PDF form fields offline. *Build:* pdf-lib getForm enumerates fields, generate HTML inputs, setText and flatten option.
283. **PDF OCR Converter** `[2D]` — makes scanned PDFs searchable with text layer. *Build:* pdf.js render pages to canvas, tesseract.js recognize, pdf-lib invisible text overlay.
284. **PDF To Images** `[2D]` — exports PDF pages as PNG or JPG. *Build:* pdf.js render each page at chosen DPI, canvas toBlob, bundle with JSZip.
285. **Images To PDF** `[2D]` — combines photos into single PDF document. *Build:* pdf-lib embedJpg and embedPng, page size presets, margins, drag ordering.
286. **PDF Text Extractor** `[2D]` — pulls plain text from PDF pages. *Build:* pdf.js getTextContent per page, join items by position, download TXT file.
287. **PDF Redactor** `[2D]` — permanently blacks out sensitive PDF content. *Build:* pdf.js render pages, draw boxes, rasterize redacted pages, rebuild with pdf-lib.
288. **PDF Password Protector** `[2D]` — adds or removes PDF password encryption. *Build:* qpdf WebAssembly build with encrypt and decrypt flags, user-supplied password input.
289. **PDF Page Numberer** `[2D]` — adds page numbers and headers to PDFs. *Build:* pdf-lib drawText per page, position presets, start number, custom format string.
290. **Word To PDF** `[2D]` — converts DOCX documents into PDF files. *Build:* mammoth.js DOCX to HTML, styled preview, html2pdf.js render and download.
291. **PDF Compare Tool** `[2D]` — highlights differences between two PDF versions. *Build:* pdf.js extract text per page, diff-match-patch comparison, side-by-side highlighted view.
292. **PDF Metadata Editor** `[2D]` — views and edits title, author, keywords. *Build:* pdf-lib getTitle and setTitle style accessors, form editing, save modified Blob.
293. **PDF Table Extractor** `[2D]` — exports tables from PDFs into CSV. *Build:* pdf.js text items with coordinates, cluster rows and columns, Papa.unparse output.
294. **Document Scanner** `[2D]` — turns phone photos into clean scanned pages. *Build:* getUserMedia capture, OpenCV.js edge detection and perspective warp, adaptive threshold filter.
295. **PDF Annotator** `[2D]` — adds highlights, notes, and shapes to PDFs. *Build:* pdf.js viewer with Fabric.js overlay, export annotations flattened via pdf-lib.
296. **3D Booklet Viewer** `[3D]` — previews PDFs as a flippable 3D booklet. *Build:* pdf.js page textures, Three.js page meshes with bend animation, OrbitControls.
297. **Markdown To PDF** `[2D]` — converts Markdown files into styled PDFs. *Build:* marked.js to HTML, print stylesheet themes, window.print or html2pdf.js export.
298. **PDF Flattener** `[2D]` — flattens forms and annotations into static content. *Build:* pdf-lib form.flatten, optionally rasterize pages via pdf.js for full flattening.
299. **EPUB To PDF** `[2D]` — converts EPUB books into readable PDF. *Build:* epub.js parse chapters, render HTML with print styles, html2pdf.js produce PDF.
300. **PDF Bookmark Editor** `[2D]` — creates and edits PDF outline bookmarks. *Build:* pdf-lib low-level outline dictionary creation, tree editor UI, page targets.

## 13. Image Editing & Conversion — *Canvas API, Squoosh codecs, Fabric.js, OpenCV.js, transformers.js, Three.js*
301. **Image Compressor** `[2D]` — reduces image file size with quality preview. *Build:* Squoosh MozJPEG and WebP WebAssembly codecs, before-after slider, batch download zip.
302. **Image Format Converter** `[2D]` — converts between PNG, JPG, WebP, AVIF. *Build:* decode via createImageBitmap, encode with canvas toBlob or libavif WebAssembly.
303. **Batch Image Resizer** `[2D]` — resizes many images to exact dimensions. *Build:* pica library high-quality resampling, width height or percentage options, JSZip output.
304. **Background Remover** `[2D]` — removes photo backgrounds automatically in browser. *Build:* @imgly/background-removal or transformers.js RMBG model, output transparent PNG.
305. **Image Cropper** `[2D]` — crops images with aspect ratio presets. *Build:* Cropper.js with social media ratio presets, export cropped canvas as Blob.
306. **EXIF Data Remover** `[2D]` — views and strips photo location metadata. *Build:* exifr parse metadata display, redraw image on canvas to remove EXIF.
307. **Photo Adjustment Studio** `[2D]` — adjusts brightness, contrast, saturation, and sharpness. *Build:* WebGL shaders via glfx.js, slider controls, export full resolution canvas.
308. **Image Annotator** `[2D]` — adds arrows, boxes, text, and blur. *Build:* Fabric.js canvas objects, pixelate region via canvas filter, export PNG.
309. **Screenshot Beautifier** `[2D]` — frames screenshots with backgrounds and shadows. *Build:* canvas composition with gradient backgrounds, rounded corners, browser frame mockups, export.
310. **Favicon Generator** `[2D]` — creates favicon sets from one image. *Build:* canvas resize to standard sizes, encode ICO container in JS, zip with manifest.
311. **Color Palette Extractor** `[2D]` — pulls dominant colors from any image. *Build:* color-thief quantization on canvas pixels, show HEX swatches, export CSS variables.
312. **SVG Optimizer** `[2D]` — cleans and minifies SVG files losslessly. *Build:* SVGO browser bundle with plugin toggles, preview before and after, size savings.
313. **Image To SVG Tracer** `[2D]` — vectorizes raster logos into SVG paths. *Build:* imagetracerjs or potrace WebAssembly, color count settings, live preview and download.
314. **Batch Watermarker** `[2D]` — adds logo watermarks to many photos. *Build:* canvas drawImage overlay with position grid, opacity slider, batch export via JSZip.
315. **Image Upscaler** `[2D]` — enlarges images with AI super-resolution. *Build:* UpscalerJS with TensorFlow.js ESRGAN model, WebGL backend, tile processing for memory.
316. **Collage Maker** `[2D]` — arranges photos into grid layout templates. *Build:* CSS grid templates rendered to canvas, drag photos into cells, export PNG.
317. **Face Blur Redactor** `[2D]` — blurs faces automatically for privacy. *Build:* MediaPipe face detection in browser, apply canvas blur on detected regions, manual touch-ups.
318. **HEIC Converter** `[2D]` — converts iPhone HEIC photos to JPG. *Build:* heic2any library with libheif WebAssembly, batch conversion, preserve orientation, zip download.
319. **Image Color Picker** `[2D]` — picks exact colors from uploaded images. *Build:* canvas getImageData at cursor, magnifier loupe, show HEX RGB HSL values.
320. **3D Packaging Mockup** `[3D]` — wraps designs onto 3D boxes and mugs. *Build:* Three.js loaded GLTF models, apply uploaded image texture, render and export PNG.
321. **Sprite Sheet Packer** `[2D]` — combines icons into sprite sheet with CSS. *Build:* bin packing algorithm, draw images on canvas, generate CSS background-position rules.
322. **3D Model Viewer** `[3D]` — previews GLB, OBJ, STL files with screenshots. *Build:* Three.js loaders for GLTF OBJ STL, auto-centering, lighting presets, PNG capture.
323. **GIF Maker** `[2D]` — creates animated GIFs from image sequences. *Build:* gif.js web worker encoder, frame delay controls, reorder frames, preview loop.
324. **Passport Photo Maker** `[2D]` — crops photos to official ID photo sizes. *Build:* MediaPipe face landmarks for alignment, country size presets, printable multi-photo sheet layout.
325. **Panorama Viewer** `[3D]` — views 360 photos in interactive 3D sphere. *Build:* Three.js inverted sphere geometry with equirectangular texture, drag and gyroscope controls.

## 14. Audio & Video — *ffmpeg.wasm, Web Audio API, MediaRecorder, WaveSurfer.js, transformers.js*
326. **Video Trimmer** `[2D]` — cuts video clips to exact start and end. *Build:* ffmpeg.wasm with -ss and -to stream copy, timeline scrubber with video element.
327. **Video Converter** `[2D]` — converts videos between MP4, WebM, MOV. *Build:* ffmpeg.wasm transcode with codec presets, progress callback, download output Blob.
328. **Video Compressor** `[2D]` — shrinks video size for email sharing. *Build:* ffmpeg.wasm with CRF and scale options, target size estimator, progress bar.
329. **Audio Transcriber** `[2D]` — transcribes meetings and voice memos into text. *Build:* transformers.js Whisper model with WebGPU, chunked decoding, timestamps, export SRT or TXT.
330. **Screen Recorder** `[2D]` — records screen, tab, or window with audio. *Build:* getDisplayMedia plus getUserMedia mic mixing, MediaRecorder to WebM, download file.
331. **Webcam Recorder** `[2D]` — records webcam video messages locally. *Build:* getUserMedia stream, MediaRecorder with codec selection, preview playback, download or retake.
332. **Audio Trimmer** `[2D]` — cuts and fades audio files visually. *Build:* WaveSurfer.js regions plugin, Web Audio decode, apply fades, encode MP3 with lamejs.
333. **Voice Memo Recorder** `[2D]` — records microphone memos saved in browser. *Build:* MediaRecorder audio, store Blobs in IndexedDB, list with playback and rename.
334. **Subtitle Editor** `[2D]` — creates and syncs SRT and VTT subtitles. *Build:* video element with cue timeline, keyboard timestamping, parse and export SRT VTT.
335. **Video To GIF** `[2D]` — converts video segments into animated GIFs. *Build:* ffmpeg.wasm palettegen and paletteuse filters, fps and width options, preview output.
336. **Audio Converter** `[2D]` — converts between MP3, WAV, OGG, M4A. *Build:* ffmpeg.wasm audio transcoding with bitrate presets, batch queue, download each file.
337. **Noise Reducer** `[2D]` — removes background noise from voice recordings. *Build:* RNNoise compiled to WebAssembly in AudioWorklet, process offline buffer, export WAV.
338. **Loudness Normalizer** `[2D]` — evens out loudness across audio files. *Build:* ffmpeg.wasm loudnorm filter targeting LUFS, display before and after measurements.
339. **Video Frame Extractor** `[2D]` — grabs still images from video frames. *Build:* video element seek, draw to canvas at intervals, export PNG frames zipped.
340. **Teleprompter** `[2D]` — scrolls scripts smoothly for video recording. *Build:* requestAnimationFrame scrolling, speed and font controls, mirror mode via CSS transform.
341. **Caption Burner** `[2D]` — burns subtitles permanently into video files. *Build:* ffmpeg.wasm subtitles filter with bundled font, style options, export MP4.
342. **Video Merger** `[2D]` — joins multiple clips into one video. *Build:* ffmpeg.wasm concat demuxer, drag-to-reorder list, re-encode when formats differ.
343. **Audio Spectrum Analyzer** `[2D]` — shows live frequency spectrum and levels. *Build:* Web Audio AnalyserNode FFT data, canvas bar rendering, peak hold and dB scale.
344. **3D Audio Visualizer** `[3D]` — renders sound as animated 3D terrain. *Build:* Web Audio AnalyserNode feeding Three.js plane vertex heights, export recording via MediaRecorder.
345. **Podcast Chapter Maker** `[2D]` — adds chapter markers to MP3 podcasts. *Build:* WaveSurfer.js markers, browser-id3-writer writes CHAP frames, download tagged MP3.
346. **ID3 Tag Editor** `[2D]` — edits MP3 title, artist, and cover art. *Build:* jsmediatags read existing tags, browser-id3-writer write changes, download updated file.
347. **Video Speed Changer** `[2D]` — speeds up or slows down videos. *Build:* ffmpeg.wasm setpts and atempo filters, preset multipliers, preview with playbackRate.
348. **Meeting Notes Recorder** `[2D]` — records meetings with timestamped typed notes. *Build:* MediaRecorder audio plus textarea notes stamped with currentTime, export Markdown bundle.
349. **Video Watermarker** `[2D]` — overlays logo or text on videos. *Build:* ffmpeg.wasm overlay and drawtext filters, position presets, opacity control, export MP4.
350. **Spatial Audio Mixer** `[3D]` — positions audio tracks in 3D space. *Build:* Web Audio PannerNode HRTF, Three.js draggable source spheres, offline render binaural WAV.

## 15. Data, CSV & Spreadsheets — *Papa Parse, SheetJS, sql.js, DuckDB-WASM, Chart.js, Plotly.js, Three.js*
351. **CSV Viewer** `[2D]` — opens large CSV files in sortable grid. *Build:* Papa Parse streaming in worker, virtualized grid with Tabulator, column filters.
352. **CSV JSON Converter** `[2D]` — converts between CSV, JSON, and XML. *Build:* Papa Parse and unparse, nested key flattening, fast-xml-parser for XML output.
353. **Excel To CSV** `[2D]` — exports XLSX sheets into CSV files. *Build:* SheetJS read workbook, choose sheets, sheet_to_csv each, download or zip.
354. **SQL Query Playground** `[2D]` — runs SQL queries on uploaded CSV files. *Build:* DuckDB-WASM read_csv_auto on registered files, Monaco editor, results grid and export.
355. **Chart Builder** `[2D]` — creates bar, line, pie charts from data. *Build:* paste or upload CSV, Chart.js config UI, export PNG or SVG.
356. **3D Scatter Plotter** `[3D]` — plots three-variable data in rotating 3D space. *Build:* Plotly.js scatter3d trace from CSV columns, color by category, export image.
357. **3D Bar Chart Maker** `[3D]` — shows grouped data as 3D bar columns. *Build:* Three.js box meshes on grid from pivot table, OrbitControls, hover labels via raycaster.
358. **Pivot Table Tool** `[2D]` — summarizes data with drag-and-drop pivots. *Build:* PivotTable.js with Papa Parse input, aggregators and renderers, export result CSV.
359. **Data Cleaner** `[2D]` — fixes whitespace, casing, and duplicate rows. *Build:* Papa Parse load, per-column transform rules, duplicate detection by key, export cleaned CSV.
360. **CSV Joiner** `[2D]` — joins two CSV files on key column. *Build:* DuckDB-WASM SQL with selectable join types, preview matched and unmatched rows, export.
361. **JSON Formatter** `[2D]` — prettifies, validates, and explores JSON documents. *Build:* JSON.parse with error position reporting, collapsible tree view, minify and copy.
362. **Data Profiler** `[2D]` — summarizes columns with stats and missing values. *Build:* Papa Parse dynamic typing, compute min max mean distinct nulls, mini histograms.
363. **SQLite Browser** `[2D]` — opens and queries SQLite database files. *Build:* sql.js load file into memory, list tables, run queries, export modified database.
364. **Fake Data Generator** `[2D]` — generates realistic test data for spreadsheets. *Build:* Faker.js schema builder with field types, row count, export CSV JSON SQL.
365. **Formula Tester** `[2D]` — tests spreadsheet formulas on sample data. *Build:* HyperFormula engine evaluates formulas, editable sample grid, plain-language function reference lookup.
366. **Column Splitter** `[2D]` — splits or combines columns by delimiter. *Build:* Papa Parse rows, split by delimiter or regex, concat with templates, export.
367. **Data Heatmap** `[2D]` — visualizes matrix data as colored heatmap. *Build:* D3 scaleSequential color mapping, CSV matrix input, tooltips, export SVG.
368. **Coordinate Mapper** `[2D]` — plots coordinate columns as map markers. *Build:* Leaflet with OpenStreetMap tiles, lat lon column picking, marker clustering plugin.
369. **3D Surface Plotter** `[3D]` — renders functions or grid data as surfaces. *Build:* Plotly.js surface trace from matrix CSV or math.js expression evaluation.
370. **Spreadsheet Editor** `[2D]` — edits XLSX files directly in browser. *Build:* Jspreadsheet grid UI, SheetJS import and export, formulas evaluated via HyperFormula.
371. **Data Anonymizer** `[2D]` — masks personal data columns before sharing. *Build:* Papa Parse, per-column hashing via Web Crypto, fake replacement or masking, export.
372. **CSV Validator** `[2D]` — checks CSV against schema rules and types. *Build:* define schema per column, Papa Parse rows, report errors with row numbers.
373. **Dashboard Builder** `[2D]` — combines charts into printable data dashboards. *Build:* GridStack.js layout, Chart.js widgets bound to uploaded CSV, save config localStorage.
374. **Trend Forecaster** `[2D]` — fits trend lines and forecasts from data. *Build:* simple-statistics linear and polynomial regression, Chart.js scatter with fitted line overlay.
375. **3D Network Graph** `[3D]` — visualizes relationship data as 3D network. *Build:* 3d-force-graph library from edge list CSV, node coloring, search and focus.

## 16. Small Business & Sales — *IndexedDB/Dexie.js, jsPDF, Chart.js, JsBarcode, html5-qrcode, Three.js*
376. **Quote Generator** `[2D]` — creates professional sales quotes as PDF. *Build:* line item form, tax and discount math, jsPDF autoTable layout, logo upload.
377. **Mini CRM** `[2D]` — tracks contacts, deals, and follow-ups locally. *Build:* IndexedDB via Dexie.js, contact timeline, follow-up reminders, JSON export backup.
378. **Sales Pipeline Board** `[2D]` — visualizes deals by stage with values. *Build:* kanban columns with SortableJS drag and drop, weighted forecast totals, localStorage persistence.
379. **Break-Even Calculator** `[2D]` — finds units needed to cover costs. *Build:* fixed cost, price, variable cost inputs, compute break-even, Chart.js cost-revenue lines.
380. **Pricing Calculator** `[2D]` — sets prices from costs and target margin. *Build:* cost inputs, markup versus margin formulas, competitor comparison table, scenario saving.
381. **QR Code Generator** `[2D]` — creates styled QR codes for links, WiFi. *Build:* qr-code-styling library, logo embedding, color options, export PNG and SVG.
382. **Barcode Generator** `[2D]` — makes EAN, UPC, Code128 product barcodes. *Build:* JsBarcode render to SVG, batch generation from CSV, printable label sheet.
383. **Inventory Tracker** `[2D]` — tracks stock levels with low-stock alerts. *Build:* Dexie.js IndexedDB items table, reorder thresholds, barcode scanning via html5-qrcode.
384. **Barcode Scanner** `[2D]` — scans barcodes using phone camera into lists. *Build:* html5-qrcode or ZXing WebAssembly, camera stream decoding, append to CSV list.
385. **3D Store Planner** `[3D]` — plans retail shelf and fixture layouts. *Build:* Three.js floor grid, draggable shelf meshes with TransformControls, save layout JSON.
386. **3D Office Layout** `[3D]` — designs office floor plans with furniture. *Build:* Three.js room builder, furniture GLTF library, snapping to grid, walk-through camera mode.
387. **Business Card Designer** `[2D]` — designs printable business cards with templates. *Build:* Fabric.js canvas templates, bleed guides, QR code vCard, export print-ready PDF.
388. **Appointment Book** `[2D]` — manages bookings on local calendar view. *Build:* FullCalendar with IndexedDB storage, recurring slots, export ICS files for clients.
389. **Thermal Receipt Formatter** `[2D]` — formats receipts for thermal printers. *Build:* 58mm and 80mm print CSS, item entry form, window.print with page sizing.
390. **3D Product Configurator** `[3D]` — previews products in custom colors and materials. *Build:* Three.js GLTF model upload, material color pickers, shareable URL config, PNG snapshots.
391. **Customer Survey Kiosk** `[2D]` — collects offline surveys and tallies answers locally. *Build:* form builder stored as JSON, kiosk mode saving to IndexedDB, Chart.js results.
392. **Sales Commission Calculator** `[2D]` — computes tiered commissions for sales reps. *Build:* tier editor table, progressive tier math, per-rep breakdown, export CSV.
393. **Loyalty Card Maker** `[2D]` — designs printable stamp loyalty cards. *Build:* HTML template editor, stamp grid count options, print layout multiple per page.
394. **Product Catalog Builder** `[2D]` — generates printable product catalogs from spreadsheets. *Build:* SheetJS import product rows, image upload, template layouts, html2pdf.js export.
395. **Cash Flow Forecaster** `[2D]` — projects monthly cash balance ahead. *Build:* recurring income and expense entries, month-by-month projection, Chart.js balance line.
396. **Discount Calculator** `[2D]` — compares percentage, bundle, and BOGO offers. *Build:* scenario inputs for offers, effective price per unit, margin impact table.
397. **3D Box Packer** `[3D]` — visualizes how items fit inside boxes. *Build:* 3D bin packing algorithm in JS, Three.js render packed boxes, utilization percent.
398. **Price Tag Printer** `[2D]` — prints shelf price labels from lists. *Build:* CSV import, label template with barcode via JsBarcode, label sheet print CSS.
399. **Sales Goal Tracker** `[2D]` — tracks daily sales against monthly targets. *Build:* localStorage daily entries, pace calculation, progress gauges with Chart.js doughnut.
400. **Menu Board Maker** `[2D]` — designs restaurant menus for print or screen. *Build:* drag sections editor, typography themes, print PDF via html2pdf.js, TV fullscreen mode.

## 17. Marketing & Social Media — *Fabric.js, html2canvas, Canvas API, Chart.js, MJML, Three.js*
401. **Social Post Designer** `[2D]` — creates images sized for each platform. *Build:* Fabric.js canvas with platform size presets, templates, text styles, export PNG.
402. **UTM Link Builder** `[2D]` — builds tracked campaign URLs consistently. *Build:* form for source medium campaign, URLSearchParams, saved presets and history in localStorage.
403. **Hashtag Organizer** `[2D]` — saves and groups hashtag sets for posts. *Build:* localStorage collections, character counts, copy groups, shuffle order to avoid repetition.
404. **Post Preview Simulator** `[2D]` — previews how posts look in feeds. *Build:* generic feed card mockups in HTML CSS, character truncation rules, image cropping preview.
405. **Content Calendar** `[2D]` — plans posts across weeks and channels. *Build:* FullCalendar drag events, IndexedDB storage, channel color tags, export CSV or ICS.
406. **Character Limit Checker** `[2D]` — checks text against platform length limits. *Build:* grapheme counting with Intl.Segmenter, limit presets per platform, live warnings.
407. **Open Graph Previewer** `[2D]` — previews link cards from meta tags. *Build:* paste HTML head, DOMParser extracts og tags, render card mockups for platforms.
408. **Thumbnail Maker** `[2D]` — designs video thumbnails with bold text. *Build:* Fabric.js 1280x720 canvas, text stroke effects, background removal cutouts, export JPG.
409. **Email Signature Generator** `[2D]` — creates HTML email signatures with logos. *Build:* form inputs to table-based HTML template, inline styles, copy rich HTML to clipboard.
410. **A/B Test Calculator** `[2D]` — checks statistical significance of test results. *Build:* z-test for proportions in JS, confidence intervals, sample size planner, result chart.
411. **Marketing ROI Calculator** `[2D]` — computes ROI, CAC, and ROAS metrics. *Build:* campaign spend and revenue inputs, formula outputs, compare channels in table.
412. **Ad Copy Variants** `[2D]` — generates headline variations from templates. *Build:* spintax parser with combinatorial expansion, character limit filtering, export CSV list.
413. **Banner Ad Resizer** `[2D]` — adapts one design to standard ad sizes. *Build:* Fabric.js layout with anchor rules, render to IAB sizes, zip PNG exports.
414. **Brand Kit Builder** `[2D]` — documents logos, colors, and fonts. *Build:* upload assets to IndexedDB, palette with contrast checks, export one-page PDF guide.
415. **Color Contrast Checker** `[2D]` — tests text colors for WCAG accessibility. *Build:* relative luminance formula, AA and AAA pass indicators, suggest nearest passing color.
416. **Carousel Post Maker** `[2D]` — splits designs into swipeable carousel slides. *Build:* wide Fabric.js canvas sliced into square tiles, numbered export via JSZip.
417. **Testimonial Card Maker** `[2D]` — turns customer quotes into shareable graphics. *Build:* HTML templates with star ratings, html2canvas render, export PNG at retina scale.
418. **3D Logo Extruder** `[3D]` — turns flat SVG logos into 3D renders. *Build:* Three.js SVGLoader shapes with ExtrudeGeometry, materials and lighting, export PNG or GLB.
419. **Link Page Builder** `[2D]` — builds static link pages for profiles. *Build:* form editor generating single HTML file, theme options, download for free hosting.
420. **Campaign Budget Planner** `[2D]` — allocates marketing budget across channels. *Build:* slider allocation summing to total, projected leads by channel rates, Chart.js pie.
421. **Social Analytics Viewer** `[2D]` — charts exported social media statistics files. *Build:* Papa Parse platform CSV exports, Chart.js engagement trends, best posting time heatmap.
422. **3D Booth Designer** `[3D]` — mocks up trade show booth graphics. *Build:* Three.js booth model with banner planes, upload artwork textures, orbit and screenshot.
423. **3D Device Framer** `[3D]` — places screenshots inside 3D device mockups. *Build:* Three.js generic phone and laptop GLTF, screen texture, adjustable angle, PNG export.
424. **Newsletter Builder** `[2D]` — designs responsive HTML email newsletters. *Build:* block-based editor generating MJML, compile with MJML browser build, copy or download HTML.
425. **Persona Builder** `[2D]` — creates customer persona one-page profiles. *Build:* structured form with avatar upload, template layout, save localStorage, export PDF.

## 18. HR, Recruiting & Careers — *jsPDF, docx.js, pdf.js, Dexie.js, d3-org-chart, 3d-force-graph*
426. **Resume Builder** `[2D]` — builds ATS-friendly resumes from structured templates. *Build:* JSON resume form, live HTML templates, print-optimized CSS, export PDF via jsPDF.
427. **Cover Letter Writer** `[2D]` — drafts cover letters from fill-in templates. *Build:* template library with placeholders, job-specific fields, export DOCX via docx.js.
428. **Resume Keyword Matcher** `[2D]` — compares resume keywords against job descriptions. *Build:* pdf.js extract resume text, tokenize both texts, show missing keywords ranked.
429. **Interview Scorecard** `[2D]` — scores candidates consistently against defined criteria. *Build:* criteria builder with weights, per-interviewer ratings, aggregate scores, export PDF.
430. **Job Description Builder** `[2D]` — writes structured job postings from sections. *Build:* section templates for duties and requirements, inclusive language checker, copy Markdown.
431. **Applicant Tracker** `[2D]` — tracks candidates through hiring stages locally. *Build:* Dexie.js IndexedDB, kanban stages, attach resume files as Blobs, export JSON.
432. **Org Chart Maker** `[2D]` — builds organization charts from spreadsheet data. *Build:* d3-org-chart from CSV with manager column, collapsible nodes, export SVG PNG.
433. **3D Org Explorer** `[3D]` — explores large organizations as 3D hierarchy. *Build:* 3d-force-graph with DAG mode top-down, department colors, click to focus person.
434. **Job Offer Comparator** `[2D]` — compares offers including benefits and costs. *Build:* offer inputs for salary, bonus, benefits, commute, compute total compensation table.
435. **PTO Tracker** `[2D]` — tracks vacation balances, accruals, and requests. *Build:* accrual rule settings, calendar view of requests, balances in localStorage, CSV export.
436. **Shift Scheduler** `[2D]` — creates weekly employee shift rotations. *Build:* drag-and-drop grid by employee and day, hour totals, print and ICS export.
437. **Onboarding Checklist** `[2D]` — generates role-specific new hire checklists. *Build:* template tasks by role, due dates from start date, progress saved localStorage, print.
438. **Meeting Cost Calculator** `[2D]` — shows real-time cost of meetings. *Build:* attendee count and average salary inputs, live ticking timer, cost per minute display.
439. **Performance Review Builder** `[2D]` — structures self and manager review forms. *Build:* competency rating templates, comment fields, goal tracking, export DOCX via docx.js.
440. **Salary Band Visualizer** `[2D]` — plots pay ranges by level against employee salaries. *Build:* SheetJS import, d3 range bars with compa-ratio markers, outlier highlighting, PNG export.
441. **Timesheet Calculator** `[2D]` — totals worked hours, breaks, and overtime. *Build:* weekly time entry grid, overtime rules, decimal hour conversion, export CSV PDF.
442. **Skills Matrix** `[2D]` — maps team skills and identifies gaps. *Build:* editable grid of people versus skills, color-scaled ratings, gap summary chart.
443. **Reference Check Form** `[2D]` — standardizes reference call questions and notes. *Build:* question templates, structured note fields, rating scales, export PDF summary per candidate.
444. **Career Path Planner** `[2D]` — maps career goals with milestones visually. *Build:* timeline editor with vis-timeline, milestones and skills, save JSON, export image.
445. **Interview Question Bank** `[2D]` — organizes interview questions by role and competency. *Build:* IndexedDB question library, tags and filters, assemble interview kit, print.
446. **Employee Directory** `[2D]` — creates searchable staff directory from spreadsheets. *Build:* SheetJS import, photo uploads, Fuse.js fuzzy search, export static HTML file.
447. **Mock Interview Recorder** `[2D]` — practices answers with webcam recording and timer. *Build:* getUserMedia and MediaRecorder, random question prompts, timer, review playback locally.
448. **Headcount Planner** `[2D]` — models hiring plans and payroll budget. *Build:* role rows with start months and salaries, monthly cost projection, Chart.js area.
449. **Certificate Generator** `[2D]` — creates personalized training completion certificates in bulk. *Build:* template design with placeholder fields, CSV name list, pdf-lib generate merged PDF.
450. **3D Seating Planner** `[3D]` — assigns desks to employees in 3D. *Build:* Three.js floor plan with desk meshes, drag employee labels onto desks, export list.

## 19. Legal & Admin Paperwork — *docx.js, docxtemplater, pdf-lib, jsPDF, Handlebars, signature_pad*
451. **NDA Template Generator** `[2D]` — fills mutual or one-way NDA templates. *Build:* Handlebars templates with party fields, clause toggles, export DOCX via docx.js.
452. **Contract Clause Library** `[2D]` — stores reusable contract clauses for assembly. *Build:* IndexedDB clause store with tags, drag clauses into document, export DOCX.
453. **Freelance Agreement Builder** `[2D]` — creates service agreement drafts from inputs. *Build:* guided form wizard, conditional clause inclusion, Handlebars render, PDF via pdf-lib.
454. **Document Assembly Tool** `[2D]` — merges spreadsheet data into document templates. *Build:* docxtemplater fills DOCX placeholders from SheetJS rows, batch zip outputs.
455. **Privacy Policy Generator** `[2D]` — drafts website privacy policy from questionnaire. *Build:* checkbox questionnaire, conditional sections assembled, Markdown and HTML output, copy buttons.
456. **Terms Of Service Generator** `[2D]` — drafts basic website terms from answers. *Build:* questionnaire-driven template sections, jurisdiction placeholder fields, export HTML Markdown DOCX.
457. **Cookie Banner Generator** `[2D]` — creates consent banner code for websites. *Build:* style and category options, generate vanilla JS and CSS snippet, live preview.
458. **Power Of Attorney Template** `[2D]` — fills general power of attorney draft templates. *Build:* form fields into template text, signature and witness blocks, print layout.
459. **Rental Agreement Template** `[2D]` — drafts residential lease agreements from inputs. *Build:* guided form for parties, rent, terms, Handlebars template, export DOCX.
460. **Letter Of Intent Builder** `[2D]` — creates letters of intent for deals. *Build:* template with term fields, non-binding clause toggles, jsPDF letterhead export.
461. **Meeting Minutes Template** `[2D]` — records formal board or committee minutes. *Build:* structured agenda items, motions and votes fields, attendee list, export DOCX.
462. **Signature Pad** `[2D]` — creates transparent signature images for documents. *Build:* signature_pad smooth strokes, pen color and width, trim whitespace, export PNG SVG.
463. **Document Checklist Maker** `[2D]` — builds paperwork checklists for applications and filings. *Build:* template library, custom items, checkbox progress in localStorage, printable version.
464. **Demand Letter Template** `[2D]` — drafts payment demand letters to debtors. *Build:* form fields for amounts and deadlines, tone variants, export PDF letter.
465. **Consent Form Builder** `[2D]` — creates photo, data, and participation consent forms. *Build:* form section builder, signature lines, fillable PDF fields via pdf-lib.
466. **Deadline Calculator** `[2D]` — computes due dates excluding weekends and holidays. *Build:* date-fns business day arithmetic, custom holiday lists, export ICS reminders.
467. **Contract Redline Viewer** `[2D]` — compares two contract versions showing changes. *Build:* mammoth.js extract DOCX text, diff-match-patch word diff, printable redline view.
468. **Notary Journal** `[2D]` — keeps notarization journal entries organized locally. *Build:* IndexedDB entries with ID fields, search, encrypted export with Web Crypto.
469. **Cease And Desist Template** `[2D]` — drafts cease and desist letters from inputs. *Build:* template variants by issue type, form fields, export DOCX and PDF.
470. **Bylaws Template Builder** `[2D]` — drafts organization bylaws from section options. *Build:* section toggles with numbered articles, auto renumbering, table of contents, DOCX export.
471. **Envelope Label Printer** `[2D]` — prints addressed envelopes and mailing labels. *Build:* address list import via Papa Parse, envelope size CSS, label sheet grids.
472. **Affidavit Template** `[2D]` — fills general affidavit statement drafts with formatting. *Build:* numbered statement editor, jurat block placeholders, print-ready layout, jsPDF export.
473. **3D Incident Sketcher** `[3D]` — diagrams accident scenes for insurance claim forms. *Build:* Three.js ground plane, place vehicle and object primitives, measure distances, export PNG.
474. **Document Expiry Tracker** `[2D]` — tracks contract and license renewal dates. *Build:* IndexedDB records with expiry dates, countdown list, ICS reminder export, notifications.
475. **Bill Of Sale Generator** `[2D]` — creates bills of sale for vehicles, equipment. *Build:* item type templates, buyer seller fields, signature pad embedding, PDF export.

## 20. Accounting, Invoicing & Tax — *jsPDF, Dexie.js, SheetJS, sql.js, tesseract.js, Chart.js, Three.js*
476. **Petty Cash Reconciler** `[2D]` — balances petty cash box against vouchers and counts. *Build:* denomination count grid, voucher list, variance calculation, Dexie.js storage, printable report.
477. **Payment Terms Calculator** `[2D]` — compares early payment discounts against financing cost. *Build:* terms parser for 2/10 net 30 style, effective annual rate math, comparison table.
478. **Receipt OCR Scanner** `[2D]` — extracts totals and dates from receipts. *Build:* tesseract.js recognize photo, regex parse amounts and dates, editable confirmation form.
479. **Mileage Log** `[2D]` — records business trips for deduction claims. *Build:* trip entries with odometer or distance, rate setting, yearly summary PDF export.
480. **Sales Tax Calculator** `[2D]` — adds or removes tax from prices. *Build:* user-editable rate presets, inclusive and exclusive math, batch list mode.
481. **VAT Invoice Checker** `[2D]` — validates invoice math and required fields. *Build:* parse entered line items, recompute totals and VAT, flag missing mandatory fields.
482. **Bank Statement Analyzer** `[2D]` — categorizes transactions from bank CSV exports. *Build:* Papa Parse import, keyword rule categorization, monthly summaries with Chart.js.
483. **Loan Amortization Calculator** `[2D]` — builds full loan repayment schedules. *Build:* amortization formula loop, extra payment options, schedule table, export XLSX via SheetJS.
484. **Depreciation Calculator** `[2D]` — computes straight-line and declining balance depreciation. *Build:* asset cost, life, salvage inputs, method selector, yearly schedule table export.
485. **Profit And Loss Builder** `[2D]` — creates simple income statements from transactions. *Build:* categorized transaction import, account mapping, period totals, printable statement PDF.
486. **Balance Sheet Generator** `[2D]` — prepares balance sheets from account balances. *Build:* asset liability equity form, automatic balancing check, formatted PDF via jsPDF.
487. **Quarterly Tax Estimator** `[2D]` — estimates self-employment quarterly tax payments. *Build:* user-editable brackets and rates JSON, income inputs, quarterly due amounts table.
488. **Recurring Invoice Manager** `[2D]` — schedules repeated invoices for retainer clients. *Build:* IndexedDB client templates, due date calendar, generate PDF batch when due.
489. **Receivables Aging Report** `[2D]` — groups unpaid invoices into 30/60/90-day buckets. *Build:* SheetJS invoice import, due date bucketing, Chart.js stacked bars, per-client totals export.
490. **Payment Reminder Writer** `[2D]` — drafts polite overdue payment reminder emails. *Build:* escalation templates by days overdue, invoice fields substitution, copy or mailto link.
491. **Bookkeeping Ledger** `[2D]` — keeps double-entry journal with trial balance. *Build:* sql.js database persisted to IndexedDB, journal entry validation, trial balance reports.
492. **Budget Variance Report** `[2D]` — compares budgeted versus actual spending by category. *Build:* SheetJS import both sheets, variance calculations, conditional colors, Chart.js bars.
493. **Payroll Calculator** `[2D]` — estimates net pay after deductions. *Build:* configurable deduction rules, gross to net breakdown, payslip PDF generation with jsPDF.
494. **Financial Ratio Analyzer** `[2D]` — computes liquidity, profitability, and leverage ratios. *Build:* financial statement inputs, ratio formulas with explanations, trend charts across periods.
495. **3D Expense Treemap** `[3D]` — explores spending categories as 3D treemap. *Build:* Three.js extruded blocks from d3-hierarchy treemap layout, height by amount, hover.
496. **3D Cash Flow Landscape** `[3D]` — shows monthly cash flows as 3D terrain. *Build:* Plotly.js surface across months and categories from CSV, rotate and export.
497. **3D Revenue Globe** `[3D]` — maps sales by country on 3D globe. *Build:* globe.gl library with country polygons, extrusion height by revenue from CSV.
498. **3D Budget Comparison** `[3D]` — compares departmental budgets across years in 3D. *Build:* Three.js grouped bar meshes per department and year, OrbitControls, raycast tooltips.
499. **Invoice Data Extractor** `[2D]` — pulls invoice fields from PDF invoices. *Build:* pdf.js text extraction, configurable regex templates per vendor, export rows to CSV.
500. **Tax Document Organizer** `[2D]` — collects and labels tax-year documents securely offline. *Build:* IndexedDB file storage with categories, checklist status, encrypted ZIP export via zip.js.

## 21. Web Developers — *DOM APIs, CodeMirror, Three.js, WebAssembly codecs*
501. **CSS Grid Builder** `[2D]` — design grid layouts visually and export CSS. *Build:* draggable cell areas, grid-template-areas generator, live preview iframe, copy-to-clipboard output.
502. **Flexbox Playground** `[2D]` — experiment with flex properties on sample items. *Build:* form controls bound to CSS variables, live container preview, generated CSS snippet export.
503. **Regex Tester** `[2D]` — test regular expressions with live match highlighting. *Build:* JavaScript RegExp engine, CodeMirror overlay marks, capture group table, flag toggles, shareable URL.
504. **User Agent Parser** `[2D]` — breaks user agent strings into browser, OS, device. *Build:* ua-parser-js from CDN, batch paste mode, client hints display, CSV export of results.
505. **JWT Decoder** `[2D]` — inspect token headers, claims, and expiry times. *Build:* base64url segment decoding, claim table, human-readable exp/iat dates, optional WebCrypto HMAC verification.
506. **Redirect Rules Generator** `[2D]` — converts URL mapping lists into server redirect configs. *Build:* CSV paste of old and new paths, Nginx/Apache/Netlify templates, duplicate and loop detection.
507. **Web Manifest Generator** `[2D]` — builds PWA manifest.json with icons and theme colors. *Build:* form fields, color pickers, icon list editor, live JSON preview, download button.
508. **Robots.txt Tester** `[2D]` — validates robots.txt rules against sample URL paths. *Build:* robots-parser library, user-agent selection, allow/disallow matching, highlighted winning rule.
509. **Cubic Bezier Editor** `[2D]` — design custom easing curves for CSS animations. *Build:* draggable SVG control points, cubic-bezier() output, animated preview ball, preset library.
510. **Box Shadow Designer** `[2D]` — layer multiple box shadows with live preview. *Build:* shadow layer list, sliders for offset blur spread, RGBA picker, generated CSS output.
511. **Meta Tag Previewer** `[2D]` — preview social cards and search result snippets. *Build:* form inputs for Open Graph fields, mock card templates, generated meta tag HTML.
512. **HTML Entity Converter** `[2D]` — encode and decode HTML entities and Unicode. *Build:* entity lookup table, DOMParser decoding, numeric/named toggle, code point inspector panel.
513. **CSS Specificity Calculator** `[2D]` — compare selector specificity scores side by side. *Build:* css-what selector parsing, a-b-c specificity tuple computation, sorted comparison table.
514. **Responsive Viewport Tester** `[2D]` — preview local pages across multiple device widths. *Build:* scaled iframes at preset widths, custom sizes, orientation toggle, synchronized scrolling.
515. **URL Parser** `[2D]` — break URLs into components and query parameters. *Build:* native URL and URLSearchParams APIs, editable parameter table, encode/decode, rebuilt URL output.
516. **Audit Report Viewer** `[2D]` — visualize exported web performance audit JSON reports. *Build:* parse report JSON, score gauges, metric cards, opportunities sorted by estimated savings.
517. **CSS 3D Transform Lab** `[3D]` — experiment with perspective and 3D CSS transforms. *Build:* Three.js reference scene mirroring matrix3d, rotate/translate sliders, generated transform CSS.
518. **Font Inspector** `[2D]` — examine font file glyphs, metrics, and features. *Build:* opentype.js parsing, glyph grid rendering, metrics overlay, OpenType feature list, waterfall preview.
519. **Gradient Generator** `[2D]` — build linear, radial, and conic CSS gradients. *Build:* draggable color stops on bar, angle dial, live preview, copyable CSS output.
520. **Srcset Generator** `[2D]` — creates responsive image variants and matching srcset markup. *Build:* Canvas resizing to breakpoint widths, sizes attribute builder, JSZip download, copyable HTML snippet.
521. **GLTF Model Inspector** `[3D]` — preview web 3D models and check file stats. *Build:* Three.js GLTFLoader, Draco decoder, triangle and texture counts, animation clip player.
522. **Sitemap Generator** `[2D]` — build XML sitemaps from pasted URL lists. *Build:* textarea URL parsing, priority and changefreq fields, XML serialization, validation, file download.
523. **Clip Path Maker** `[2D]` — draw polygon clip paths over images visually. *Build:* draggable SVG vertices over image, percentage coordinate conversion, clip-path polygon CSS output.
524. **Mixed Content Scanner** `[2D]` — finds insecure http resources inside pasted HTML pages. *Build:* DOMParser walk of src/href attributes, CSS url scanning, https rewrite suggestions, results table.
525. **Shader Sandbox** `[3D]` — write and preview GLSL fragment shaders live. *Build:* Three.js ShaderMaterial on plane or sphere, CodeMirror GLSL mode, uniform sliders, error console.

## 22. Software, DevOps & Sysadmin — *js-yaml, jsdiff, sql.js, Pyodide, 3d-force-graph*
526. **Cron Expression Builder** `[2D]` — build cron schedules and preview upcoming runs. *Build:* cron-parser library, field dropdowns, cronstrue human-readable description, next ten timestamps.
527. **YAML Validator** `[2D]` — lint YAML and convert to JSON both ways. *Build:* js-yaml parsing with error markers, CodeMirror editor, JSON conversion pane, indentation fixer.
528. **Text Diff Viewer** `[2D]` — compare two text files side by side. *Build:* jsdiff library, line and word granularity, unified and split views, patch export.
529. **CIDR Subnet Calculator** `[2D]` — compute network ranges, masks, and host counts. *Build:* BigInt bit operations for IPv4/IPv6, subnet splitting table, binary mask visualization.
530. **Epoch Time Converter** `[2D]` — convert Unix timestamps across formats and time zones. *Build:* Intl.DateTimeFormat, seconds/milliseconds autodetection, multiple zone comparison rows, relative time display.
531. **Chmod Calculator** `[2D]` — translate Unix permissions between symbolic and octal. *Build:* checkbox grid for user/group/other, octal input sync, setuid/sticky bits, command output.
532. **Container File Linter** `[2D]` — flag common container build file mistakes. *Build:* line tokenizer, rules for layer caching, pinned base tags, root user, package cache cleanup.
533. **Log File Analyzer** `[2D]` — parse large logs and chart error frequency. *Build:* streaming File API reader, regex field extraction, Web Worker filtering, Chart.js timeline histogram.
534. **Cluster Manifest Graph** `[2D]` — graph relationships between container orchestration YAML resources. *Build:* js-yaml multi-document parsing, label selector matching, Cytoscape.js graph of objects.
535. **VCS Command Builder** `[2D]` — compose version control commands from plain intents. *Build:* decision tree of common tasks, flag explanations, copyable command output, offline JSON data.
536. **SQL Query Sandbox** `[2D]` — run SQL queries against uploaded CSV data. *Build:* sql.js WebAssembly SQLite, PapaParse CSV import, result grid, query history in IndexedDB.
537. **Network Topology Viewer** `[3D]` — visualize server and network layouts in 3D. *Build:* 3d-force-graph on Three.js, JSON/CSV node import, latency-colored edges, node search.
538. **Env File Comparer** `[2D]` — compare environment variable files for missing keys. *Build:* dotenv-style parser, key set differences, masked values, merged output download.
539. **Base64 Converter** `[2D]` — encode and decode Base64 text and files. *Build:* TextEncoder, FileReader for binary input, URL-safe variant toggle, data URI image preview.
540. **HTTP Status Reference** `[2D]` — look up status codes with meanings and fixes. *Build:* searchable static JSON dataset, Fuse.js fuzzy search, category filters, RFC section links.
541. **Reverse Proxy Config Builder** `[2D]` — generate web server proxy configs from form choices. *Build:* templated config strings, TLS, compression, caching options, syntax highlighting, file download.
542. **Systemd Unit Builder** `[2D]` — create service unit files with validated options. *Build:* form fields for directives, restart policy helpers, timer unit generation, highlighted preview.
543. **Capacity Planner** `[2D]` — estimate service capacity using queueing theory formulas. *Build:* Little's law and M/M/c calculations, Chart.js throughput curves, scenario comparison table.
544. **Uptime SLA Calculator** `[2D]` — convert availability percentages into allowed downtime. *Build:* nines table, composite SLA for serial/parallel dependencies, period breakdown, error budget burn.
545. **Server Rack Planner** `[3D]` — lay out server racks and power in 3D. *Build:* Three.js rack units as boxes, drag-to-slot placement, power and weight totals, JSON export.
546. **Python Script Runner** `[2D]` — run Python snippets offline in the browser. *Build:* Pyodide WebAssembly runtime, CodeMirror editor, micropip packages, stdout capture, virtual file mount.
547. **Semver Range Tester** `[2D]` — check which versions satisfy dependency ranges. *Build:* semver library from CDN, version list input, match highlighting, range explanation text.
548. **Disk Usage Explorer** `[3D]` — visualize folder sizes as 3D treemap blocks. *Build:* File System Access API directory walk, squarified treemap, Three.js boxes extruded by size.
549. **Diagram as Code Editor** `[2D]` — render flowcharts and sequence diagrams from text. *Build:* Mermaid.js renderer, live CodeMirror editing, SVG/PNG export, localStorage document autosave.
550. **Commit Message Linter** `[2D]` — validate commit messages against conventional format. *Build:* regex rules for type, scope, subject length, body wrapping, inline fix suggestions.

## 23. Data Science & Machine Learning — *Pyodide, TensorFlow.js, Plotly.js, DuckDB-WASM, Three.js*
551. **CSV Profiler** `[2D]` — summarize column types, missing values, and distributions. *Build:* PapaParse streaming, type inference, per-column Plotly histograms, missing value heatmap.
552. **Confusion Matrix Calculator** `[2D]` — compute classification metrics from prediction counts. *Build:* editable matrix grid, per-class precision recall F1, macro/micro averages, heatmap.
553. **ROC Curve Plotter** `[2D]` — plot ROC and precision-recall curves from scores. *Build:* score sorting, threshold sweep, trapezoidal AUC, Plotly interactive curves, threshold slider.
554. **3D Scatter Explorer** `[3D]` — explore three-dimensional datasets with color mapping. *Build:* Three.js points from CSV columns, axis selectors, color by category, lasso selection export.
555. **PCA Visualizer** `[3D]` — project datasets onto principal components interactively. *Build:* ml-pca library, explained variance bar chart, Three.js component scatter, loadings table.
556. **Embedding Projector** `[3D]` — compute and explore UMAP embeddings of datasets. *Build:* umap-js in Web Worker, 2D/3D toggle with Three.js points, hover labels.
557. **Neural Net Playground** `[2D]` — train small neural networks on toy datasets. *Build:* TensorFlow.js layers model, decision boundary canvas, live loss chart, configurable layers.
558. **Pivot Table Builder** `[2D]` — summarize tabular data with drag-and-drop pivots. *Build:* Arquero group-by aggregations, drag fields to rows/columns, aggregation choices, CSV export.
559. **Outlier Detector** `[2D]` — flags anomalous rows using IQR and z-score methods. *Build:* PapaParse CSV loading, per-column statistics, Plotly box plots, flagged rows CSV export.
560. **Notebook File Viewer** `[2D]` — render ipynb notebooks with outputs offline. *Build:* ipynb JSON parsing, marked for markdown cells, Prism highlighting, embedded image outputs.
561. **Image Classifier Trainer** `[2D]` — train custom image classifiers using your webcam. *Build:* TensorFlow.js MobileNet transfer learning, KNN classifier, getUserMedia capture, model download.
562. **Linear Regression Lab** `[2D]` — fit regression models and inspect residuals. *Build:* Pyodide statsmodels, coefficient table, residual plots, R-squared, prediction intervals.
563. **K-Means Cluster Explorer** `[3D]` — cluster data and visualize centroids in 3D. *Build:* ml-kmeans library, elbow chart, Three.js colored point cloud, centroid markers, cluster export.
564. **Loss Surface Visualizer** `[3D]` — view optimizer paths on 3D loss landscapes. *Build:* Three.js parametric mesh of test functions, animated SGD/Adam/momentum trajectories, learning-rate sliders.
565. **Columnar File Reader** `[2D]` — open Parquet files and query columns locally. *Build:* DuckDB-WASM, drag-and-drop file loading, schema view, SQL query pane, CSV export.
566. **Train Test Splitter** `[2D]` — split datasets with stratification and seeded shuffling. *Build:* seeded PRNG shuffle, stratified sampling by label column, proportion summary, CSV downloads.
567. **Feature Correlation Matrix** `[2D]` — compute and visualize pairwise feature correlations. *Build:* Pearson and Spearman computation, clustered Plotly heatmap, sortable top-pairs table.
568. **Decision Tree Visualizer** `[2D]` — train and inspect decision trees on CSVs. *Build:* ml-cart library, D3 tree layout, split thresholds, Gini values, feature importance bars.
569. **Time Series Decomposer** `[2D]` — split series into trend, seasonal, and residual. *Build:* Pyodide statsmodels STL decomposition, Plotly stacked subplots, autocorrelation period detection.
570. **Tokenizer Inspector** `[2D]` — see how text splits into model tokens. *Build:* gpt-tokenizer library, colored token spans, token counts, token ID list, encoding selector.
571. **Semantic Search Tester** `[2D]` — search documents semantically using local embeddings. *Build:* Transformers.js MiniLM model, cosine similarity, IndexedDB vector cache, ranked results list.
572. **Point Cloud Viewer** `[3D]` — load and inspect large XYZ or PLY point clouds. *Build:* Three.js PLYLoader and Points, octree decimation, color by height, measurement picking.
573. **Image Annotation Tool** `[2D]` — label images with bounding boxes and classes. *Build:* Canvas drawing layer, keyboard shortcuts, COCO/YOLO JSON export, IndexedDB project storage.
574. **Hyperparameter Grid Planner** `[2D]` — plan search spaces and estimate total training runs. *Build:* parameter range inputs, grid/random/log sampling, run count estimate, CSV config export.
575. **Model Card Generator** `[2D]` — create documented model cards from structured fields. *Build:* form schema for metrics, intended use, limitations, Markdown and HTML export.

## 24. Mechanical & Electrical Engineering — *Three.js, math.js, Chart.js, Web Audio API*
576. **Beam Deflection Calculator** `[3D]` — compute shear, moment, and deflection for beams. *Build:* superposition formulas, Chart.js diagrams, Three.js deformed beam with exaggeration slider.
577. **Space Truss Analyzer** `[3D]` — solve 3D truss member forces under loads. *Build:* direct stiffness method with math.js matrices, Three.js members colored by tension/compression.
578. **Resistor Color Decoder** `[2D]` — decode and encode resistor color bands. *Build:* SVG resistor with clickable bands, nearest E-series value, tolerance and tempco display.
579. **Ohm's Law Calculator** `[2D]` — solve voltage, current, resistance, and power. *Build:* two-of-four input solver, math.js unit prefix parsing, power wheel diagram.
580. **Gear Train Designer** `[3D]` — design gear trains and preview meshing gears. *Build:* involute tooth profile generation, animated Three.js extruded gears, ratio and speed table.
581. **Circuit Simulator** `[2D]` — simulate DC and transient analog circuits schematically. *Build:* modified nodal analysis solver, canvas schematic editor, time-step integration, probe plots.
582. **Filter Designer** `[2D]` — design RC, LC, and active filter components. *Build:* Butterworth/Chebyshev pole calculations, E-series rounding, Chart.js Bode plot, schematic.
583. **Bolt Torque Calculator** `[2D]` — compute preload and tightening torque for fasteners. *Build:* thread data tables, nut factor input, proof load percent, metric and imperial units.
584. **Spring Design Calculator** `[3D]` — size compression springs and check stresses. *Build:* Wahl factor stress equations, Three.js helix tube geometry, rate and solid height outputs.
585. **Tolerance Stack-Up Tool** `[2D]` — analyze worst-case and statistical tolerance stacks. *Build:* dimension chain table, worst-case and RSS sums, Monte Carlo histogram via Chart.js.
586. **PCB Trace Width Calculator** `[2D]` — size traces for current and temperature rise. *Build:* IPC-2221 formulas, internal/external layers, copper weight options, resistance and voltage drop.
587. **Shaft Stress Analyzer** `[3D]` — check shafts for combined bending and torsion. *Build:* von Mises and fatigue equations, Three.js shaft with stress-colored vertex shading.
588. **Bode Plot Generator** `[2D]` — plot magnitude and phase of transfer functions. *Build:* polynomial parsing, complex evaluation over log frequency, margin detection, Plotly dual axes.
589. **Section Properties Calculator** `[3D]` — compute area moments for custom cross sections. *Build:* polygon section input, Green's theorem integrals, extruded Three.js profile, centroid marker.
590. **Battery Pack Planner** `[3D]` — configure series-parallel cells and estimate runtime. *Build:* cell database JSON, voltage and capacity math, Three.js cell array layout, weight totals.
591. **Op-Amp Circuit Calculator** `[2D]` — compute gains for common op-amp configurations. *Build:* topology selector with SVG schematics, gain formulas, standard resistor suggestions, bandwidth estimate.
592. **Thermal Resistance Network** `[2D]` — estimate junction temperatures through heat paths. *Build:* series/parallel thermal resistance solver, heatsink selection, SVG temperature node diagram.
593. **Cam Profile Designer** `[3D]` — generate cam profiles from follower motion laws. *Build:* cycloidal and harmonic motion equations, displacement charts, animated Three.js cam-follower assembly.
594. **Signal Spectrum Analyzer** `[2D]` — view live audio signal FFT and waveforms. *Build:* Web Audio AnalyserNode, getUserMedia microphone, canvas spectrogram, peak frequency readout.
595. **Four-Bar Linkage Simulator** `[2D]` — animate linkages and check Grashof conditions. *Build:* loop closure equations, canvas animation, coupler curve tracing, transmission angle plot.
596. **Engineering Unit Converter** `[2D]` — convert engineering units with dimensional checking. *Build:* math.js unit system, compound unit parsing, significant figures control, localStorage favorites.
597. **LED Resistor Calculator** `[2D]` — pick series resistors for LED arrays. *Build:* forward voltage presets, series/parallel string math, E12 rounding, power rating warning.
598. **Pressure Vessel Calculator** `[3D]` — check wall thickness for cylindrical pressure vessels. *Build:* thin/thick wall Lamé equations, Three.js cutaway cylinder, hoop stress color mapping.
599. **Motor Sizing Tool** `[2D]` — size motors from load inertia and speed. *Build:* torque, inertia ratio, acceleration profile calculations, Chart.js speed-torque chart.
600. **Karnaugh Map Solver** `[2D]` — simplify boolean expressions using Karnaugh maps. *Build:* truth table input, Quine-McCluskey minimization, interactive K-map grid, SOP output.

## 25. Architecture & Construction — *Three.js, Konva.js, Leaflet, Turf.js, web-ifc, jsPDF*
601. **3D Floor Plan Designer** `[3D]` — draw floor plans and walk through them. *Build:* Konva 2D wall drawing, Three.js extruded walls, first-person controls, room area totals.
602. **Brick Wall Estimator** `[2D]` — counts bricks, mortar, and ties for wall areas. *Build:* wall dimension inputs, opening subtraction, brick size and joint presets, waste factor, printable list.
603. **Accessible Ramp Designer** `[3D]` — plans wheelchair ramps with compliant slopes and landings. *Build:* Three.js ramp segments, 1:12 slope checks, landing and handrail placement, length summary.
604. **Pergola Designer** `[3D]` — models pergolas and lists posts, beams, and rafters. *Build:* Three.js parametric timber members, spacing sliders, orbit controls, cut list and cost summary.
605. **Sun Path Simulator** `[3D]` — visualize sun position and shadows on buildings. *Build:* SunCalc library, Three.js directional light shadows, building massing boxes, date/time sliders.
606. **Room Area Calculator** `[2D]` — measure irregular room areas from coordinates. *Build:* polygon drawing canvas, shoelace formula, unit conversions, perimeter, room schedule export.
607. **Drywall Estimator** `[2D]` — calculate sheets, screws, mud, and tape. *Build:* wall dimension inputs, opening subtraction, sheet layout optimization, material list output.
608. **Gravel Driveway Estimator** `[2D]` — calculates gravel tonnage and base layers for driveways. *Build:* area and depth inputs, aggregate density table, layer stack options, truckload count output.
609. **Rebar Schedule Builder** `[2D]` — generate bar bending schedules with weights. *Build:* shape code templates, cut length formulas, weight per diameter, PDF export via jsPDF.
610. **Site Area Mapper** `[2D]` — measure land parcels and perimeters on maps. *Build:* Leaflet with OpenStreetMap tiles, polygon drawing, Turf.js area and perimeter, GeoJSON export.
611. **Building Massing Studio** `[3D]` — sketch building volumes and compute floor area. *Build:* Three.js extrudable footprints, floor count per block, gross area totals, FAR check.
612. **Paint Quantity Estimator** `[2D]` — estimate paint gallons for rooms and coats. *Build:* wall/ceiling area inputs, door/window deductions, coverage rates, coat count multiplier.
613. **Rain Gutter Sizer** `[2D]` — sizes gutters and downspouts from roof area and rainfall. *Build:* roof plane inputs, rainfall intensity lookup, pitch factor, gutter profile capacity table.
614. **Retaining Wall Checker** `[2D]` — check retaining walls for sliding and overturning. *Build:* Rankine earth pressure, factor of safety calculations, SVG section diagram, pass/fail summary.
615. **Steel Section Browser** `[3D]` — look up structural steel shapes and properties. *Build:* JSON section database, property filters, Three.js extruded profile preview, comparison table.
616. **BIM Model Viewer** `[3D]` — open IFC building information models in browser. *Build:* web-ifc WebAssembly parser, Three.js rendering, element tree, property panel, section planes.
617. **Construction Gantt Planner** `[2D]` — schedule construction tasks with dependencies. *Build:* frappe-gantt library, critical path calculation, drag-to-reschedule, IndexedDB project storage.
618. **Daylight Factor Estimator** `[2D]` — estimate room daylight from window geometry. *Build:* average daylight factor formula, window/floor ratios, glazing transmittance inputs, room heatmap.
619. **Load Path Visualizer** `[3D]` — trace gravity loads through building frames. *Build:* Three.js frame model, tributary area calculations, member load labels, color-coded magnitudes.
620. **Cut and Fill Calculator** `[3D]` — compute excavation volumes from grid elevations. *Build:* grid elevation input, prism method volumes, Three.js terrain mesh, cut/fill coloring.
621. **Opening Schedule Generator** `[2D]` — compile door and window schedules from entries. *Build:* editable table, type grouping, U-value and size columns, CSV and PDF exports.
622. **Room Acoustics Calculator** `[2D]` — estimate reverberation time from room finishes. *Build:* Sabine and Eyring formulas, absorption coefficient library, Chart.js octave band chart.
623. **Scale Drawing Measurer** `[2D]` — measure distances on scanned plans and PDFs. *Build:* PDF.js rendering, two-point scale calibration, polyline lengths, area tool, annotation export.
624. **Column Buckling Checker** `[2D]` — check timber and steel columns for buckling. *Build:* Euler and code buckling formulas, effective length factors, utilization ratio bar display.
625. **Snow Wind Load Estimator** `[2D]` — estimate roof snow and wall wind pressures. *Build:* simplified code equations, exposure and importance factors, SVG pressure diagrams.

## 26. Electricians, Plumbers & HVAC — *math.js, Chart.js, Three.js, SVG, psychrometric equations*
626. **Voltage Drop Calculator** `[2D]` — check conductor voltage drop over circuit length. *Build:* copper/aluminum resistivity tables, single and three-phase formulas, percent drop warnings.
627. **Wire Gauge Selector** `[2D]` — choose conductor size from load and ampacity. *Build:* JSON ampacity tables, temperature correction, conduit fill derating, recommended gauge output.
628. **Conduit Fill Calculator** `[2D]` — verify conductor counts fit within conduit. *Build:* conductor area tables, conduit types, fill percentage limits, SVG cross-section visualization.
629. **Panel Load Calculator** `[2D]` — sum loads to size service panels. *Build:* load entry table, demand factors, per-phase balancing, total amps, printable summary.
630. **Panel Directory Maker** `[2D]` — create printable circuit directory labels for panels. *Build:* two-column slot editor, circuit naming, double-pole handling, print CSS layout, localStorage.
631. **Box Fill Calculator** `[2D]` — check device boxes for conductor volume limits. *Build:* conductor volume allowances, device and clamp counts, box size table, pass/fail result.
632. **Pipe Sizing Calculator** `[2D]` — size water supply pipes from fixture units. *Build:* fixture unit tables, Hazen-Williams friction loss, velocity limits, recommended diameter output.
633. **Drain Slope Calculator** `[2D]` — compute pipe fall over run lengths. *Build:* slope ratio conversions, total drop, invert elevations, SVG profile diagram.
634. **Psychrometric Chart** `[2D]` — plot air states and HVAC processes interactively. *Build:* psychrometric equations, canvas chart, click-to-plot states, mixing and cooling process lines.
635. **Duct Sizing Calculator** `[2D]` — size ducts by airflow and friction rate. *Build:* equal friction method, round-to-rectangular equivalents, velocity check, pressure drop totals.
636. **Heat Load Estimator** `[2D]` — estimate room heating and cooling loads. *Build:* wall/window U-values, infiltration, occupant and equipment gains, room summary table.
637. **Duct Layout Planner** `[3D]` — route ductwork runs in a 3D room. *Build:* Three.js room shell, snapping duct segments and fittings, length and fitting counts.
638. **Pipe Routing Visualizer** `[3D]` — sketch plumbing risers and runs in 3D. *Build:* Three.js tube segments on grid, fitting auto-insertion, material takeoff list, isometric export.
639. **Refrigerant PT Chart** `[2D]` — look up refrigerant pressure-temperature saturation values. *Build:* fitted saturation data per refrigerant, superheat and subcooling calculators, interpolated tables.
640. **Motor Circuit Sizer** `[2D]` — size breakers, wire, and overloads for motors. *Build:* full-load current tables, multiplier rules, conductor and protection sizing outputs.
641. **Water Heater Sizer** `[2D]` — size tank or tankless heaters for households. *Build:* peak hour demand, fixture flow rates, temperature rise, recommended capacity output.
642. **Lighting Layout Calculator** `[2D]` — determine fixture count for target illuminance. *Build:* lumen method, coefficient of utilization, spacing grid, SVG room plan of fixtures.
643. **Gas Pipe Sizer** `[2D]` — size fuel gas piping by longest length. *Build:* capacity tables by pipe material, longest length method, appliance BTU totals, branch sizing.
644. **Transformer Sizing Calculator** `[2D]` — compute kVA, currents, and protection for transformers. *Build:* single and three-phase formulas, standard size rounding, primary/secondary current outputs.
645. **Grounding Conductor Sizer** `[2D]` — select grounding conductor size from service size. *Build:* lookup tables, material selection, bonding jumper sizing, code reference notes.
646. **Airflow CFM Calculator** `[2D]` — compute airflow from room volume and air changes. *Build:* ACH formulas, sensible heat CFM, register velocity, grille sizing suggestions.
647. **Radiant Floor Planner** `[3D]` — lay out radiant heating loops across floor areas. *Build:* Three.js floor plane, serpentine loop generation, loop length limits, heat output per zone.
648. **Electrical Room Planner** `[3D]` — check equipment clearances in electrical rooms. *Build:* Three.js equipment boxes, working space clearance zones, collision highlighting, dimension labels.
649. **Phasor Diagram Tool** `[2D]` — visualize three-phase phasors and power factor. *Build:* complex number math, SVG rotating phasors, power triangle, correction capacitor sizing.
650. **Pressure Loss Calculator** `[2D]` — compute pressure loss through pipes and fittings. *Build:* Darcy-Weisbach with Colebrook friction, fitting equivalent lengths, elevation head, residual pressure.

## 27. Manufacturing, CNC & 3D Printing — *Three.js, STLLoader, OpenCascade.js, Clipper.js*
651. **STL Viewer** `[3D]` — inspect 3D print files with measurements. *Build:* Three.js STLLoader, OrbitControls, bounding-box dimensions, volume via signed tetrahedra.
652. **G-code Previewer** `[3D]` — visualize toolpaths layer by layer from G-code. *Build:* line parser, Three.js line segments per layer, layer slider, print time estimate.
653. **Feeds and Speeds Calculator** `[2D]` — compute spindle speed and feed rates. *Build:* material and tool tables, chip load per tooth, surface speed, power estimate.
654. **Print Cost Estimator** `[2D]` — estimate filament usage, time, and print cost. *Build:* STL volume calculation, infill and density inputs, material cost, electricity cost.
655. **Mesh Repair Checker** `[3D]` — find holes and non-manifold edges in meshes. *Build:* Three.js edge adjacency analysis, open boundary highlighting, flipped normals, report panel.
656. **STEP File Viewer** `[3D]` — open CAD STEP files in the browser. *Build:* OpenCascade.js WebAssembly import, tessellation to Three.js, part tree, measurement tool.
657. **Overhang Analyzer** `[3D]` — highlight surfaces needing supports for printing. *Build:* Three.js face normal angle checks, shading by angle threshold, interactive orientation rotation.
658. **Sheet Metal Flat Pattern** `[2D]` — calculate bend allowances and flat lengths. *Build:* K-factor formulas, bend deduction tables, flange inputs, SVG flat pattern export.
659. **Nesting Optimizer** `[2D]` — arrange parts on sheets to minimize waste. *Build:* genetic placement algorithm in Web Worker, DXF import, utilization percentage, SVG export.
660. **DXF Viewer** `[2D]` — open and measure 2D CAD drawings. *Build:* dxf-parser library, canvas rendering with pan/zoom, layer toggles, point-to-point measurement.
661. **Thread Dimensions Reference** `[2D]` — look up thread sizes, pitches, and tap drills. *Build:* metric and unified thread JSON tables, search, tap drill and clearance hole data.
662. **Print Orientation Optimizer** `[3D]` — find orientations minimizing supports and print height. *Build:* sampled rotations, overhang area and height scoring, Three.js preview of best candidates.
663. **Calibration Model Generator** `[3D]` — generate custom calibration test prints as STL. *Build:* parametric Three.js geometry for towers and cubes, STLExporter, temperature step notes.
664. **Lithophane Maker** `[3D]` — convert photos into printable lithophane relief models. *Build:* canvas grayscale sampling, Three.js heightmap mesh, flat or curved modes, STL export.
665. **Cycle Time Calculator** `[2D]` — estimate machining cycle times per operation. *Build:* operation list, feed distances, rapid moves, tool change times, total part time.
666. **OEE Calculator** `[2D]` — compute overall equipment effectiveness from shift data. *Build:* availability, performance, quality formulas, Chart.js loss waterfall, shift comparisons.
667. **Surface Finish Converter** `[2D]` — convert roughness values between Ra, Rz, and grades. *Build:* conversion tables, approximate ratios, machining process ranges, visual comparison bars.
668. **Fit Tolerance Calculator** `[2D]` — compute ISO hole and shaft fit limits. *Build:* ISO 286 tolerance grade tables, fundamental deviations, clearance/interference results, zone diagram.
669. **Toolpath Simulator** `[3D]` — simulate material removal from CNC toolpaths. *Build:* G-code parser, Three.js heightfield stock, ball and flat tool subtraction per move.
670. **SVG to G-code Converter** `[2D]` — convert vector drawings into laser or plotter G-code. *Build:* SVG path flattening, scaling, feed and power settings, preview canvas, download.
671. **Retraction Tuning Generator** `[2D]` — generate G-code towers for tuning retraction settings. *Build:* templated G-code generation, per-segment parameter steps, printer profile inputs, file download.
672. **Mold Shot Estimator** `[3D]` — compute shot volume and clamp force for molds. *Build:* Three.js STL volume and projected area, material pressure tables, clamp tonnage output.
673. **Laser Kerf Tester** `[2D]` — generate kerf test patterns and compensate offsets. *Build:* SVG test pattern generator, measured kerf input, path offsetting with Clipper.js.
674. **Takt Time Calculator** `[2D]` — compute takt time and line balancing needs. *Build:* available time and demand inputs, station times, balancing chart, bottleneck highlights.
675. **Part Weight Calculator** `[3D]` — compute part mass from models and materials. *Build:* Three.js mesh volume calculation, material density library, unit outputs, cost per kilogram.

## 28. Science Lab — *3Dmol.js, RDKit.js, OpenCV.js, Plotly.js, Three.js*
676. **Molecule Viewer** `[3D]` — view molecular structures from PDB or SDF. *Build:* 3Dmol.js renderer, ball-and-stick and cartoon styles, atom picking, distance measurement.
677. **Molarity Calculator** `[2D]` — compute solution mass, volume, and concentration. *Build:* periodic table molar masses, formula parser, unit conversions, solve-for-any-variable form.
678. **Dilution Calculator** `[2D]` — plan serial and single-step dilutions. *Build:* C1V1=C2V2 solver, serial dilution tables, unit handling, printable pipetting plan.
679. **Equation Balancer** `[2D]` — balance chemical reactions automatically. *Build:* formula parser, element matrix, rational nullspace via fraction.js Gaussian elimination, formatted output.
680. **Periodic Table Explorer** `[2D]` — browse elements with properties and trends. *Build:* JSON element dataset, CSS grid layout, property heatmap coloring, element detail cards.
681. **Structure Sketcher** `[2D]` — draw molecules and compute molecular properties. *Build:* JSME molecule editor, RDKit.js descriptors, SMILES export, molecular weight and formula.
682. **Crystal Lattice Viewer** `[3D]` — visualize unit cells and crystal structures. *Build:* CIF file parsing, Three.js atom spheres, unit cell edges, supercell repetition controls.
683. **Protein Structure Viewer** `[3D]` — explore protein structures with secondary structure. *Build:* NGL Viewer library, PDB file upload, chain selection, residue highlighting.
684. **Buffer Calculator** `[2D]` — design buffer recipes for target pH. *Build:* Henderson-Hasselbalch equation, pKa database, temperature correction, component mass outputs.
685. **DNA Sequence Toolkit** `[2D]` — reverse complement, translate, and analyze DNA sequences. *Build:* codon tables, GC content, ORF finder, restriction site search, FASTA parsing.
686. **Primer Designer** `[2D]` — design PCR primers with melting temperature checks. *Build:* nearest-neighbor Tm calculation, GC clamp check, hairpin and dimer screening.
687. **Plasmid Map Viewer** `[2D]` — draw circular plasmid maps with annotated features. *Build:* GenBank parser, SVG circular layout, feature arcs, restriction sites, SVG export.
688. **Spectrum Viewer** `[2D]` — plot and compare spectroscopy data files. *Build:* CSV/JCAMP parsing, Plotly overlays, peak picking, baseline correction, normalization.
689. **Projectile Motion Simulator** `[2D]` — simulate trajectories with drag and launch parameters. *Build:* RK4 integration, canvas animation, range and apex outputs, drag coefficient input.
690. **Electric Field Visualizer** `[3D]` — visualize fields and potentials from point charges. *Build:* Three.js arrows and field lines, Coulomb summation, draggable charges, equipotential surfaces.
691. **Optics Ray Tracer** `[2D]` — trace rays through lenses and mirrors. *Build:* canvas optical bench, Snell's law refraction, thin lens equations, draggable elements.
692. **Atomic Orbital Viewer** `[3D]` — render hydrogen atomic orbitals as 3D surfaces. *Build:* spherical harmonics and radial functions, marching cubes isosurface in Three.js.
693. **Growth Curve Fitter** `[2D]` — fit bacterial growth curves and doubling times. *Build:* logistic and Gompertz nonlinear least squares, Plotly fitted curves, parameter table.
694. **Cell Counter** `[2D]` — count cells in microscope images semi-automatically. *Build:* OpenCV.js thresholding and contour detection, click to add/remove, hemocytometer concentration.
695. **Radioactive Decay Calculator** `[2D]` — compute remaining activity and decay chains. *Build:* half-life database, Bateman equations, activity unit conversions, Chart.js decay curves.
696. **Gel Band Analyzer** `[2D]` — estimate DNA fragment sizes from gel images. *Build:* canvas lane profiles, ladder calibration via log-linear fit, band size estimates.
697. **Phylogenetic Tree Viewer** `[2D]` — render and explore Newick format phylogenies. *Build:* Newick parser, D3 cluster layout, radial/rectangular toggle, clade collapsing, SVG export.
698. **Wave Interference Simulator** `[3D]` — visualize interference from multiple wave sources. *Build:* Three.js displaced plane mesh, GLSL wave summation shader, adjustable source frequencies.
699. **Lab Unit Converter** `[2D]` — convert concentrations, activity, and lab units. *Build:* math.js custom units, ppm/molar/percent conversions, molar mass integration, history list.
700. **Well Plate Mapper** `[2D]` — design 96 and 384 well plate layouts. *Build:* clickable plate grid, sample and control assignment, color legend, CSV export.

## 29. Math & Statistics — *math.js, jStat, KaTeX, Plotly.js, Pyodide, Three.js*
701. **3D Function Plotter** `[3D]` — plot surfaces z = f(x, y) interactively. *Build:* math.js expression compile, Three.js parametric mesh, color by height, orbit controls.
702. **Graphing Calculator** `[2D]` — plot multiple functions with zoom and intersections. *Build:* math.js parsing, canvas plotting with adaptive sampling, root and intersection finding.
703. **Matrix Calculator** `[2D]` — compute determinants, inverses, eigenvalues, and decompositions. *Build:* math.js and numeric.js, editable grid input, step display, KaTeX output.
704. **Hypothesis Test Wizard** `[2D]` — choose and run the right statistical test. *Build:* decision flow questions, jStat t, chi-square, ANOVA calculations, interpretation text.
705. **Sample Size Calculator** `[2D]` — determine sample sizes for target statistical power. *Build:* power formulas for means and proportions, jStat distributions, power curve chart.
706. **Distribution Explorer** `[2D]` — visualize probability distributions and compute probabilities. *Build:* jStat PDFs and CDFs, parameter sliders, shaded area probabilities, Plotly charts.
707. **Math Equation Editor** `[2D]` — write math equations with instant rendered preview. *Build:* KaTeX rendering, symbol palette, CodeMirror input, SVG and PNG export.
708. **Vector Field Plotter** `[3D]` — visualize 2D and 3D vector fields. *Build:* math.js expressions per component, Three.js instanced arrows, RK4 streamline integration.
709. **Parametric Surface Viewer** `[3D]` — render parametric surfaces and space curves. *Build:* math.js parametric equations, Three.js ParametricGeometry, wireframe toggle, curvature coloring.
710. **Linear Transformation Visualizer** `[3D]` — see how matrices transform vectors and space. *Build:* Three.js grid and basis vectors, animated matrix interpolation, eigenvector highlighting.
711. **Descriptive Statistics Calculator** `[2D]` — compute summary statistics from pasted data. *Build:* simple-statistics library, quartiles, skewness, Plotly box plot and histogram.
712. **Regression Calculator** `[2D]` — fit linear, polynomial, and exponential regressions. *Build:* least squares via math.js, residual plots, R-squared, KaTeX equation output.
713. **Symbolic Algebra Solver** `[2D]` — simplify, differentiate, and integrate symbolic expressions. *Build:* Pyodide SymPy, KaTeX rendered results, step history, copy as LaTeX.
714. **Monte Carlo Simulator** `[2D]` — simulate uncertain models with random sampling. *Build:* distribution-defined inputs, Web Worker sampling, histogram and percentile outputs, sensitivity tornado.
715. **ODE Solver** `[2D]` — solve and plot ordinary differential equation systems. *Build:* RK45 adaptive integrator, math.js expressions, phase portraits, Plotly time series.
716. **Fourier Series Visualizer** `[2D]` — decompose waveforms into Fourier harmonic components. *Build:* numerical coefficient integration, epicycle canvas animation, partial sum overlays.
717. **Geometry Construction Tool** `[2D]` — build compass and straightedge constructions interactively. *Build:* JSXGraph library, dependent points, measurements, construction step export.
718. **Bayesian Updater** `[2D]` — update beliefs with priors and observed data. *Build:* conjugate beta-binomial and normal models, prior/posterior plots, credible intervals.
719. **Number Base Converter** `[2D]` — convert numbers between binary, hex, and arbitrary bases. *Build:* BigInt arithmetic, fractional part support, two's complement view, IEEE-754 breakdown.
720. **Polyhedron Explorer** `[3D]` — explore polyhedra, nets, and Euler characteristics. *Build:* Three.js convex geometry, Platonic and Archimedean data, unfolding net animation, counts.
721. **Probability Tree Builder** `[2D]` — construct probability trees and compute joint outcomes. *Build:* D3 tree layout, editable branch probabilities, path products, Bayes' theorem inversion.
722. **Complex Function Plotter** `[3D]` — visualize complex functions with domain coloring. *Build:* GLSL domain coloring shader, Three.js modulus surface, math.js complex expression parsing.
723. **Optimization Solver** `[2D]` — solve linear and integer programming problems. *Build:* GLPK WebAssembly solver, constraint editor, feasible region plot for two variables.
724. **Statistical Table Lookup** `[2D]` — find critical values for common statistical distributions. *Build:* jStat inverse CDFs, z, t, chi-square, F tables, significance level inputs.
725. **Graph Theory Playground** `[2D]` — draw graphs and run classic graph algorithms. *Build:* Cytoscape.js editor, Dijkstra, MST, BFS/DFS animations, adjacency matrix export.

## 30. Security & Privacy — *Web Crypto API, zxcvbn, exifr, OpenPGP.js, pdf-lib*
726. **Password Strength Meter** `[2D]` — estimate password strength and crack time. *Build:* zxcvbn library, entropy breakdown, pattern feedback, input never leaves browser.
727. **Password Generator** `[2D]` — generate strong passwords and passphrases locally. *Build:* crypto.getRandomValues, EFF wordlist, character set options, entropy display.
728. **Hash Calculator** `[2D]` — compute file and text hashes for verification. *Build:* Web Crypto SHA family, hash-wasm for MD5/BLAKE3, streaming file chunks, compare field.
729. **EXIF Metadata Stripper** `[2D]` — view and remove photo metadata before sharing. *Build:* exifr parsing, GPS map preview, canvas re-encode stripping, batch ZIP download.
730. **File Encryptor** `[2D]` — encrypt files with a password offline. *Build:* Web Crypto AES-GCM, PBKDF2 or Argon2 WASM key derivation, self-describing encrypted file format.
731. **Encrypted Message Tool** `[2D]` — encrypt, decrypt, and sign OpenPGP messages. *Build:* OpenPGP.js, key generation, armored import/export, signature verification, IndexedDB keyring.
732. **TOTP Code Generator** `[2D]` — generate and verify time-based one-time passcodes. *Build:* Web Crypto HMAC-SHA1, otpauth URI parsing, jsQR code scanning, countdown timer.
733. **Certificate Decoder** `[2D]` — inspect X.509 certificates and chains. *Build:* PKI.js parsing, PEM/DER input, expiry dates, SAN list, fingerprint display.
734. **Secret Sharing Splitter** `[2D]` — split secrets into recoverable Shamir shares. *Build:* Shamir secret sharing over GF(256), threshold selection, share QR codes, recovery form.
735. **CSP Header Builder** `[2D]` — build content security policies with explanations. *Build:* directive form, source list editor, policy evaluator warnings, header and meta outputs.
736. **Security Headers Analyzer** `[2D]` — audit pasted HTTP response headers for weaknesses. *Build:* header parser, rule checks for HSTS, CSP, framing, cookies, graded report.
737. **Image Redaction Tool** `[2D]` — blur or black out sensitive image regions. *Build:* canvas rectangle selection, solid fill redaction, pixel-destroying re-encode, face detection suggestions.
738. **PDF Metadata Cleaner** `[2D]` — remove hidden metadata from PDF documents. *Build:* pdf-lib metadata clearing, XMP removal, document info display, cleaned file download.
739. **Phishing URL Inspector** `[2D]` — analyze suspicious links for deceptive patterns. *Build:* URL parsing, punycode homograph detection, lookalike domain scoring, redirect parameter extraction.
740. **Encrypted Notes Vault** `[2D]` — store private notes encrypted in browser storage. *Build:* AES-GCM with PBKDF2 key, IndexedDB storage, auto-lock timer, encrypted backup export.
741. **Steganography Detector** `[2D]` — check images for hidden least-significant-bit data. *Build:* canvas pixel access, LSB plane visualization, chi-square attack statistic, bit-plane viewer.
742. **Key Pair Generator** `[2D]` — generate RSA and elliptic curve key pairs. *Build:* Web Crypto generateKey, PEM/JWK export, key size options, fingerprint display.
743. **Password Hash Tester** `[2D]` — generate and verify bcrypt and Argon2 hashes. *Build:* bcryptjs and argon2-browser WASM, cost factor timing, verify against stored hash.
744. **Common Password Auditor** `[2D]` — test passwords against common leaked password lists. *Build:* bundled top-100k list in Bloom filter, local lookup, zero network requests.
745. **Cipher Toolkit** `[2D]` — encode and decode classical ciphers for training. *Build:* Caesar, Vigenère, XOR, frequency analysis charts, auto-decrypt suggestions for learning.
746. **Browser Fingerprint Checker** `[2D]` — show what your browser reveals to websites. *Build:* navigator properties, canvas and WebGL fingerprint hashes, entropy estimates, mitigation tips.
747. **Threat Model Graph** `[3D]` — map assets, data flows, and trust boundaries visually. *Build:* 3d-force-graph with Three.js, JSON inventory import, STRIDE annotations, risk-colored nodes.
748. **Offline QR Generator** `[2D]` — create QR codes offline for Wi-Fi and secrets. *Build:* qrcode.js library, Wi-Fi and vCard templates, no network calls, PNG/SVG download.
749. **Log Anonymizer** `[2D]` — mask IPs, emails, and tokens in logs. *Build:* regex detectors, consistent pseudonymization via HMAC, preview diff, sanitized file download.
750. **Connection Globe Viewer** `[3D]` — visualize firewall log connections on a 3D globe. *Build:* Three.js globe, offline IP-to-country CSV lookup, connection arcs, country counts.

## 31. Graphic Design & Color — *Canvas, chroma.js, culori, opentype.js, SVG, Three.js*
751. **Palette Generator** `[2D]` — generate harmonious color palettes from one base color. *Build:* chroma.js color math, complementary/triadic/analogous rules, swatch grid, copy HEX/RGB/HSL to clipboard.
752. **Contrast Checker** `[2D]` — test text and background contrast against WCAG levels. *Build:* culori luminance calculation, AA/AAA pass badges, live text preview, suggested accessible color adjustments.
753. **Image Palette Extractor** `[2D]` — pull dominant colors from any uploaded image. *Build:* FileReader, Canvas getImageData, k-means clustering in JS, export swatches as CSS variables or ASE.
754. **Gradient Builder** `[2D]` — design multi-stop CSS gradients with live preview. *Build:* draggable stops on Canvas, oklch interpolation via culori, copy CSS, export PNG.
755. **Colorblind Simulator** `[2D]` — preview designs as seen with color vision deficiencies. *Build:* upload image, apply Brettel/Machado matrices in WebGL shader, side-by-side comparison view.
756. **Font Pairing Lab** `[2D]` — preview heading and body font combinations. *Build:* Google Fonts CSS API, curated pair list, editable sample text, save favorites to localStorage.
757. **Type Scale Calculator** `[2D]` — generate modular typographic scales for web layouts. *Build:* ratio selector, base size input, rem/px table, live heading preview, copy CSS custom properties.
758. **Halftone Generator** `[2D]` — converts images into printable halftone dot patterns. *Build:* Canvas pixel sampling, rotated dot grid, dot size by luminance, CMYK channel option, SVG export.
759. **Duotone Image Maker** `[2D]` — remaps photos into two-color duotone graphics. *Build:* Canvas grayscale conversion, gradient map between chosen colors, chroma.js presets, PNG download.
760. **Vectorizer** `[2D]` — convert raster logos into scalable SVG paths. *Build:* imagetracerjs or potrace WASM, threshold and color count controls, SVG preview and download.
761. **Mockup Placer** `[3D]` — place designs onto 3D product mockups. *Build:* Three.js scene with mug, box, and poster models, uploaded image as texture, PNG export.
762. **Packaging Dieline Folder** `[3D]` — fold flat box dielines into 3D previews. *Build:* Three.js hinged plane meshes, parametric box dimensions, artwork texture mapping, animated fold slider, dieline SVG export.
763. **Logo Sign Preview** `[3D]` — render logos as extruded 3D signage. *Build:* Three.js SVGLoader, ExtrudeGeometry with bevel, material presets, orbit controls, PNG snapshot export.
764. **Color Space Explorer** `[3D]` — visualize palettes inside RGB, HSL, and OKLab spaces. *Build:* Three.js point cloud of colors, orbit controls, culori conversions, gamut boundary wireframes.
765. **Grid Layout Designer** `[2D]` — plan column grids with gutters and margins. *Build:* inputs for columns, gutter, margin, Canvas overlay preview, export CSS grid code and PNG overlay.
766. **Icon Sprite Builder** `[2D]` — combine SVG icons into one sprite sheet. *Build:* multi-file input, symbol element generation, preview grid, copy usage snippets, download sprite SVG.
767. **Print Preflight Checker** `[2D]` — checks images for print resolution and color issues. *Build:* image DPI at target size, RGB gamut warnings via culori, bleed overlay, checklist report.
768. **Pattern Maker** `[2D]` — design seamless repeating patterns and tiles. *Build:* Canvas tile editor with wraparound drawing, mirror/rotate symmetry modes, tiled preview, PNG and SVG export.
769. **Mood Board** `[2D]` — collect images and colors into visual boards. *Build:* drag-and-drop images, free canvas layout with interact.js, IndexedDB storage, export board as PNG.
770. **Print Bleed Calculator** `[2D]` — compute document sizes with bleed and safe margins. *Build:* paper presets, unit conversion mm/in/pt, DPI pixel dimensions, visual diagram with trim lines.
771. **Color Converter** `[2D]` — convert colors between HEX, RGB, HSL, CMYK, LAB. *Build:* culori conversions, live input sync across formats, nearest named color lookup, copy buttons.
772. **Tint Shade Scale** `[2D]` — generate 50-900 tint scales for design systems. *Build:* chroma.js lightness interpolation in OKLCH, contrast labels per step, export design tokens JSON.
773. **Image Text Overlay** `[2D]` — add captions and quotes over images for social. *Build:* Canvas text rendering, Google Fonts, aspect ratio presets, shadow and backdrop options, PNG download.
774. **Pixel Ruler** `[2D]` — measure distances and angles on screenshots. *Build:* paste image from clipboard, Canvas click-to-measure lines, zoom loupe, pixel and percentage readouts.
775. **Isometric Grid Sketcher** `[2D]` — draw isometric illustrations on a snapping grid. *Build:* SVG isometric lattice, snap-to-vertex polygon drawing, face shading presets, SVG export.

## 32. 3D Modeling & Visualization — *Three.js, Babylon.js, WebGL, glTF loaders/exporters*
776. **Model Viewer** `[3D]` — inspect glTF, OBJ, STL, and FBX files instantly. *Build:* Three.js loaders, drag-and-drop file input, orbit controls, wireframe toggle, triangle and material stats.
777. **STL Repair Checker** `[3D]` — find non-manifold edges and holes in meshes. *Build:* Three.js STLLoader, edge adjacency analysis in JS, highlight problem edges, report watertightness.
778. **Wall Thickness Analyzer** `[3D]` — highlights thin regions in models before 3D printing. *Build:* Three.js STLLoader, inward raycasts per vertex with three-mesh-bvh, heatmap coloring, minimum threshold slider.
779. **Mesh Decimator** `[3D]` — reduce polygon count of 3D models. *Build:* Three.js SimplifyModifier, target ratio slider, before/after triangle counts, GLB export via GLTFExporter.
780. **Format Converter** `[3D]` — convert between OBJ, STL, PLY, and GLB. *Build:* Three.js loaders and exporters, batch drag-and-drop, preview viewport, download converted files as ZIP.
781. **Material Previewer** `[3D]` — test PBR materials on spheres and shapes. *Build:* Three.js MeshStandardMaterial, upload albedo/normal/roughness maps, HDRI environment, roughness and metalness sliders.
782. **HDRI Viewer** `[3D]` — preview HDR environment maps and lighting. *Build:* Three.js RGBELoader, equirectangular skybox, exposure control, reflective test objects, sun direction picker.
783. **UV Layout Inspector** `[3D]` — check UV maps and texture stretching. *Build:* Three.js UV attribute drawn on 2D Canvas, checker texture on model, overlapping island highlight.
784. **Animation Clip Viewer** `[3D]` — preview and scrub animations in rigged models. *Build:* Three.js AnimationMixer, clip list selection, timeline scrubber, skeleton helper toggle, speed control.
785. **Room Planner** `[3D]` — lay out furniture in a scaled 3D room. *Build:* Three.js floor plan extrusion, draggable box furniture, dimension labels, top and perspective views, JSON save.
786. **Terrain Generator** `[3D]` — create heightmap terrains from noise or images. *Build:* Three.js PlaneGeometry displacement, simplex-noise library, smoothing passes, export heightmap PNG and OBJ.
787. **Hollow Shell Maker** `[3D]` — hollows solid models and adds drain holes for resin. *Build:* Three.js mesh offsetting along normals, inverted inner shell, drain hole placement, STL export.
788. **Procedural Shape Maker** `[3D]` — generate parametric vases, gears, and spirals. *Build:* Three.js LatheGeometry and custom BufferGeometry, slider parameters, real-time preview, STL export.
789. **Text to 3D** `[3D]` — turn text into extruded printable 3D letters. *Build:* Three.js TextGeometry with typeface fonts, depth and bevel controls, base plate option, STL export.
790. **Image Relief Maker** `[3D]` — convert photos into 3D lithophanes and reliefs. *Build:* Canvas grayscale sampling, Three.js displaced mesh, thickness range inputs, backlight preview, STL download.
791. **Shader Playground** `[3D]` — write and preview GLSL fragment shaders live. *Build:* WebGL fullscreen quad, CodeMirror editor, uniform sliders for time and mouse, error line highlighting.
792. **Camera Path Animator** `[3D]` — design camera flythroughs around a loaded model. *Build:* Three.js CatmullRomCurve3 keyframes, timeline scrubber, preview playback, record WebM via MediaRecorder.
793. **Exploded View Builder** `[3D]` — create exploded assembly views from multi-part models. *Build:* Three.js GLTF parts, radial offset slider from centroid, part labels, PNG snapshot export.
794. **Section Cut Viewer** `[3D]` — slice models with clipping planes for cross-sections. *Build:* Three.js clippingPlanes on materials, draggable plane gizmo, stencil cap fill, axis presets.
795. **Voxel Editor** `[3D]` — build blocky models voxel by voxel. *Build:* Three.js instanced cubes, raycast add/remove, color palette, IndexedDB autosave, export OBJ and VOX.
796. **Model Measurer** `[3D]` — measure model dimensions, area, and distances. *Build:* Three.js Box3 computation, point-to-point raycast measuring, unit conversion, surface area summation.
797. **Normal Map Generator** `[2D]` — create normal maps from height or photo textures. *Build:* Canvas Sobel filter, strength and invert controls, tileable preview, PNG export.
798. **Texture Tiler** `[2D]` — make textures seamless and check repetition. *Build:* Canvas offset and edge blending, 3x3 tiled preview, histogram matching, export seamless PNG.
799. **Polygon Budget Calculator** `[2D]` — plan triangle and texture budgets per scene. *Build:* asset list table, per-platform presets, texture memory formula, totals chart with Chart.js.
800. **Turntable Recorder** `[3D]` — record rotating product videos of 3D models. *Build:* Three.js auto-rotate, background color picker, Canvas captureStream, MediaRecorder WebM export, GIF via gif.js.

## 33. Photography & Video Creators — *Canvas, ffmpeg.wasm, MediaRecorder, exifr, SunCalc, Three.js*
801. **EXIF Viewer** `[2D]` — read camera settings and metadata from photos. *Build:* exifr library, drag-and-drop images, table of shutter, ISO, lens, GPS map with Leaflet.
802. **Metadata Stripper** `[2D]` — remove location and camera data before sharing. *Build:* Canvas re-encode or piexifjs deletion, batch processing, before/after metadata list, ZIP download.
803. **Golden Hour Planner** `[2D]` — find golden and blue hour times anywhere. *Build:* SunCalc library, Geolocation API, date picker, Leaflet map with sun and moon azimuth lines.
804. **Depth of Field Calculator** `[2D]` — compute focus range and hyperfocal distance. *Build:* sensor size presets, aperture and focal length inputs, circle of confusion formulas, visual range bar.
805. **Exposure Triangle Calculator** `[2D]` — find equivalent exposures across aperture, shutter, ISO. *Build:* EV math in JS, lock one setting, stops table, equivalent settings list.
806. **ND Filter Timer** `[2D]` — calculate long exposure times with ND filters. *Build:* base shutter input, filter stops selection, computed time, Web Audio countdown beep timer.
807. **Contact Sheet Maker** `[2D]` — arranges photo thumbnails into printable contact sheets. *Build:* Canvas grid layout, filename captions, capture dates via exifr, jsPDF multi-page export.
808. **Video Stabilizer** `[2D]` — smooths shaky handheld footage without uploading it. *Build:* ffmpeg.wasm vidstabdetect and vidstabtransform passes, smoothing strength slider, side-by-side preview, MP4 download.
809. **Lower Third Designer** `[2D]` — creates animated name titles for video overlays. *Build:* Canvas text and shape animation, template presets, MediaRecorder WebM with alpha, PNG sequence export.
810. **Frame Grabber** `[2D]` — extract high-quality still frames from videos. *Build:* video element seek, Canvas drawImage capture, frame-step buttons, batch interval extraction, PNG ZIP.
811. **Histogram Analyzer** `[2D]` — inspect RGB and luminance histograms and clipping. *Build:* Canvas getImageData, per-channel histogram chart, highlight and shadow clipping overlay, zebra preview.
812. **Aspect Ratio Cropper** `[2D]` — crop images to social and print ratios. *Build:* Cropper.js library, preset ratios, rule-of-thirds guides, batch apply, export full-resolution JPEG.
813. **LUT Previewer** `[2D]` — apply .cube color grading LUTs to images. *Build:* parse .cube files in JS, WebGL 3D texture lookup shader, intensity slider, before/after split.
814. **Focus Stacking Merger** `[2D]` — blends macro shots into one fully sharp image. *Build:* image alignment via OpenCV.js, Laplacian sharpness maps, per-pixel best-focus selection, PNG export.
815. **Star Trail Stacker** `[2D]` — blends night sky frames into star trail images. *Build:* multiple image upload, Canvas lighten-mode stacking, comet tail fade option, full-resolution PNG export.
816. **Shot List Planner** `[2D]` — organize scenes, shots, and equipment lists. *Build:* editable table with drag reorder, IndexedDB storage, printable PDF via jsPDF, CSV export.
817. **Storyboard Maker** `[2D]` — sketch frames with notes for video projects. *Build:* Canvas drawing panels, aspect ratio templates, caption fields, IndexedDB autosave, PDF export with jsPDF.
818. **Studio Light Planner** `[3D]` — position lights and see portrait shading in 3D. *Build:* Three.js head model, draggable lights with softness, shadow preview, top-down diagram export.
819. **Lens Field Visualizer** `[3D]` — compare focal lengths in a 3D scene. *Build:* Three.js PerspectiveCamera matching sensor and focal length, frustum gizmos, subject distance slider.
820. **Drone Shot Planner** `[3D]` — preview altitude and framing for aerial shots. *Build:* Three.js terrain from open elevation tiles, camera frustum at altitude, gimbal angle sliders, coverage footprint.
821. **Watermark Batch** `[2D]` — add text or logo watermarks to photos. *Build:* Canvas compositing, position and opacity controls, tiled mode, batch export via JSZip.
822. **Thumbnail Composer** `[2D]` — design video thumbnails with text and cutouts. *Build:* Fabric.js canvas, layer stacking, outlined text presets, background removal via ONNX WASM model, PNG export.
823. **Video Color Scope** `[2D]` — shows waveform and vectorscope readouts for video frames. *Build:* Canvas frame sampling, YUV conversion, luma waveform and vectorscope plots, live playback updates.
824. **Focus Peaking Viewer** `[2D]` — check image sharpness with edge highlight overlays. *Build:* Canvas Laplacian edge detection, colored overlay threshold, zoom loupe, works on camera feed.
825. **Time-lapse Calculator** `[2D]` — plan intervals, clip length, and storage needs. *Build:* inputs for event duration, fps, interval, computed frames, card storage estimate, shooting timer.

## 34. Musicians & Audio — *Web Audio API, WebMIDI, Tone.js, tonal.js, VexFlow, Meyda*
826. **Chromatic Tuner** `[2D]` — tune instruments via microphone with cents display. *Build:* getUserMedia, AnalyserNode, YIN pitch detection, needle gauge on Canvas, reference pitch setting.
827. **Metronome Pro** `[2D]` — keep time with accents and subdivisions. *Build:* Web Audio scheduled clicks with lookahead timer, tap tempo, polyrhythm patterns, visual beat lights.
828. **Chord Finder** `[2D]` — show chord shapes for guitar, ukulele, and piano. *Build:* tonal.js chord theory, SVG fretboard and keyboard diagrams, alternate voicings, Tone.js playback.
829. **Scale Explorer** `[2D]` — visualize scales and modes across the fretboard. *Build:* tonal.js scales, SVG fretboard with interval coloring, custom tunings, play notes with Tone.js.
830. **Sheet Music Writer** `[2D]` — notate simple scores and print them. *Build:* ABC notation input via abcjs, VexFlow rendering, playback, PDF and MIDI export.
831. **MIDI Monitor** `[2D]` — inspect incoming MIDI messages from connected devices. *Build:* WebMIDI API, message log with note, CC, and pitch bend decoding, filter controls.
832. **Ear Trainer** `[2D]` — practice recognizing intervals, chords, and scales. *Build:* Tone.js sampled piano, randomized quizzes, difficulty levels, progress stats in localStorage.
833. **Spectrum Analyzer** `[2D]` — view real-time frequency spectrum and spectrogram. *Build:* getUserMedia, AnalyserNode FFT, log-scale Canvas plot, scrolling spectrogram, peak frequency readout.
834. **Sound Level Meter** `[2D]` — estimate loudness levels in dB from microphone. *Build:* Web Audio RMS calculation, A-weighting filter, peak hold, history graph, calibration offset input.
835. **Drum Pattern Sequencer** `[2D]` — program drum beats on a step grid. *Build:* Tone.js Sampler and Transport, 16-step grid UI, swing control, WAV export via OfflineAudioContext.
836. **BPM Detector** `[2D]` — detect tempo of audio files or tapping. *Build:* decodeAudioData, onset detection with web-audio-beat-detector, tap tempo fallback, confidence display.
837. **Vocal Range Finder** `[2D]` — detects your lowest and highest sung notes. *Build:* getUserMedia input, pitchy pitch detection, piano keyboard range display, voice type classification.
838. **Key Detector** `[2D]` — estimate the musical key of songs. *Build:* decodeAudioData, Meyda chroma features, Krumhansl key profile correlation, top candidates with confidence.
839. **Practice Looper** `[2D]` — loop and slow down song sections for practice. *Build:* wavesurfer.js A-B regions, SoundTouchJS tempo change without pitch shift, pitch transpose control.
840. **MIDI Keyboard Synth** `[2D]` — play synth sounds from computer or MIDI keyboard. *Build:* WebMIDI input, Tone.js PolySynth, ADSR and filter knobs, on-screen keyboard, preset storage.
841. **Chord Progression Builder** `[2D]` — compose progressions with roman numerals and playback. *Build:* tonal.js progression mapping, drag-and-drop chord blocks, Tone.js playback, MIDI export via midi-writer-js.
842. **Room Mode Calculator** `[3D]` — predict room resonances and speaker placement. *Build:* axial/tangential mode formulas, Three.js room box with listener and speakers, frequency chart.
843. **Stage Plot Designer** `[2D]` — draw band stage layouts and input lists. *Build:* SVG drag-and-drop instrument icons, input channel table, monitor mix notes, PDF export.
844. **Delay Time Calculator** `[2D]` — convert BPM to delay and reverb times. *Build:* note division table in ms and Hz, dotted and triplet values, tap tempo input.
845. **Setlist Manager** `[2D]` — plan setlists with keys, tempos, and durations. *Build:* drag reorder list, total time calculation, IndexedDB storage, printable large-font stage view.
846. **Tone Generator** `[2D]` — produce test tones, sweeps, and noise signals. *Build:* Web Audio OscillatorNode, frequency sweep automation, white/pink noise buffers, stereo channel selection.
847. **Rhythm Trainer** `[2D]` — practice tapping rhythms with timing accuracy feedback. *Build:* VexFlow rhythm display, Web Audio clock, keypress timestamps, millisecond deviation chart.
848. **Speaker Placement Visualizer** `[3D]` — position surround speakers with correct angles. *Build:* Three.js room with listener, standard layout presets, angle and distance labels, delay compensation table.
849. **Audio Format Converter** `[2D]` — convert audio between WAV, MP3, OGG, and FLAC. *Build:* ffmpeg.wasm transcoding, bitrate and sample rate options, batch queue, local downloads.
850. **Lyric Chord Sheet** `[2D]` — format lyrics with chords and transpose instantly. *Build:* ChordPro parser in JS, transpose buttons, capo suggestion, print stylesheet, localStorage library.

## 35. Teachers & Education — *Canvas, SVG, Chart.js, Web Speech API, jsPDF, Three.js*
851. **Random Name Picker** `[2D]` — choose students fairly from class lists. *Build:* textarea roster, spinning wheel on Canvas, no-repeat mode, localStorage class lists.
852. **Group Maker** `[2D]` — split classes into balanced random groups. *Build:* roster input, group size or count options, keep-apart constraints, shuffle algorithm, printable cards.
853. **Seating Chart Builder** `[2D]` — arrange classroom seating with drag and drop. *Build:* SVG desk grid, drag student names, layout presets, save to IndexedDB, print view.
854. **Classroom Timer** `[2D]` — display large visual countdowns for activities. *Build:* fullscreen Canvas ring timer, presets, Web Audio chime, Wake Lock API to keep screen on.
855. **Noise Meter** `[2D]` — show classroom noise level with visual feedback. *Build:* getUserMedia, Web Audio RMS, adjustable threshold, color gauge, alert sound when exceeded.
856. **Gradebook Calculator** `[2D]` — compute weighted grades and class averages. *Build:* editable table, category weights, letter grade scale config, Chart.js distribution, CSV import and export.
857. **Rubric Builder** `[2D]` — create scoring rubrics and score submissions. *Build:* criteria and level grid editor, point totals, per-student scoring view, jsPDF export.
858. **Worksheet Generator** `[2D]` — create printable math practice worksheets with answers. *Build:* randomized problem templates, difficulty settings, KaTeX rendering, answer key page, print CSS.
859. **Quiz Builder** `[2D]` — make self-grading quizzes shareable as links. *Build:* question editor, quiz encoded into URL hash with lz-string, auto-scoring, results summary.
860. **Flashcard Printer** `[2D]` — turn term lists into printable flashcards. *Build:* CSV or textarea input, front-back layout, double-sided print alignment, cut lines via CSS.
861. **Word Search Maker** `[2D]` — generate word search worksheets from vocabulary lists. *Build:* grid placement algorithm with directions, difficulty options, answer key, print-ready SVG output.
862. **Interactive Whiteboard** `[2D]` — draw, annotate, and present on a digital board. *Build:* Canvas with pen pressure via Pointer Events, shapes, background grids, export pages as PDF.
863. **Read Aloud Helper** `[2D]` — read texts aloud with highlighted words. *Build:* Web Speech API SpeechSynthesis, boundary events for word highlighting, voice and rate controls.
864. **Dictation Checker** `[2D]` — compare student dictation with original text. *Build:* jsdiff word-level comparison, error highlighting, accuracy percentage, printable feedback sheet.
865. **Readability Analyzer** `[2D]` — score text reading level for target grades. *Build:* syllable counting heuristics, Flesch-Kincaid and other formulas, sentence length chart, difficult word highlights.
866. **Geometry Solids Viewer** `[3D]` — show solids, nets, cross-sections, and volumes. *Build:* Three.js shapes, unfolding net animation, clipping plane slices, volume and area formulas.
867. **Solar System Model** `[3D]` — demonstrate planet orbits, scale, and seasons. *Build:* Three.js orbital mechanics, scale toggle, time speed slider, Earth tilt season view.
868. **Earth Layers Cutaway** `[3D]` — explores crust, mantle, and core in sliced globe. *Build:* Three.js concentric spheres with cutaway wedge, labeled layers, depth and temperature info panels.
869. **Base-Ten Blocks** `[2D]` — teaches place value with draggable virtual blocks. *Build:* SVG units, rods, flats, drag-and-drop workspace, regrouping animation, number readout for lessons.
870. **Fraction Visualizer** `[2D]` — show fractions as bars, circles, and number lines. *Build:* SVG fraction models, equivalent fraction comparison, operations step display, projector mode.
871. **Lesson Planner** `[2D]` — plan weekly lessons with standards and materials. *Build:* week grid editor, reusable templates, IndexedDB storage, export to PDF and ICS calendar.
872. **Attendance Tracker** `[2D]` — record daily attendance and view summaries. *Build:* roster checklist per date, IndexedDB storage, absence statistics, CSV export.
873. **Map Quiz Maker** `[2D]` — create label-the-map exercises from blank maps. *Build:* Leaflet with GeoJSON boundaries, click-to-label mode, printable blank version, answer key.
874. **Phonics Board** `[2D]` — practice blending sounds with tappable letter tiles. *Build:* tile grid, Web Speech synthesis for phonemes, word builder area, customizable sound sets.
875. **Physics Simulator** `[3D]` — demonstrate projectiles, pendulums, and collisions interactively. *Build:* Three.js with cannon-es physics, adjustable parameters, live velocity and energy graphs via Chart.js.

## 36. Students & Self-Learning — *IndexedDB, Web Speech API, KaTeX, Tesseract.js, pdf.js, Three.js*
876. **Spaced Repetition Cards** `[2D]` — study flashcards scheduled by a memory algorithm. *Build:* SM-2 scheduling, IndexedDB decks, CSV import, Markdown and KaTeX rendering, review statistics.
877. **Pomodoro Focus Timer** `[2D]` — study in focused intervals with breaks. *Build:* configurable intervals, Notifications API, Web Audio chime, daily session log chart in Chart.js.
878. **GPA Calculator** `[2D]` — compute semester and cumulative GPA. *Build:* course table with credits and grades, scale presets, what-if target calculator, localStorage save.
879. **Citation Generator** `[2D]` — format references in APA, MLA, and Chicago. *Build:* citation-js library with CSL styles, manual fields form, BibTeX import, copy formatted output.
880. **Study Planner** `[2D]` — schedule exam prep across available days. *Build:* exams and topics input, spread algorithm by weight, calendar view, ICS export.
881. **Note OCR** `[2D]` — extract text from photos of notes and slides. *Build:* Tesseract.js WASM, camera capture via getUserMedia, language selection, editable text output.
882. **Paraphrase Similarity Checker** `[2D]` — compares your rewrite against the source for overlap. *Build:* n-gram overlap scoring, side-by-side diff highlighting with jsdiff, similarity percentage, local only.
883. **LaTeX Equation Editor** `[2D]` — write equations with live rendered preview. *Build:* KaTeX rendering, symbol palette, copy LaTeX or SVG, MathML output.
884. **Feynman Explainer Pad** `[2D]` — practice explaining topics simply and spot jargon. *Build:* textarea with jargon list highlighting, readability score, knowledge gap notes, IndexedDB autosave.
885. **Argument Mapper** `[2D]` — diagrams claims, reasons, and objections for essays. *Build:* SVG tree layout, color-coded support and rebuttal nodes, keyboard editing, Markdown outline export.
886. **Pronunciation Coach** `[2D]` — practice pronunciation with speech recognition feedback. *Build:* Web Speech SpeechRecognition, target phrase comparison, word-level match highlighting, retry history.
887. **Vocabulary Builder** `[2D]` — learn new words with context and quizzes. *Build:* user word lists, example sentences, multiple-choice review, Web Speech playback, IndexedDB progress.
888. **Typing Tutor** `[2D]` — improve typing speed and accuracy with drills. *Build:* keystroke tracking, WPM and accuracy calculation, weak-key heatmap, custom text lessons.
889. **Unit Converter** `[2D]` — convert units for science and engineering coursework. *Build:* convert-units library, dimensional categories, significant figures option, conversion history.
890. **Unit Circle Trainer** `[2D]` — drills sine, cosine, and angle values interactively. *Build:* SVG unit circle, draggable angle point, exact value display with KaTeX, timed quiz mode.
891. **Statistics Calculator** `[2D]` — compute descriptive stats and run basic tests. *Build:* jStat library, data paste input, t-test and chi-square, histogram and box plot charts.
892. **Cell Biology Explorer** `[3D]` — explore labeled 3D animal and plant cells. *Build:* Three.js organelle meshes, clickable labels with descriptions, cutaway clipping, quiz mode.
893. **Surface Function Plotter** `[3D]` — graph multivariable surfaces for calculus courses. *Build:* math.js parsing, Three.js ParametricGeometry surface, contour lines, orbit controls, gradient arrows.
894. **Constellation Learner** `[3D]` — learn constellations on an interactive celestial sphere. *Build:* Three.js sky sphere, HYG star catalog JSON, constellation lines, quiz on names.
895. **Vector Operations Visualizer** `[3D]` — shows dot, cross products, and projections in 3D. *Build:* Three.js arrow helpers, editable vector components, live result vectors, angle and magnitude readouts.
896. **Code Playground** `[2D]` — run HTML, CSS, JS, and Python snippets offline. *Build:* CodeMirror editors, sandboxed iframe preview, Pyodide WASM for Python, localStorage snippets.
897. **Essay Outliner** `[2D]` — structure essays with thesis and supporting points. *Build:* drag-reorder outline tree, section word targets, Markdown export, IndexedDB autosave.
898. **Reading Speed Trainer** `[2D]` — read faster with paced word presentation. *Build:* RSVP display with adjustable WPM, paste text or PDF via pdf.js, comprehension notes.
899. **Habit Streak Tracker** `[2D]` — track daily study habits and streaks. *Build:* calendar heatmap with cal-heatmap, IndexedDB storage, streak calculations, JSON backup export.
900. **Cornell Notes Template** `[2D]` — take structured notes with cues and summaries. *Build:* three-pane editable layout, Markdown support, IndexedDB storage, print and PDF export.

## 37. Medical & Care Workers (reference only) — *math.js, Chart.js, IndexedDB, Three.js, Web Speech API*
901. **BMI Reference Calculator** `[2D]` — compute BMI with standard category reference ranges. *Build:* metric and imperial inputs, formula display, reference category table, printable result.
902. **Dose by Weight Calculator** `[2D]` — calculate weight-based dose amounts for verification. *Build:* mg/kg input, concentration to volume conversion, rounding rules, double-check confirmation step.
903. **IV Drip Rate Calculator** `[2D]` — compute drops per minute and infusion times. *Build:* volume, time, drop factor inputs, mL/hr and gtt/min outputs, infusion end time.
904. **Anion Gap Calculator** `[2D]` — computes anion gap with albumin correction for reference. *Build:* electrolyte inputs with unit toggles, standard and corrected formulas, reference range notes, disclaimer.
905. **Body Surface Area Calculator** `[2D]` — compute BSA using multiple published formulas. *Build:* Mosteller, DuBois, Haycock formulas, side-by-side results, unit toggle, formula citations.
906. **Fluid Balance Log** `[2D]` — record intake and output totals per shift. *Build:* timestamped entry form, shift totals, running balance chart, IndexedDB storage, print summary.
907. **Medication Schedule Planner** `[2D]` — build daily medication timetables for caregivers. *Build:* med list with times, printable chart grid, Notifications API reminders, localStorage persistence.
908. **Shift Handover Checklist** `[2D]` — structure handovers with SBAR-style templates. *Build:* customizable checklist sections, printable form, local draft autosave, no data transmission.
909. **Weight Height Converter** `[2D]` — convert weights and heights between units quickly. *Build:* kg/lb and cm/in converters, large touch inputs, precision settings, copy buttons.
910. **Hand Hygiene Timer** `[2D]` — time handwashing duration with guided steps. *Build:* step-by-step illustrated SVG sequence, countdown timer, Web Audio cues, kiosk fullscreen mode.
911. **CPR Metronome** `[2D]` — keep compression rate cues for training practice. *Build:* Web Audio clicks at 100-120 BPM, cycle counter, Wake Lock API, voice prompts via SpeechSynthesis.
912. **Anatomy Reference Viewer** `[3D]` — rotate labeled 3D anatomy models for reference. *Build:* Three.js with open-licensed GLB anatomy, layer toggles, label hotspots, cross-section clipping planes.
913. **Skeleton Explorer** `[3D]` — identify bones on an interactive 3D skeleton. *Build:* Three.js segmented skeleton model, raycast picking, name labels, search and highlight, quiz mode.
914. **Injection Site Map** `[3D]` — reference and rotate injection sites on body model. *Build:* Three.js mannequin, marked site hotspots, rotation log in localStorage, printable site chart.
915. **Repositioning Turn Timer** `[2D]` — track patient repositioning schedules across rooms. *Build:* room list with timers, color-coded due status, Notifications API alerts, IndexedDB log.
916. **Ideal Body Weight Calculator** `[2D]` — compute ideal and adjusted body weights. *Build:* Devine and Robinson formulas, sex and height inputs, adjusted weight formula, formula references.
917. **Medical Abbreviation Lookup** `[2D]` — search common clinical abbreviations and meanings. *Build:* bundled JSON dataset, Fuse.js fuzzy search, do-not-use list flags, offline service worker.
918. **eGFR Calculator** `[2D]` — estimates kidney filtration rate from creatinine for reference. *Build:* CKD-EPI 2021 equation, unit conversion for creatinine, CKD stage reference table, disclaimer.
919. **Vital Signs Log** `[2D]` — record and chart vitals over time. *Build:* entry form for pulse, BP, temperature, SpO2, Chart.js trends, IndexedDB, CSV export.
920. **Care Visit Planner** `[2D]` — plan home care visit routes and tasks. *Build:* Leaflet map with OpenStreetMap tiles, client stops, task checklists per visit, local storage only.
921. **Infusion Rate Converter** `[2D]` — convert between mcg/kg/min and mL/hr rates. *Build:* weight, concentration, dose inputs, bidirectional rate conversion, shown formula steps for verification.
922. **Coma Scale Reference** `[2D]` — sum scale components with reference descriptions. *Build:* three-component selector cards, automatic total, descriptive reference text, timestamped record history.
923. **Wound Measurement Log** `[2D]` — record wound dimensions and photos over time. *Build:* camera capture, Canvas ruler calibration, length-width area calculation, IndexedDB timeline, PDF export.
924. **Care Room Layout Planner** `[3D]` — plan bed, equipment, and clearance in care rooms. *Build:* Three.js room, draggable bed and equipment models, clearance zone visualization, dimension labels.
925. **Caregiver Shift Roster** `[2D]` — schedule care staff shifts and coverage. *Build:* weekly grid with drag assignment, coverage gap highlights, hours totals, CSV and PDF export.

## 38. Agriculture & Farming — *Leaflet, Turf.js, Chart.js, SunCalc, Three.js, Geolocation*
926. **Field Area Measurer** `[2D]` — measure field area by walking or drawing. *Build:* Leaflet with free satellite tiles, Geolocation watchPosition tracking, Turf.js area, hectares and acres output.
927. **Seed Rate Calculator** `[2D]` — compute seeding rates from germination and target density. *Build:* thousand-seed weight, germination and survival inputs, kg/ha output, bag count estimate.
928. **Fertilizer Blend Calculator** `[2D]` — mix fertilizers to meet nutrient targets. *Build:* N-P-K product database, linear solver via javascript-lp-solver, cost per hectare comparison.
929. **Sprayer Calibration** `[2D]` — calibrate sprayer output and tank mix amounts. *Build:* nozzle flow, speed, spacing inputs, L/ha formula, tank mix product quantities, stopwatch.
930. **Hay Inventory Planner** `[2D]` — estimates winter hay needs against bales on hand. *Build:* herd size and intake inputs, bale weight table, feeding days math, shortfall chart.
931. **Growing Degree Days** `[2D]` — track accumulated heat units for crop stages. *Build:* daily min/max temperature entry or CSV, GDD formula with base temps, Chart.js accumulation.
932. **Livestock Feed Ration** `[2D]` — balance feed rations for cattle, sheep, and goats. *Build:* feed nutrient table, animal requirement presets, least-cost solver, ration summary printout.
933. **Herd Record Book** `[2D]` — track animals, births, treatments, and weights. *Build:* IndexedDB records, animal profiles, weight gain charts, search, CSV export and import.
934. **Gestation Calculator** `[2D]` — compute due dates for farm animal breeding. *Build:* species gestation lengths, breeding date input, expected birth date, batch calendar view.
935. **Irrigation Scheduler** `[2D]` — plan irrigation from crop water use estimates. *Build:* evapotranspiration formulas, crop coefficient tables, soil water balance chart, schedule output.
936. **Rain Gauge Log** `[2D]` — record rainfall readings and compare seasons. *Build:* date entry form, IndexedDB storage, monthly totals bar chart, year-over-year comparison.
937. **Yield Estimator** `[2D]` — estimate crop yield from field sample counts. *Build:* crop-specific formulas, sample count inputs, average and range calculation, tonnage per field.
938. **Soil Test Calculator** `[2D]` — convert soil test values into amendment quantities. *Build:* nutrient input form, reference sufficiency ranges, lime and nutrient rate formulas, printable report.
939. **Grain Moisture Shrink Calculator** `[2D]` — computes weight loss when drying grain to target moisture. *Build:* moisture shrink formula, handling loss factor, bushel conversions, price impact summary.
940. **Greenhouse Layout Planner** `[3D]` — design greenhouse benches, aisles, and plant spacing. *Build:* Three.js greenhouse frame, parametric benches, plant count per area, sun angle via SunCalc.
941. **Barn Layout Designer** `[3D]` — plan stalls, pens, and alleys for livestock buildings. *Build:* Three.js grid floor, draggable pen modules, space-per-animal checks, dimension labels.
942. **Grain Bin Volume** `[3D]` — calculate stored grain volume and bushels. *Build:* cylinder and cone geometry formulas, Three.js bin fill visualization, peaked or inverted cone options.
943. **Terrain Slope Viewer** `[3D]` — view field slopes and drainage in 3D. *Build:* Three.js elevation mesh from open terrain tiles, slope color mapping, flow direction arrows.
944. **Plant Spacing Calculator** `[2D]` — compute plant counts for beds and rows. *Build:* row and in-row spacing inputs, square or triangular patterns, SVG layout preview.
945. **Pest Scouting Log** `[2D]` — record pest observations with photos and locations. *Build:* camera capture, Geolocation tagging, Leaflet field map pins, IndexedDB storage, CSV export.
946. **Frost Risk Board** `[2D]` — view forecast frost nights for your location. *Build:* Open-Meteo free API, Geolocation, hourly temperature chart, threshold highlight, crop protection checklist.
947. **Tank Mix Order Guide** `[2D]` — sequence and quantify chemical tank mixing steps. *Build:* product formulation types, standard mixing order rules, per-tank quantity calculation, printable card.
948. **Farm Expense Tracker** `[2D]` — track costs and income per field or enterprise. *Build:* IndexedDB transactions, category tagging, per-hectare cost charts, CSV export.
949. **Beehive Inspection Log** `[2D]` — record hive inspections, queen status, and honey yields. *Build:* per-hive forms, IndexedDB history, photo attachments, trend charts, Notifications API reminders.
950. **Fence Material Calculator** `[2D]` — estimate posts, wire, and costs for fencing. *Build:* Leaflet line drawing with Turf.js length, post spacing, strand count, materials list.

## 39. Logistics, Warehouse & Retail — *Three.js, ZXing, BarcodeDetector, Leaflet, IndexedDB, jsPDF*
951. **Barcode Stock Counter** `[2D]` — count stock by scanning barcodes with camera. *Build:* ZXing WASM or BarcodeDetector API, quantity increment, IndexedDB list, CSV export.
952. **Barcode Label Maker** `[2D]` — generate printable barcode and QR labels. *Build:* JsBarcode and qrcode.js, label sheet templates, CSV merge, print-ready PDF via jsPDF.
953. **Pallet Load Planner** `[3D]` — stack boxes efficiently on pallets in 3D. *Build:* Three.js pallet scene, layer packing heuristic, weight and height limits, pattern diagram export.
954. **Container Loading Planner** `[3D]` — fit cargo into shipping containers with utilization stats. *Build:* Three.js container models, 3D bin packing algorithm, load order colors, volume and weight summary.
955. **Warehouse Layout Designer** `[3D]` — plan racks, aisles, and zones in 3D. *Build:* Three.js floor grid, parametric rack modules, aisle width checks, capacity totals, JSON save.
956. **Axle Load Calculator** `[2D]` — distribute cargo weight across vehicle axles. *Build:* lever-arm formulas, cargo position inputs, axle limit warnings, SVG side-view diagram.
957. **Dimensional Weight Calculator** `[2D]` — compute volumetric weight for parcel shipping. *Build:* dimension inputs, carrier divisor presets, chargeable weight comparison, batch table mode.
958. **Route Stop Optimizer** `[2D]` — order delivery stops for the shortest route. *Build:* Leaflet map, Nominatim geocoding, nearest-neighbor plus 2-opt TSP in JS, printable stop list.
959. **Reorder Point Calculator** `[2D]` — compute reorder points and safety stock levels. *Build:* demand and lead time inputs, service level z-score, EOQ formula, stock cycle chart.
960. **ABC Analysis Tool** `[2D]` — classify inventory items by value contribution. *Build:* CSV import via PapaParse, cumulative percentage sort, Pareto chart in Chart.js, classified export.
961. **Cycle Count Scheduler** `[2D]` — plan rotating stock counts by item class. *Build:* item list import, frequency by ABC class, calendar distribution, printable count sheets.
962. **Shelf Planogram Designer** `[3D]` — arrange products on shelves with facings. *Build:* Three.js shelving unit, product boxes with image textures, facing counts, front-view export.
963. **Price Markup Calculator** `[2D]` — convert between cost, markup, margin, and price. *Build:* bidirectional inputs, tax inclusion option, rounding to price endings, batch CSV mode.
964. **Shelf Label Printer** `[2D]` — print price tags with barcodes and unit prices. *Build:* CSV import, template designer, JsBarcode, unit price calculation, print layout via CSS.
965. **Packing Slip Generator** `[2D]` — create packing slips and pick lists from orders. *Build:* order form or CSV, template layout, jsPDF output, barcode per order.
966. **Box Size Recommender** `[2D]` — choose the smallest box fitting a set of items. *Build:* box inventory list, item dimensions, rotation-aware fit checks, void fill estimate.
967. **Cash Drawer Counter** `[2D]` — count till denominations and reconcile totals. *Build:* denomination grid with currency presets, running totals, expected versus counted variance, print slip.
968. **Delivery Proof Capture** `[2D]` — capture signature, photo, and timestamp at delivery. *Build:* signature_pad library, camera capture, Geolocation stamp, IndexedDB queue, PDF receipt via jsPDF.
969. **Picking Productivity Tracker** `[2D]` — log picks per hour and team throughput. *Build:* entry form per worker, hourly rate calculations, Chart.js dashboards, CSV export.
970. **Store Footfall Counter** `[2D]` — tally visitors with tap counter and hourly chart. *Build:* large tap buttons, timestamp log, IndexedDB storage, hourly histogram with Chart.js.
971. **Freight Class Calculator** `[2D]` — determine freight density and estimated class. *Build:* dimensions and weight inputs, density formula, class threshold table lookup, multi-piece totals.
972. **Expiry Date Tracker** `[2D]` — track product expiry dates and markdown timing. *Build:* barcode scan entry, IndexedDB items, days-left sorting, color warnings, Notifications API.
973. **Fleet Fuel Log** `[2D]` — record fuel fills and vehicle efficiency. *Build:* per-vehicle entries, consumption calculations, cost per kilometer charts, CSV export.
974. **Dock Schedule Board** `[2D]` — schedule inbound and outbound dock appointments. *Build:* time-slot grid per door, drag-and-drop bookings, conflict detection, IndexedDB storage, print view.
975. **Rack Load Visualizer** `[3D]` — check beam load per rack level visually. *Build:* Three.js rack with stacked pallets, per-beam weight inputs, capacity color warnings, summary table.

## 40. Hobbies & Crafts — *Canvas, SVG, Three.js, SunCalc, astronomy-engine, DeviceOrientation*
976. **Knitting Chart Maker** `[2D]` — design colorwork knitting charts on a grid. *Build:* Canvas stitch grid, color palette, repeat preview, row highlighting, PNG and PDF export.
977. **Knit Garment Preview** `[3D]` — preview knitted patterns on a 3D sweater. *Build:* Three.js garment mesh, chart rendered to CanvasTexture, repeat scaling, orbit controls.
978. **Gauge Converter** `[2D]` — adjust pattern stitch counts for different gauges. *Build:* pattern gauge and your gauge inputs, stitch and row recalculation, size adjustment table.
979. **Row Counter** `[2D]` — count knitting or crochet rows with reminders. *Build:* big tap buttons, multiple counters per project, repeat alerts, Wake Lock, localStorage.
980. **Cut List Optimizer** `[2D]` — minimize waste when cutting boards and sheets. *Build:* guillotine bin packing algorithm, kerf setting, stock and parts inputs, SVG cutting diagrams.
981. **Furniture Project Modeler** `[3D]` — model furniture parts and joints in 3D. *Build:* Three.js parametric boards, joinery presets, exploded view, auto-generated cut list.
982. **Board Foot Calculator** `[2D]` — compute lumber volume and cost for projects. *Build:* thickness, width, length inputs, board foot and cubic meter output, project totals table.
983. **Stair Stringer Calculator** `[2D]` — compute rise, run, and stringer layout. *Build:* total rise input, code-range checks, step count calculation, SVG stringer layout diagram.
984. **Night Sky Planner** `[3D]` — view tonight's sky from your location in 3D. *Build:* Three.js celestial sphere, star catalog JSON, astronomy-engine planet positions, Geolocation, time slider.
985. **Telescope Calculator** `[2D]` — compute magnification, field of view, and limits. *Build:* focal length and eyepiece inputs, exit pupil, true field, eyepiece comparison table.
986. **Kite Designer** `[2D]` — plans kite shapes with spar lengths and sail patterns. *Build:* SVG parametric diamond and delta templates, bridle point calculation, tiled printable PDF patterns.
987. **Sky Pointer** `[2D]` — identify stars by pointing phone at sky. *Build:* DeviceOrientation API, Geolocation, star catalog projection on Canvas, red night mode.
988. **Fishing Knot Guide** `[2D]` — learn knots with step-by-step animated diagrams. *Build:* SVG path animations per step, knot strength notes, offline service worker caching.
989. **Solunar Fishing Planner** `[2D]` — plan fishing times by solunar periods. *Build:* SunCalc moon transit math, major/minor period calculation, day timeline chart, Geolocation.
990. **Fishing Catch Log** `[2D]` — record catches with photos, location, and conditions. *Build:* camera capture, Geolocation, Leaflet map, IndexedDB entries, species statistics charts.
991. **Model Scale Converter** `[2D]` — convert real dimensions to model scales. *Build:* scale presets like 1:35 and 1:87, bidirectional mm/in conversion, printable reference ruler.
992. **Paint Mixing Guide** `[2D]` — estimate pigment ratios to match target colors. *Build:* Kubelka-Munk mixing model in JS, swatch library, ratio slider, saved recipes in localStorage.
993. **Diorama Layout Planner** `[3D]` — arrange scale models and scenery in 3D. *Build:* Three.js base board, primitive buildings and terrain, scale-aware dimensions, camera angle snapshots.
994. **Cross Stitch Converter** `[2D]` — convert images into cross-stitch patterns with floss colors. *Build:* Canvas downsampling, palette reduction to thread color list, symbol grid PDF.
995. **Quilt Block Designer** `[2D]` — design quilt blocks and compute fabric yardage. *Build:* SVG block templates, color fills, repeat layout preview, fabric area calculations.
996. **Sewing Pattern Tiler** `[2D]` — scale and tile printable sewing patterns. *Build:* pdf.js import, scale calibration square, tiled page output with overlap marks via pdf-lib.
997. **Bead Pattern Designer** `[2D]` — design peyote and loom bead patterns. *Build:* offset grid on Canvas, color palette, bead count summary, word chart export.
998. **Model Railway Track Planner** `[2D]` — lays out model train track plans to scale. *Build:* SVG snapping track pieces by gauge, curve radius checks, grade calculation, parts list export.
999. **Pottery Shrinkage Calculator** `[2D]` — size pieces accounting for clay shrinkage. *Build:* shrinkage percentage input, wet-to-fired size conversion, ruler printout, glaze batch calculator.
1000. **Rocket Flight Simulator** `[3D]` — simulate model rocket altitude and flight path. *Build:* motor thrust curve JSON, drag equations, Three.js trajectory view, apogee and velocity charts.
