# Implementation Plan — Cake Store Manager: Big Upgrade
**Date:** 2026-05-06  
**Scope:** Group A bugs + Worker system redesign + New UI + Baking minigame + Drinks

---

## Phase 0 — Pre-flight

### Task 0.1 — Backup current state
- [ ] Copy `static/css/style.css` → `static/css/style.css.bak`
- [ ] Copy `static/js/game.js` → `static/js/game.js.bak`
- [ ] Copy `game/models.py` → `game/models.py.bak`
- **Verify:** bak files exist

### Task 0.2 — Run migrations baseline
- [ ] `python manage.py migrate` — confirm 0 errors
- [ ] `python manage.py seed_recipes` — confirm recipes seeded
- **Verify:** server starts clean on `python manage.py runserver`

---

## Phase 1 — Group A Bug Fixes (line changes only)

### Task 1.1 — Fix stale DOM icons not clearing (orders/shelf/recipes)
**File:** `static/js/game.js`

Problem: `renderInventory`, `renderOrders` don't purge removed items before re-render.  
Already partially fixed but inconsistent.

- [ ] In `renderInventory`: move the stale-card purge block to run BEFORE the empty-state check
- [ ] In `renderOrders`: same — purge stale `[data-order-id]` cards first, then check empty
- [ ] In `renderBaking`: confirm stale `[data-bake-id]` cards purged before early return
- [ ] In `renderOvens`: confirm stale `[data-oven-id]` cards purged
- **Verify:** open store, fulfill an order — card disappears immediately without page reload

### Task 1.2 — Fix casual / orders_only worker modes
**File:** `game/game_engine.py`

Problem: In `_worker_tick`, `casual` mode calls `_worker_fulfill_order` then falls to `_auto_bake` 
but the logic short-circuits when there's no stock, never triggering baking.

- [ ] In `_worker_tick` → `casual` block: change condition so baker bakes whenever no *fulfillable* 
  order exists (not just no pending orders). Replace the `has_pending` check with:
  ```python
  can_fulfill = _most_needed_recipe(allowed_sizes, state) is None and not _worker_fulfill_order(worker, state)
  ```
  Actually: simplify to always try fulfill first; if returns None, always call `_auto_bake`.
- [ ] In `orders_only` block: confirm baker only calls `_worker_fulfill_order`, never `_auto_bake` — 
  currently correct, just add a comment for clarity
- [ ] In `_worker_fulfill_order`: the stock check uses `remaining_slices=SIZE_SLICES[order.size]` 
  for whole cakes — this means a partially-eaten cake won't be used. Confirm this is intentional.
- **Verify:** hire a baker, set casual mode, open store — baker should bake AND serve

### Task 1.3 — Fix hire pool cashier probability imbalance
**File:** `game/game_engine.py`

Problem: `_generate_hire_pool` sets `role_pool` from a single `random.choices` call but then 
does `random.choice(role_pool)` on a single string, iterating over characters.

- [ ] Line: `role_pool = random.choices(list(role_weights.keys()), ...)` returns a list with one 
  element. Then `random.choice(role_pool)` picks from that single string — BUG.
- [ ] Fix: generate a role per worker in the loop, not outside:
  ```python
  for name in pool:
      star = random.choices(stars, weights=weights, k=1)[0]
      role = random.choices(
          list(role_weights.keys()),
          weights=list(role_weights.values()), k=1
      )[0]
  ```
- [ ] Update `role_weights` for early days: bakers 50%, cashier 20%, waiter 15%, barista 10%, manager 5%
- **Verify:** generate hire pool on day 1 — should have mixed roles, not all cashiers

### Task 1.4 — Fix activity log unread count not resetting
**File:** `static/js/game.js`

- [ ] In `toggleNotifications`: after setting `_lastReadLogCount = G.event_log.length`, also 
  call `renderNotificationBadge()` immediately so badge hides without waiting for next poll
- [ ] In `renderNotificationBadge`: change unread count logic — only count events NEWER than 
  last read position, not a slice comparison
- [ ] Store `_lastReadLogCount` as the ID of the last-read log entry (not count) to survive 
  state refreshes
- **Verify:** open log panel → badge disappears immediately → re-open → still 0

---

## Phase 2 — Worker Model Expansion

### Task 2.1 — Add fields to Worker model
**File:** `game/models.py`

Add to `Worker` model:
- [ ] `positive_trait = models.CharField(max_length=60, blank=True, default='')`
- [ ] `negative_trait = models.CharField(max_length=60, blank=True, default='')`
- [ ] `skill_mastery = models.JSONField(default=dict)` — e.g. `{"oven_instinct": 3}`
- [ ] `morale = models.IntegerField(default=70)`

Add to `HireableWorker` model (same fields, shown in hire pool):
- [ ] `positive_trait = models.CharField(max_length=60, blank=True, default='')`
- [ ] `negative_trait = models.CharField(max_length=60, blank=True, default='')`

- [ ] Run `python manage.py makemigrations`
- [ ] Run `python manage.py migrate`
- **Verify:** no migration errors

### Task 2.2 — Add trait + mastery catalogues to models.py

- [ ] Add `POSITIVE_TRAITS` dict to `models.py`:
  ```python
  POSITIVE_TRAITS = {
    'fast_learner':    {'name':'Fast Learner',    'icon':'⚡', 'desc':'Gains skill XP 30% faster'},
    'perfectionist':   {'name':'Perfectionist',   'icon':'🎯', 'desc':'Perfect zone 20% more likely'},
    'team_player':     {'name':'Team Player',     'icon':'🤝', 'desc':'Adjacent workers +5% speed'},
    'early_bird':      {'name':'Early Bird',      'icon':'🌅', 'desc':'First 2 orders 20% faster'},
    'cool_head':       {'name':'Cool Head',       'icon':'🧊', 'desc':'No penalty in rush hour'},
    'innovative':      {'name':'Innovative',      'icon':'💡', 'desc':'Discovers new deco options'},
    'loyal':           {'name':'Loyal',           'icon':'💛', 'desc':'Salary never increases'},
    'energetic':       {'name':'Energetic',       'icon':'⚡', 'desc':'Serves 1 extra customer/tick'},
  }
  ```
- [ ] Add `NEGATIVE_TRAITS` dict:
  ```python
  NEGATIVE_TRAITS = {
    'clumsy':          {'name':'Clumsy',          'icon':'🤕', 'desc':'10% chance drops ingredient'},
    'slow_starter':    {'name':'Slow Starter',    'icon':'🐢', 'desc':'First 30s at -20% speed'},
    'picky':           {'name':'Picky',           'icon':'😤', 'desc':'Refuses certain recipe types'},
    'forgetful':       {'name':'Forgetful',       'icon':'😶', 'desc':'1% chance misses an order'},
    'expensive_taste': {'name':'Expensive Taste', 'icon':'💸', 'desc':'Demands raise every 5 days'},
    'distracted':      {'name':'Distracted',      'icon':'😵', 'desc':'5% chance idles 5 seconds'},
    'overconfident':   {'name':'Overconfident',   'icon':'😎', 'desc':'Ignores instructions 10%'},
    'sensitive':       {'name':'Sensitive',       'icon':'😢', 'desc':'-2 morale per expired order'},
  }
  ```
- [ ] Add `ROLE_SKILLS` dict mapping role → list of learnable skills:
  ```python
  ROLE_SKILLS = {
    'baker':   ['mixing_technique','dough_shaping','decoration_eye','oven_instinct','recipe_memory'],
    'cashier': ['quick_service','charm','upselling','cash_handling','regular_memory'],
    'waiter':  ['floor_reading','presentation','conflict_resolution','speed_walking','sommelier_eye'],
    'barista': ['espresso_craft','latte_art','cold_brew_mastery','tea_ceremony','blend_intuition'],
    'manager': ['staff_motivation','cost_control','scheduling','talent_eye','crisis_management'],
  }
  ```
- [ ] Add `SKILL_MASTERY_NAMES = {1:'Novice',2:'Apprentice',3:'Skilled',4:'Expert',5:'Master'}`

### Task 2.3 — Update Worker.to_dict() and HireableWorker.to_dict()

**File:** `game/models.py`

- [ ] In `Worker.to_dict()` add:
  ```python
  'positive_trait': self.positive_trait,
  'negative_trait': self.negative_trait,
  'skill_mastery':  self.skill_mastery or {},
  'morale':         self.morale,
  'trait_info': {
    'positive': POSITIVE_TRAITS.get(self.positive_trait, {}),
    'negative': NEGATIVE_TRAITS.get(self.negative_trait, {}),
  }
  ```
- [ ] In `HireableWorker.to_dict()` add same trait fields

### Task 2.4 — Assign traits on hire
**File:** `game/game_engine.py`

- [ ] In `_generate_hire_pool`: after picking role, randomly assign:
  ```python
  pos = random.choice(list(POSITIVE_TRAITS.keys()))
  neg = random.choice(list(NEGATIVE_TRAITS.keys()))
  ```
  Save to `HireableWorker`.

- [ ] In `hire_from_pool`: copy traits from `HireableWorker` to new `Worker`

- [ ] Init `skill_mastery` with role's first skill at level 1:
  ```python
  primary_skill = ROLE_SKILLS.get(hw.role, [''])[0]
  skill_mastery = {primary_skill: 1} if primary_skill else {}
  ```

### Task 2.5 — Morale updates at end of day
**File:** `game/game_engine.py`  
**Function:** `end_day()`

- [ ] After salary deduction, loop workers and apply morale delta:
  ```python
  for w in workers:
      delta = 0
      if net_profit > 0: delta += 2
      if expired_count == 0: delta += 1
      delta -= min(expired_count, 5)  # -1 per expiry, max -5
      w.morale = max(0, min(100, w.morale + delta))
      w.save(update_fields=['morale'])
  ```
- [ ] Log warning if any worker morale < 20: "⚠️ {name} is unhappy — morale critical!"

---

## Phase 3 — New CSS Design System

### Task 3.1 — Replace CSS variables
**File:** `static/css/style.css`

- [ ] Replace `:root` block with Stardew palette:
  ```css
  :root {
    --bg: #1a0f06;
    --surface: #3d2512;
    --surface2: #4a2e18;
    --panel: #5c3a1e;
    --border-dark: #1a0f06;
    --border-light: #8b6340;
    --gold: #f0c040;
    --gold2: #c07820;
    --green: #5a8a3c;
    --green2: #7ab850;
    --cream: #f5e6c8;
    --cream-dim: #c4a882;
    --red: #8b2020;
    --blue: #3a6b8a;
    --purple: #6b3a8a;
    --accent: #e94560;   /* keep for urgent/error */
    --accent2: #f5a623;  /* keep for compatibility */
    --text: #f5e6c8;
    --muted: #c4a882;
    --radius: 4px;        /* reduced — pixel style */
    --shadow: 0 4px 20px rgba(0,0,0,0.5);
    --font: 'Segoe UI', system-ui, sans-serif;
  }
  ```

### Task 3.2 — Add pixel border utilities
**File:** `static/css/style.css`

- [ ] Add after `:root`:
  ```css
  .px-box {
    border-top: 3px solid var(--border-light);
    border-left: 3px solid var(--border-light);
    border-right: 3px solid var(--border-dark);
    border-bottom: 3px solid var(--border-dark);
  }
  .px-box-inner {
    border-top: 2px solid var(--border-dark);
    border-left: 2px solid var(--border-dark);
    border-right: 2px solid var(--border-light);
    border-bottom: 2px solid var(--border-light);
  }
  ```
- [ ] Update `.btn` to use px-box style borders instead of border-radius:
  ```css
  .btn {
    border-top: 2px solid var(--border-light);
    border-left: 2px solid var(--border-light);
    border-right: 2px solid var(--border-dark);
    border-bottom: 2px solid var(--border-dark);
    border-radius: 0;
    ...
  }
  ```
- [ ] Update `.card`, `.oven-card`, `.order-card`, `.worker-card-new`, `.shop-item` 
  to use `.px-box` style borders + reduced/zero border-radius

### Task 3.3 — Update color references
- [ ] Find/replace `var(--surface)` where panels should be warmer → `var(--panel)` where appropriate
- [ ] Update `.toast` backgrounds to use new surface colors
- [ ] Update `.status-banner.open` → `background: rgba(90,138,60,0.2); color: var(--green2);`
- [ ] Update `.status-banner.closed` → `background: rgba(139,32,32,0.15); color: var(--red);`
- [ ] Stat chips: `background: var(--surface2)` with px-box borders

---

## Phase 4 — Café Canvas Scene

### Task 4.1 — Add canvas element to index.html
**File:** `templates/game/index.html`

- [ ] Replace centre panel content (currently `tab-inventory` / `tab-orders` side-by-side) with:
  ```html
  <div id="cafe-scene" style="position:relative; flex:1; overflow:hidden;">
    <canvas id="cafe-canvas" width="700" height="460"></canvas>
    <div id="popup-overlay">...</div>
  </div>
  ```
- [ ] Move inventory + orders tabs to RIGHT panel (merge with existing right panel, 
  or add as popup via sidebar tab)
- [ ] Keep existing left panel for ovens/baking/recipes (now as popups OR keep sidebar)

### Task 4.2 — Write café canvas renderer
**File:** `static/js/cafe-scene.js` (NEW FILE)

- [ ] Create `/static/js/cafe-scene.js`
- [ ] Implement `drawFloor()` — checkerboard 22px tiles
- [ ] Implement `drawWalls()` — back wall, 4 windows with curtains, sign
- [ ] Implement `drawKitchen()` — right 30%, oven cards with glow animation, prep counter
- [ ] Implement `drawCounter()` — checkout counter with register glow
- [ ] Implement `drawTable(x,y)` + `drawChair(x,y)` — pixel art
- [ ] Implement `drawPlant(x,y)`
- [ ] Define table layout: 6 tables in 2 rows
- [ ] Implement `Customer` class:
  - Properties: x, y, color, state, target, bobOffset, food emoji, tableIdx
  - States: `entering → ordering → waiting → eating → paying → leaving`
  - `update()`: move toward target, advance state on timer
  - `draw()`: 10px pixel humanoid with shadow, floating emoji indicator
- [ ] Implement `Worker` sprite class (cashier + baker, white uniform)
- [ ] Implement `Baker` class with patrol between ovens
- [ ] Customer spawn logic: spawn every 120–180 frames, max 5 simultaneous
- [ ] `drawOrderHUD()` — bottom-right overlay showing active order count
- [ ] Export `startCafeScene(canvas)` function
- [ ] `requestAnimationFrame` loop, 60fps target

### Task 4.3 — Wire cafe scene to game state
**File:** `static/js/game.js`

- [ ] On `render()`: call `updateCafeScene(G)` to sync customer count with pending orders
- [ ] `updateCafeScene`: if `G.orders.length > currentCustomers`, spawn new customer
- [ ] Customer state `eating` maps to orders with status `pending` (waiting for serve)
- [ ] When order fulfilled: set matching customer to `paying` state

---

## Phase 5 — Popup System

### Task 5.1 — Add popup overlay HTML
**File:** `templates/game/index.html`

- [ ] Inside `#cafe-scene`, add:
  ```html
  <div id="popup-overlay" onclick="if(event.target===this)closePopup()">
    <div id="active-popup"></div>
  </div>
  ```
- [ ] CSS for overlay: `position:absolute; inset:0; background:rgba(8,4,2,.75); 
  backdrop-filter:blur(3px); display:none; align-items:center; justify-content:center; z-index:10;`
- [ ] CSS for `.popup-open` class that sets `display:flex`

### Task 5.2 — Popup system JS
**File:** `static/js/game.js`

- [ ] Add `showPopup(type, content)` function:
  - Adds `.popup-open` to overlay
  - Sets `#active-popup` innerHTML
  - Traps focus inside popup
- [ ] Add `closePopup()` function:
  - Removes `.popup-open`
  - Clears `#active-popup`
  - Resets active sidebar tab to 🏠
- [ ] Wire sidebar tabs to `showPopup(type)`
- [ ] Existing modals (bake, hire, fire, worker detail) → migrate to popup system

### Task 5.3 — Sidebar icon tabs HTML
**File:** `templates/game/index.html`

- [ ] Replace left panel tab buttons with vertical icon sidebar:
  ```html
  <div id="sidebar">
    <div class="tab-icon active" data-tab="cafe" title="Café View">🏠</div>
    <div class="tab-icon" data-tab="kitchen" title="Kitchen">🔥</div>
    <div class="tab-icon" data-tab="orders" title="Orders">🛎</div>
    <div class="tab-icon" data-tab="shelf" title="Shelf">🍰</div>
    <div class="tab-icon" data-tab="staff" title="Staff">👥</div>
    <div class="tab-icon" data-tab="shop" title="Shop">🛒</div>
    <div class="tab-icon" data-tab="history" title="History">📊</div>
  </div>
  ```
- [ ] CSS: sidebar 48px wide, icon buttons 40×40px, gold on active

---

## Phase 6 — Workers Tab Redesign

### Task 6.1 — Worker grid popup HTML builder
**File:** `static/js/game.js`

- [ ] Write `buildWorkerGridPopup()` → returns HTML string:
  - Header: "👥 Staff (N workers)"
  - Scrollable grid of compact worker cards
  - Each card: avatar circle (initials + role icon), name, role badge, stars, 
    trait badges (pos green, neg red), XP bar, morale bar, salary
  - Click card → `showWorkerDetail(workerId)`
  - Bottom: "➕ Hire Staff" button

### Task 6.2 — Worker detail popup HTML builder

- [ ] Write `buildWorkerDetailPopup(worker)` → returns HTML string:
  - Back arrow button
  - Large avatar, name, role, level, morale emoji + bar
  - Traits section: positive (green chip) + negative (red chip) with descriptions
  - Skills section: for each skill in `ROLE_SKILLS[role]`, show name + 5-pip mastery bar + level name
  - Minigame section (bakers only): shows clock speed and perfect zone bonuses from mastery
  - Controls: oven assign + work mode (bakers), course button, fire button
- [ ] Add `showWorkerDetail(id)` JS function that calls `showPopup` with detail HTML

### Task 6.3 — Hire pool popup update

- [ ] Update `buildHirePoolPopup()` to include trait badges on each hire card
- [ ] Show `positive_trait` (green) and `negative_trait` (red) prominently

---

## Phase 7 — Baking Minigame

### Task 7.1 — Option A: Full minigame (free oven click)
**File:** `static/js/game.js`

- [ ] Write `buildBakeMinigamePopup(ovenId)` → returns HTML for full 4-step flow
- [ ] Step 1 — Mix:
  - Show ingredient slots in required order (from recipe data)
  - Click each to add — wrong order shows shake animation + hint
  - All added → enable Next button
  - Worker's `mixing_technique` mastery: levels 1–4 widen tolerance, level 5 auto-completes
- [ ] Step 2 — Shape:
  - 4 shape buttons (round, square, heart, star)
  - Each gives % bonus shown in right panel
  - Worker's `dough_shaping` mastery: level 5 auto-selects best shape
- [ ] Step 3 — Decorate:
  - 8 decoration grid, pick up to 2 (3 if `decoration_eye` Lv.3+)
  - Preview canvas updates with chosen decos
  - Each deco: +5% sell price bonus
  - Worker's `decoration_eye` mastery: level 5 auto-applies best combo
- [ ] Step 4 — Oven clock:
  - Clock canvas 160×160, zones: Raw → Good (green) → Perfect (gold) → Good → Burnt (red sweep)
  - Clock speed modified by worker's `oven_instinct` mastery:
    ```
    Lv1: 1.0x speed  Lv2: 0.95x  Lv3: 0.85x  Lv4: 0.70x  Lv5: auto-pull at perfect
    ```
  - Perfect zone width modified by mastery:
    ```
    Lv1: 15%  Lv2: +2%  Lv3: +5%  Lv4: +10%  Lv5: auto
    ```
  - "Pull Cake!" button → calculates result → shows in right panel
  - Result sent to API: `POST /api/bake/` with `{manual: true, result: 'perfect'|'good'|'burnt'}`

### Task 7.2 — Option B: Clock only (worker's oven)
**File:** `static/js/game.js`

- [ ] When player clicks an oven that has a worker baking:
  - Show popup with ONLY the oven clock (same canvas as step 4 above)
  - Title: "🔥 {Worker name} is baking — take over timing?"
  - Clock already in progress (synced to `bake_finish_at` remaining time)
  - "Pull Cake!" sends `POST /api/take-over-bake/` with oven_id + result
- [ ] API endpoint: `api_take_over_bake` — applies result multiplier to current baking cake's 
  final revenue when it completes

### Task 7.3 — API changes for minigame results
**File:** `game/views.py` + `game/game_engine.py` + `game/urls.py`

- [ ] Add `manual_result` optional param to `start_baking()`:
  ```python
  # If manual_result provided, store on BakedCake for revenue calc
  cake.manual_result = manual_result  # 'perfect'|'good'|'overdone'|'burnt'
  ```
- [ ] Add `manual_result_mult` field to `BakedCake` model (FloatField, default=1.0)
- [ ] In `fulfill_order()`: multiply revenue by `cake.manual_result_mult`
- [ ] Add `api_take_over_bake` view + URL

---

## Phase 8 — Drinks Category

### Task 8.1 — Add Drink model + brew station
**File:** `game/models.py`

- [ ] Add `DrinkRecipe` model:
  ```python
  class DrinkRecipe(models.Model):
      name = models.CharField(max_length=100)
      emoji = models.CharField(max_length=10, default='☕')
      brew_time_sec = models.IntegerField(default=15)
      price = models.DecimalField(max_digits=6, decimal_places=2, default=5.00)
      ingredient_cost_pct = models.FloatField(default=0.20)
      is_unlocked = models.BooleanField(default=False)
      is_starter = models.BooleanField(default=False)
  ```
- [ ] Add `BrewStation` model (similar to `Oven` but for drinks):
  ```python
  class BrewStation(models.Model):
      game_state = models.ForeignKey(GameState, ...)
      name = models.CharField(max_length=100)
      is_active = models.BooleanField(default=True)
      purchased_on_day = models.IntegerField(default=1)
      cost = models.DecimalField(...)
  ```
- [ ] Run `makemigrations` + `migrate`

### Task 8.2 — Seed drink recipes
**File:** `game/management/commands/seed_recipes.py`

- [ ] Add `DRINKS` list to seed command:
  ```python
  DRINKS = [
    {'name':'Espresso','emoji':'☕','brew_time_sec':8,'price':4.00,'is_unlocked':True,'is_starter':True},
    {'name':'Latte','emoji':'☕','brew_time_sec':12,'price':6.00,'is_unlocked':True,'is_starter':True},
    {'name':'Hot Chocolate','emoji':'🍫','brew_time_sec':15,'price':5.50,'is_unlocked':False},
    {'name':'Lemonade','emoji':'🍋','brew_time_sec':10,'price':4.50,'is_unlocked':False},
    {'name':'Matcha Latte','emoji':'🍵','brew_time_sec':18,'price':7.00,'is_unlocked':False},
    {'name':'Cold Brew','emoji':'🧊','brew_time_sec':5,'price':6.50,'is_unlocked':False},
  ]
  ```
- [ ] Run `python manage.py seed_recipes` to include drinks

### Task 8.3 — Add Barista role
**File:** `game/models.py` + `game/game_engine.py`

- [ ] Add `'barista'` to `ROLE_CHOICES` in `Worker` + `HireableWorker`
- [ ] Add barista to `SALARY_RANGES` in `game_engine.py`
- [ ] In `_worker_tick`: if `worker.role == 'barista'` → auto-brew on assigned brew station
- [ ] Add `KITCHEN_UPGRADES['brew_station']` entry: `cost: 350`

### Task 8.4 — Add 6 new cake recipes to seed
**File:** `game/management/commands/seed_recipes.py`

- [ ] Add to `RECIPES` list:
  - Carrot Cake 🥕 — day 12, $160 shop price
  - Tiramisu 🍰 — day 14, $200 shop price
  - Black Forest 🍒 — rep 55 unlock
  - Mango Mousse 🥭 — day 18, $280 shop price
  - Pistachio Roll 🌿 — rep 70 unlock
  - Cotton Candy Cake 🩷 — day 25, $400 shop price

---

## Phase 9 — Activity Log Mailbox

### Task 9.1 — Backend: mark important events
**File:** `game/game_engine.py`

- [ ] Add `is_important` boolean to `log_event()` call signature (default False)
- [ ] Mark as important: hiring, firing, level-ups, course completions, daily events
- [ ] Add `is_important` field to `EventLog` model (BooleanField, default=False)
- [ ] Run `makemigrations` + `migrate`

### Task 9.2 — Frontend: mailbox unread counter
**File:** `static/js/game.js`

- [ ] Track `_lastReadEventId` (integer, 0 initially) — persisted in `sessionStorage`
- [ ] `renderNotificationBadge()`: count events where `is_important=true` AND `id > _lastReadEventId`
- [ ] `toggleNotifications()`:
  - Open panel → set `_lastReadEventId` to max event id in current log
  - Call `renderNotificationBadge()` immediately → badge clears
  - Save `_lastReadEventId` to `sessionStorage`
- [ ] Notification panel: two sections — "📢 Important" (filtered) + "📋 All Activity"
- [ ] EventLog `to_dict()` includes `is_important` field

---

## Phase 10 — Integration & Polish

### Task 10.1 — Update get_full_state()
**File:** `game/game_engine.py`

- [ ] Add `drink_recipes`, `brew_stations` to `get_full_state()` return dict
- [ ] Ensure all new model fields serialised in their `to_dict()` methods

### Task 10.2 — Update index.html structure
**File:** `templates/game/index.html`

- [ ] Final 3-column layout:
  - Left: 48px icon sidebar
  - Centre: café canvas (fills remaining space)
  - Right: 220px always-visible panel (orders + baking status)
- [ ] Remove old tab-bar based left/centre/right layout
- [ ] Add `<script src="{% static 'js/cafe-scene.js' %}"></script>` before `game.js`
- [ ] Remove unused modal HTML (replaced by popup system)
- [ ] Keep fire-worker modal (safety confirm — not a popup)

### Task 10.3 — Smoke test checklist
- [ ] Start new game → see café canvas animating
- [ ] Open store → customers appear
- [ ] Click sidebar tabs → popups open over blurred canvas
- [ ] Hire worker with traits → traits visible in hire pool and worker card
- [ ] Click free oven → full baking minigame (all 4 steps)
- [ ] Click worker's oven → clock-only popup
- [ ] Worker morale updates after end of day
- [ ] Activity log badge clears on open
- [ ] Drinks visible in recipe tab
- [ ] Barista auto-brews on brew station
- [ ] No console errors

---

## Execution Order

```
Phase 0 (backup)
→ Phase 1 (bugs — isolated, safe)
→ Phase 2 (model changes — DB)
→ Phase 3 (CSS — visual only, no logic)
→ Phase 4 (canvas scene — additive)
→ Phase 5 (popup system — replaces modals)
→ Phase 6 (workers tab)
→ Phase 7 (baking minigame)
→ Phase 8 (drinks)
→ Phase 9 (activity log)
→ Phase 10 (integration)
```

**Each phase is independently testable. Do not proceed to next phase if current phase has errors.**

---

## Risk Notes

- Phase 4 canvas: if performance is poor on low-end devices, cap sprite count to 4 and reduce tile detail
- Phase 7 Option B (take-over-bake): requires careful timing sync with server `bake_finish_at` — 
  use `secsFrom()` helper already in game.js
- Phase 8 BrewStation: keep scope minimal — same pattern as Oven, just faster and no size selection
- SQLite is fine for single-player. Multiplayer (PostgreSQL) is Phase D — NOT in this plan.



Critical Backend Issues (Must Fix for Production)
1. The Global Variable Trap (_last_tick_time)
In game_engine.py, you are using a Python global variable _last_tick_time to track worker execution.

The Reality: In a production environment (like Heroku, AWS, or DigitalOcean), Django runs on a WSGI server (like Gunicorn) using multiple parallel workers (processes). Each worker has its own isolated memory.

The Bug: Worker A handles a tick and updates _last_tick_time. But the next request might go to Worker B, where _last_tick_time is still None. This will cause your workers to gain XP and bake cakes at wildly erratic speeds.

The Fix: You must store the last_tick_time in your GameState database model so it is persistent and shared across all server processes.

2. The Self-Inflicted DDoS (Polling Rate)
In game.js, you have this loop: pollTimer = setInterval(poll, 500);

The Reality: Every 500ms, the frontend hits /api/tick/. When that finishes, it immediately hits /api/state/. That is 4 HTTP requests per second, per active player. If you get just 100 players, your Django server will be slammed with 400 requests per second. Your database will likely crash.

The Fix: * Short term: Increase the polling interval to 2000ms (2 seconds) or 3000ms. Handle the smooth visual countdowns entirely in JavaScript (which you are already doing nicely in startAnimationLoop()).

Long term: Look into Django Channels (WebSockets). Instead of the client asking the server "Did anything happen?" 4 times a second, a WebSocket keeps a connection open and the server pushes an update only when a cake finishes baking or a customer arrives.

🛠️ Frontend & Code Quality Improvements
1. Heavy DOM Manipulation (innerHTML)
In game.js, your render() functions (like renderOvens and renderStaff) make heavy use of string interpolation assigned to .innerHTML.

While totally fine for a v1, replacing massive chunks of HTML on every poll destroys existing DOM nodes and recreates them. This can cause memory leaks, interrupt CSS animations, and create UI jitter.

You've done a good job mitigating this by checking existing.has(ov.id), but moving forward, consider a lightweight reactive framework like Vue.js or Alpine.js. They handle DOM diffing automatically, ensuring only the exact text node that changed (like a timer) gets updated.

2. Thread-Local Context (_inject_user)
You used threading.local() to pass the request.user into the engine without passing it as an argument to every function.

This is a clever hack, but it can be dangerous. If a view crashes halfway through, the thread might be returned to the pool with the old user still attached to _local.user. The next request on that thread could accidentally manipulate the previous user's game state.

The Fix: Since Django handles routing, it's safer to explicitly pass user (or the GameState instance) to your engine functions. E.g., engine.tick(state=request.user.game_state). It's slightly more typing, but 100% bug-proof.