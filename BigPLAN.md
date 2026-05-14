# Complete Game Upgrade Plan Before Deployment Prep

## Summary
Keep **Django** as the backend/admin/multiplayer state system, and rebuild the playable café layer as a proper **Phaser 2D game client**. The plan covers the crash, restaurant simulation, customer queue logic, brew station, workers, animations, pixel assets, multiplayer-safe state flow, performance, testing, and common 2D game failure modes. After this plan is finished, the main remaining work should be deployment hardening.

References used: [Phaser Scenes](https://docs.phaser.io/phaser/concepts/scenes), [Phaser Animations](https://docs.phaser.io/phaser/concepts/animations), [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), [MDN 2D Collision](https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection), [MDN Canvas Optimization](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), [Django Channels](https://channels.readthedocs.io/), [Valve Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking).

## Phase 1: Critical Backend Fixes
- Fix `POST /api/end-day/` crash by converting salary/hire config values to integers before `random.randint()`.
- Add `barista` to `HireableWorker.ROLE_CHOICES`, because hire generation already creates baristas.
- Add defensive validation for salary ranges:
  - min cannot exceed max.
  - skill level must be 1-3.
  - missing role/star config falls back to known safe defaults.
- Add regression tests for `refresh_hire_pool()`, `end_day()`, and salary configs loaded from DB.
- Confirm `python manage.py check` and `python manage.py migrate` pass.

## Phase 2: Game Architecture Upgrade
- Keep Django as the authoritative server for:
  - player state
  - money/reputation/day
  - shelf/inventory
  - workers
  - recipes/drinks
  - ovens/brew stations
  - orders/customers
  - admin actions
- Add a Phaser-powered game scene for the café.
- Keep HTML panels for admin-like controls only where useful, but make the main café experience a real animated scene.
- Phaser scene structure:
  - `BootScene`: load config and safe defaults.
  - `PreloadScene`: load spritesheets, atlases, UI icons, sounds.
  - `CafeScene`: restaurant gameplay.
  - `OverlayScene`: order bubbles, upgrade cinematic, notifications.
  - `DebugScene`: optional dev-only state inspector.
- Use Phaser animations and texture atlases for characters and stations instead of emoji/hard-drawn humanoids.
- Use fixed timestep/state interpolation so animation speed does not change on slow or fast monitors.

## Phase 3: Server-Authoritative Restaurant Simulation
- Add a clear customer lifecycle:
  - `entering`
  - `queued`
  - `ordering`
  - `waiting_for_food`
  - `seated`
  - `ready_to_serve`
  - `paying`
  - `fulfilled`
  - `left`
  - `expired`
  - `canceled`
- Extend `CustomerOrder` or add `CustomerVisit` for visual/state logic.
- Add fields for:
  - queue position
  - table assignment
  - station target
  - patience deadline
  - accepted/rejected status
  - whether the order needs kitchen work
  - whether the order can be fulfilled from shelf
- Never render fake customers. Every visible customer must map to a real server object.
- Make API actions idempotent:
  - fulfilling an already fulfilled order returns a safe message, not a crash.
  - accepting an order twice does not duplicate it.
  - expired customers cannot be served.
- Server remains source of truth; client only animates toward server state.

## Phase 4: Queue, Tables, And Order Line Logic
- Starting restaurant:
  - 2 tables
  - 1 cashier stand
  - 1 kitchen
  - 1 starter oven
  - max 3 ovens at first
  - no brew station at start
- Add cashier queue:
  - customers wait in a visible line.
  - only the first customer can order/checkout.
  - if no cashier is hired, the player manually handles the queue.
  - each cashier increases service capacity/speed.
- Add tables:
  - customers whose order is not ready can wait at tables.
  - if all tables are full, the customer leaves and the order is canceled.
  - waiters can seat customers faster and deliver ready orders.
- Add order visibility:
  - order bubble above customer.
  - kitchen ticket when item is not on shelf.
  - table icon when seated.
  - impatience indicator near timeout.
- Add cancel logic:
  - customer leaves if patience reaches zero.
  - customer leaves immediately if no table is available for a wait-required order.
  - reputation penalty depends on customer type and wait stage.

## Phase 5: Order Frequency And Balance
- Replace current aggressive order interval with admin-editable balance values:
  - early game base interval: 35-70 seconds.
  - mid game: 25-50 seconds.
  - late game: 15-35 seconds.
- Add max active customer/order caps:
  - early game cap: 3 active customers.
  - cap grows with tables, reputation, staff, and upgrades.
- Add event multipliers carefully:
  - rush hour can speed orders, but must respect active customer cap.
  - festival increases demand but not beyond restaurant capacity.
- Add pacing rules:
  - no new customer if queue is full.
  - no new table-waiting order if no table exists.
  - no impossible recipe orders.
  - drink orders appear only after brew station exists.

## Phase 6: Brew Station System
- Keep `brew_station` as an upgrade.
- Before purchase:
  - no brew station in café scene.
  - no left-side Brew Station tab.
  - Upgrades panel clearly shows “Buy Brew Station to unlock drinks.”
- After purchase:
  - create `BrewStation`.
  - update game state.
  - show Brew Station tab.
  - render station in café scene.
  - unlock drink workflow.
- Add drink customer logic:
  - some customers order only drinks.
  - some order cake + drink combos.
  - baristas handle drink queue.
  - drinks can expire or lose freshness if left ready too long.
- Add admin controls for brew station:
  - grant station
  - remove station
  - finish brewing
  - clear stuck brewing drink

## Phase 7: Worker System Simplification
- Remove worker modes from the UI.
- Keep `work_mode` field temporarily for migration safety, but stop using it for player-facing logic.
- New role behavior:
  - Baker: handles kitchen tickets, then optional prep baking if idle.
  - Cashier: takes orders and payments.
  - Waiter: seats customers, delivers ready orders, increases patience.
  - Barista: handles drink queue.
  - Manager: buffs speed, morale, salary, and event recovery.
- Workers need visible actions:
  - walk to station
  - idle at station
  - carry cake/drink
  - serve customer
  - celebrate level-up
  - unhappy/low morale state
- Add stuck-worker recovery:
  - if worker target object disappears, reset worker to idle.
  - if assigned oven/station belongs to another player, block it server-side.

## Phase 8: Upgrades, Furniture, And Expansion
- Add upgrade categories:
  - Kitchen: ovens, mixer, fridge, speed, ingredients.
  - Front room: tables, chairs, cashier stand, display case.
  - Drinks: brew station, faster brewing, premium drinks.
  - Staff: training, morale, uniforms, hiring board.
- Add furniture state:
  - `RestaurantTable`
  - `CashierStand`
  - `StationPlacement` or simple layout slots
- Upgrade effects must affect both backend and scene:
  - buying table increases seating capacity and shows new table.
  - buying cashier stand increases service lanes and shows new stand.
  - oven upgrades animate the target oven.
  - fridge/display case modifies freshness and shelf visuals.
- Add upgrade cinematic:
  - pause input.
  - camera pans/zooms to target.
  - sparkle/shine animation.
  - short confirmation banner.
  - resume gameplay.

## Phase 9: Pixel Art Asset Pipeline
- Generate project-ready pixel art assets:
  - oven idle/baking/done/upgraded
  - brew station idle/brewing/done
  - cashier stand
  - cake display shelf
  - tables/chairs
  - baker/cashier/waiter/barista
  - customer variants
  - cake and drink icons
  - sparkle, coin, smoke, steam, impatience, order bubble effects
- Store assets in `static/game_assets/`.
- Use spritesheets or texture atlases, because Phaser animation works cleanly with frame-based sprites.
- Define naming convention:
  - `worker_baker_walk`
  - `worker_baker_idle`
  - `customer_basic_walk`
  - `station_oven_baking`
  - `fx_upgrade_sparkle`
- Add fallback placeholder sprites so missing assets do not crash the scene.
- Add visual QA screenshots for:
  - empty restaurant
  - active queue
  - full tables
  - brew station purchased
  - upgrade cinematic
  - mobile/small viewport

## Phase 10: Animation And 2D Bug Prevention
- Use `requestAnimationFrame` through Phaser, not manual timers for movement.
- Separate simulation state from visual animation:
  - server decides what happened.
  - client interpolates how it looks.
- Avoid common 2D bugs:
  - ghost customers: render only server-backed entities.
  - animation drift: use delta time/timestep.
  - overlapping sprites: fixed layout slots and depth sorting.
  - stuck characters: path target timeout and fallback idle state.
  - missing sprites: fallback texture and console warning.
  - flicker on state refresh: preserve entity IDs and tween to new positions.
  - double fulfill: idempotent backend actions.
  - stale UI after purchase: always refresh state after successful action.
  - offscreen UI: responsive camera bounds and safe UI zones.
- Add collision/pathing rules:
  - simple grid or waypoint paths.
  - queue slots are reserved positions.
  - table slots are reserved positions.
  - workers and customers do not need perfect physics; use AABB hitboxes only where interaction needs it.

## Phase 11: Multiplayer Readiness
- Keep every player’s restaurant isolated by `GameState`.
- Every query must filter by current player `game_state`.
- Server-authoritative action flow:
  - client sends intent.
  - server validates.
  - server updates DB.
  - client receives new state.
- Add action versioning:
  - state includes `state_version` or `updated_at`.
  - stale client actions are rejected or safely rechecked.
- Keep polling initially if simpler, but prepare for Django Channels:
  - WebSocket group per player/store.
  - push order/customer events.
  - push admin interventions.
  - push day ended/game over events.
- Use interpolation for remote/server updates so visual movement is smooth even if updates arrive late.
- Do not trust client money, inventory, order status, worker assignment, or timers.

## Phase 12: Admin Control Room Expansion
- Add admin visibility for:
  - customer visits
  - queue
  - tables
  - brew stations
  - brewing drinks
  - furniture/upgrades
  - active kitchen tickets
  - stuck workers/customers
- Add admin recovery actions:
  - clear stuck queue
  - seat customer
  - force customer leave
  - fulfill/cancel order
  - finish baking
  - finish brewing
  - grant/remove table
  - grant/remove brew station
  - reset scene state without resetting player progress
- Add admin analytics:
  - average wait time
  - canceled orders by reason
  - table utilization
  - cashier bottleneck rate
  - brew station usage
  - most failed recipes
  - players stuck with no money/no shelf/no oven/no recipes
- Every risky admin action creates snapshot + action log.

## Phase 13: Testing Strategy
- Backend tests:
  - salary range float regression.
  - end day with DB configs.
  - hire pool with baristas.
  - order generation respects unlocked recipes.
  - no drink orders before brew station.
  - table full cancels waiting order.
  - queue serves first customer only.
  - worker cannot use another player’s station.
- Frontend/game tests:
  - Phaser scene boots.
  - missing sprite fallback works.
  - no customer appears with zero server customers.
  - customer keeps same visual entity across refreshes.
  - upgrade cinematic targets correct object.
  - brew station tab appears only after purchase.
- Browser smoke tests:
  - desktop viewport.
  - mobile viewport.
  - slow network simulation.
  - tab inactive/resume.
  - long day with many orders.
- Visual regression:
  - screenshot empty café.
  - screenshot active queue.
  - screenshot full restaurant.
  - screenshot upgrade animation frame.
  - screenshot brew station active.
- Admin smoke tests:
  - open player dashboard.
  - inspect queue/orders/tables/workers.
  - use snapshot.
  - restore snapshot.
  - perform recovery action.
  - confirm no personal account data is exposed beyond user reference.

## Phase 14: Performance And Stability
- Use texture atlases/spritesheets to reduce render overhead.
- Avoid hundreds of DOM nodes for moving game objects.
- Keep UI panels separate from the game canvas.
- Cap active animated entities.
- Destroy Phaser objects when server entity disappears.
- Add scene cleanup when leaving/reloading.
- Add asset preload progress and error handling.
- Add debug counters:
  - FPS
  - active sprites
  - active tweens
  - pending orders
  - queue length
  - server state age
- Add safe fallback if Phaser fails:
  - show normal panels and an error message.
  - do not block admin/game actions.

## Phase 15: Pre-Deploy Readiness
- Add environment config for debug/static/media.
- Confirm static collection includes Phaser and game assets.
- Add seed command for:
  - recipes
  - drinks
  - upgrades
  - salary ranges
  - balance configs
  - starter furniture
- Add database migration for new queue/table/customer fields.
- Add production-safe logging for game errors.
- Add admin-only debug tools disabled for normal players.
- Add final checklist:
  - migrations pass
  - tests pass
  - static assets collect
  - admin opens
  - game boots
  - new player can complete day 1
  - existing player data survives migration
  - multiplayer player isolation verified

## Assumptions
- We continue with Django + VS Code.
- Phaser is the chosen 2D client layer.
- The first implementation still starts with the `end_day` crash fix.
- The game should become server-authoritative and multiplayer-safe before deployment.
- Pixel art generation comes after the state model is stable, so art supports real gameplay instead of hiding broken logic.
