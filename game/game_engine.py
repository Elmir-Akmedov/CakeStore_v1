"""
game_engine.py — Phase 2 + auth + day-timer + BigPLAN Phase 1-8
Changes:
  - Phase 1: Fix random.randint crash (cast salary ranges to int)
  - Phase 1: Add barista role support
  - Phase 1: Defensive salary range validation (min <= max, valid levels)
  - Phase 3: Customer lifecycle states
  - Phase 5: Balance-driven order frequency
  - Phase 6: Brew station / barista queue
  - Phase 7: Worker role behaviour simplification
"""
import random
import threading
from datetime import timedelta
from decimal import Decimal
from collections import Counter

from django.conf import settings
from django.db import transaction
from django.db.utils import OperationalError, ProgrammingError
from django.db.models import Sum
from django.utils import timezone

from .models import (
    BakedCake, CakeRecipe, CustomerOrder, DayReport,
    GameState, Oven, Worker, HireableWorker, EventLog,
    OvenTypeConfig, KitchenUpgradeConfig, DailyEventConfig,
    WorkerSkillConfig, CustomerTypeConfig, CourseConfig,
    SalaryRangeConfig, GameBalanceConfig,
    BrewStation, BrewingDrink, DrinkRecipe,
    CUSTOMER_NAMES, SIZE_SLICES,
    SKILL_CATALOGUE, SKILL_RARITY_COLORS, SKILL_RARITY_LABELS,
    COURSE_CONFIG, HIRE_POOL_NAMES,
    CUSTOMER_TYPE_META, DAILY_EVENTS, KITCHEN_UPGRADES,
    WORKER_LEVEL_XP, WORKER_STAR_AT_LEVEL,
    POSITIVE_TRAITS, NEGATIVE_TRAITS,
    ROLE_SKILLS, SKILL_MASTERY_NAMES,
)

ALL_SIZES    = ['Small', 'Medium', 'Large']
SKILL_SIZES  = {1: ['Small'], 2: ['Small','Medium'], 3: ['Small','Medium','Large']}
OVEN_CATALOG = {
    'basic':      {'name':'Basic Oven',     'cost':200,  'speed_bonus':1.0,  'tier':'basic'},
    'pro':        {'name':'Pro Oven',        'cost':500,  'speed_bonus':1.5,  'tier':'pro'},
    'industrial': {'name':'Industrial Oven', 'cost':1200, 'speed_bonus':2.2,  'tier':'industrial'},
}

# Phase 1 fix: all salary ranges must be integers
SALARY_RANGES = {
    'baker':   {1:(100,150,30,50),   2:(150,400,50,90),  3:(400,900,90,150)},
    'cashier': {1:(80, 140,25,45),   2:(130,350,45,80),  3:(350,800,80,130)},
    'waiter':  {1:(80, 130,25,45),   2:(130,300,45,80),  3:(300,700,80,130)},
    'manager': {1:(200,400,60,90),   2:(400,800,90,140), 3:(800,1500,140,200)},
    # Phase 6: barista — unlocked after brew station purchase
    'barista': {1:(90, 150,28,48),   2:(150,380,48,88),  3:(380,850,88,145)},
}

RARITY_COST_PREMIUM = {
    'standard':  1.0,
    'rare':      1.30,
    'epic':      1.75,
    'legendary': 2.50,
    'unique':    4.00,
}


def _db_config_available(model):
    try:
        return model.objects.exists()
    except (OperationalError, ProgrammingError):
        return False


def get_balance_value(code, default=None, cast=None):
    try:
        row = GameBalanceConfig.objects.filter(code=code, is_enabled=True).first()
    except (OperationalError, ProgrammingError):
        row = None
    if not row:
        return default
    raw = row.value
    try:
        if cast:
            return cast(raw)
        if row.value_type == 'int':
            return int(raw)
        if row.value_type == 'float':
            return float(raw)
        if row.value_type == 'decimal':
            return D(raw)
        if row.value_type == 'json':
            return row.data
    except (TypeError, ValueError, ArithmeticError):
        return default
    return raw


def get_oven_catalog():
    if not _db_config_available(OvenTypeConfig):
        return OVEN_CATALOG
    rows = OvenTypeConfig.objects.filter(is_enabled=True).order_by('sort_order', 'code')
    catalog = {
        row.tier: {
            'name': row.name,
            'cost': float(row.cost),
            'speed_bonus': row.speed_bonus,
            'tier': row.tier,
        }
        for row in rows
    }
    return catalog


def get_kitchen_upgrades():
    if not _db_config_available(KitchenUpgradeConfig):
        return KITCHEN_UPGRADES
    rows = KitchenUpgradeConfig.objects.filter(is_enabled=True).order_by('sort_order', 'code')
    upgrades = {
        row.code: {
            'name': row.name,
            'emoji': row.emoji,
            'cost': float(row.cost),
            'desc': row.description,
        }
        for row in rows
    }
    return upgrades


def get_daily_events():
    if not _db_config_available(DailyEventConfig):
        return DAILY_EVENTS
    rows = DailyEventConfig.objects.filter(is_enabled=True, weight__gt=0).order_by('sort_order', 'code')
    events = [
        {
            'id': row.code,
            'icon': row.icon,
            'title': row.title,
            'msg': row.message,
            'type': row.event_type,
            'weight': row.weight,
            **(row.effect_data or {}),
        }
        for row in rows
    ]
    return events


def get_customer_type_meta():
    if not _db_config_available(CustomerTypeConfig):
        return CUSTOMER_TYPE_META
    rows = CustomerTypeConfig.objects.filter(is_enabled=True).order_by('sort_order', 'code')
    meta = {
        row.code: {
            'patience_mult': row.patience_mult,
            'tip_range': (row.tip_min, row.tip_max),
            'revenue_mult': row.revenue_mult,
            'icon': row.icon,
            'weight': row.weight,
            'rep_on_fail': row.rep_on_fail,
        }
        for row in rows
    }
    return meta


def get_course_config():
    if not _db_config_available(CourseConfig):
        return COURSE_CONFIG
    rows = CourseConfig.objects.filter(is_enabled=True).order_by('sort_order', 'code')
    courses = {
        (row.from_rarity, row.to_rarity): {
            'cost': float(row.cost),
            'days': row.days,
        }
        for row in rows
    }
    return courses


def get_worker_skill_catalogue():
    if not _db_config_available(WorkerSkillConfig):
        return SKILL_CATALOGUE
    rows = WorkerSkillConfig.objects.filter(is_enabled=True).order_by('sort_order', 'code')
    catalogue = {
        row.code: {
            'name': row.name,
            'role': row.role,
            'rarity': row.rarity,
            'desc': row.description,
            'effect': row.effect,
            'value': row.value,
            'negative': row.is_negative,
        }
        for row in rows
    }
    return catalogue


def get_salary_ranges():
    """Phase 1 fix: always cast to int to prevent random.randint crash."""
    if not _db_config_available(SalaryRangeConfig):
        return SALARY_RANGES
    ranges = {}
    for row in SalaryRangeConfig.objects.filter(is_enabled=True).order_by('sort_order', 'code'):
        hire_min = int(float(row.hire_cost_min))
        hire_max = int(float(row.hire_cost_max))
        sal_min  = int(float(row.salary_min))
        sal_max  = int(float(row.salary_max))
        # Defensive: min must not exceed max
        if hire_min > hire_max: hire_max = hire_min + 50
        if sal_min  > sal_max:  sal_max  = sal_min  + 20
        ranges.setdefault(row.role, {})[row.skill_level] = (
            hire_min, hire_max, sal_min, sal_max,
        )
    # Fall back to hardcoded if DB rows are missing critical roles
    for role in ('baker', 'cashier'):
        if role not in ranges:
            ranges.update(SALARY_RANGES)
            break
    return ranges


# ── Thread-local user context ──────────────────────────────────────────────────
_local = threading.local()

def set_current_user(user):
    _local.user = user

def get_current_user():
    return getattr(_local, 'user', None)

def _state():
    return GameState.get(get_current_user())


_last_tick_time = None


def D(v):
    return Decimal(str(v))


# ── Logging ───────────────────────────────────────────────────────────────────
def log_event(icon, message, log_type='info', day=None):
    state = _state()
    if day is None:
        day = state.day
    EventLog.objects.create(
        game_state=state, icon=icon, message=message, log_type=log_type, day=day)
    old = EventLog.objects.filter(game_state=state).order_by('-timestamp').values_list('id', flat=True)[50:]
    if old:
        EventLog.objects.filter(pk__in=list(old)).delete()


# ══════════════════════════════════════════════════════════════════
#  VALIDATION
# ══════════════════════════════════════════════════════════════════

def validate_size(size):
    if size not in ALL_SIZES:
        raise ValueError(f"Invalid size '{size}'.")

def validate_recipe(recipe_id):
    state = _state()
    try:
        recipe_id = int(recipe_id)
    except (TypeError, ValueError):
        raise ValueError("recipe_id must be an integer.")
    try:
        recipe = CakeRecipe.objects.get(pk=recipe_id)
    except CakeRecipe.DoesNotExist:
        raise ValueError(f"Recipe {recipe_id} not found or locked.")
    if not state.is_recipe_unlocked(recipe):
        raise ValueError(f"Recipe {recipe_id} not found or locked.")
    return recipe

def validate_oven(oven_id):
    state = _state()
    try:
        oven_id = int(oven_id)
    except (TypeError, ValueError):
        raise ValueError("oven_id must be an integer.")
    try:
        return Oven.objects.get(pk=oven_id, game_state=state, is_active=True)
    except Oven.DoesNotExist:
        raise ValueError(f"Oven {oven_id} not found.")

def validate_worker(worker_id):
    state = _state()
    try:
        worker_id = int(worker_id)
    except (TypeError, ValueError):
        raise ValueError("worker_id must be an integer.")
    try:
        return Worker.objects.get(pk=worker_id, game_state=state, is_active=True)
    except Worker.DoesNotExist:
        raise ValueError(f"Worker {worker_id} not found.")

def validate_oven_tier(tier):
    if tier not in get_oven_catalog():
        raise ValueError(f"Unknown oven tier '{tier}'.")

def validate_upgrade(uid):
    if uid not in get_kitchen_upgrades():
        raise ValueError(f"Unknown upgrade '{uid}'.")

def validate_hireable_worker(hw_id):
    state = _state()
    try:
        hw_id = int(hw_id)
    except (TypeError, ValueError):
        raise ValueError("hireable_worker_id must be an integer.")
    try:
        return HireableWorker.objects.get(pk=hw_id, game_state=state, is_hired=False)
    except HireableWorker.DoesNotExist:
        raise ValueError("This worker is no longer available.")

def validate_work_mode(mode):
    if mode not in ('orders_only', 'casual', 'cake_only'):
        raise ValueError(f"Invalid work_mode '{mode}'.")


# ══════════════════════════════════════════════════════════════════
#  RECIPE UNLOCK / SHOP
# ══════════════════════════════════════════════════════════════════

def check_recipe_unlocks():
    state   = _state()
    state.ensure_starter_recipes()
    locked  = CakeRecipe.objects.exclude(pk__in=state.unlocked_recipe_ids()).filter(is_starter=False)
    unlocked = []
    for recipe in locked:
        if recipe.shop_price is not None:
            continue
        day_ok = recipe.unlock_day is None or state.day >= recipe.unlock_day
        rep_ok = recipe.unlock_rep is None or state.reputation >= recipe.unlock_rep
        if day_ok and rep_ok:
            state.unlocked_recipes.add(recipe)
            unlocked.append(recipe.name)
            log_event('🔓', f'New recipe available: {recipe.name}!',
                      log_type='success', day=state.day)
    return unlocked


def unlocked_recipes_for(state):
    state.ensure_starter_recipes()
    return CakeRecipe.objects.filter(pk__in=state.unlocked_recipe_ids())


def buy_recipe(recipe_id):
    try:
        recipe_id = int(recipe_id)
    except (TypeError, ValueError):
        raise ValueError("Invalid recipe_id.")

    try:
        recipe = CakeRecipe.objects.get(pk=recipe_id)
    except CakeRecipe.DoesNotExist:
        raise ValueError("Recipe not found.")

    state = _state()
    if state.is_recipe_unlocked(recipe):
        raise ValueError(f"{recipe.name} is already unlocked.")

    if not recipe.can_be_purchased(state):
        raise ValueError(f"{recipe.name} is not available for purchase yet.")

    if float(state.money) < float(recipe.shop_price):
        raise ValueError(
            f"Need ${float(recipe.shop_price):.2f} to unlock {recipe.name}.")

    with transaction.atomic():
        s = GameState.objects.select_for_update().get(pk=state.pk)
        s.money -= D(recipe.shop_price)
        s.save(update_fields=['money'])
        s.unlocked_recipes.add(recipe)

    log_event(recipe.emoji, f'Unlocked recipe: {recipe.name}!',
              log_type='success', day=state.day)
    return {'ok': True, 'message': f'{recipe.name} unlocked!'}


# ══════════════════════════════════════════════════════════════════
#  DAILY EVENT
# ══════════════════════════════════════════════════════════════════

def roll_daily_event(state):
    event_chance = get_balance_value('event_roll_chance', 0.35, float)
    if random.random() > event_chance:
        return None

    daily_events = get_daily_events()
    if not daily_events:
        return None
    weights = [e['weight'] for e in daily_events]
    event   = random.choices(daily_events, weights=weights, k=1)[0]
    event   = dict(event)

    if event['id'] == 'oven_fault':
        ovens = list(Oven.objects.filter(game_state=state, is_active=True))
        if ovens:
            broken = random.choice(ovens)
            event['affected_oven_id']   = broken.pk
            event['affected_oven_name'] = broken.name

    if event['id'] == 'sick_day':
        bakers = list(Worker.objects.filter(game_state=state, role='baker', is_active=True))
        if bakers:
            sick = random.choice(bakers)
            event['sick_worker_id']   = sick.pk
            event['sick_worker_name'] = sick.name

    if event['id'] == 'rush_hour':
        state.rush_ends_at = timezone.now() + timedelta(seconds=60)

    if event['id'] == 'todays_guest':
        state.todays_guest_id = None

    if event['id'] == 'course_discount':
        state.course_discount_active = True

    state.active_event  = event
    state.event_counter = 0
    state.save(update_fields=[
        'active_event', 'event_counter', 'rush_ends_at',
        'course_discount_active'])

    log_event(event['icon'],
              f"{event['title']}: {event['msg']}",
              log_type='warning' if event['type'] == 'negative' else 'info',
              day=state.day)
    return event


# ══════════════════════════════════════════════════════════════════
#  WORKER XP
# ══════════════════════════════════════════════════════════════════

def award_worker_xp(worker, xp_amount):
    state  = _state()
    buffs  = state._get_manager_buffs()
    xp_amount = int(xp_amount * buffs.get('xp_mult', 1.0))

    worker.experience += xp_amount
    leveled_up = False
    new_star   = False

    while (worker.level < len(WORKER_LEVEL_XP) and
           worker.experience >= WORKER_LEVEL_XP[worker.level]):
        worker.level += 1
        leveled_up    = True
        if worker.level in WORKER_STAR_AT_LEVEL:
            new_lvl = WORKER_STAR_AT_LEVEL[worker.level]
            if new_lvl > worker.skill_level:
                worker.skill_level = new_lvl
                new_star = True

    worker.save(update_fields=['experience', 'level', 'skill_level'])

    if leveled_up:
        msg = f"{worker.name} reached Level {worker.level}!"
        if new_star:
            msg += f" Now ★{worker.skill_level}!"
        log_event('🌟', msg, log_type='success')
        return {'leveled_up': True, 'level': worker.level,
                'new_star': new_star, 'skill_level': worker.skill_level,
                'worker_name': worker.name}
    return None


# ══════════════════════════════════════════════════════════════════
#  COURSE SYSTEM
# ══════════════════════════════════════════════════════════════════

def start_course(worker_id):
    worker = validate_worker(worker_id)

    current_rarity = worker.skill_rarity or 'standard'
    rarity_order   = ['standard', 'rare', 'epic', 'legendary']

    if current_rarity not in rarity_order:
        raise ValueError("This worker's skill cannot be upgraded.")
    if current_rarity == 'legendary':
        raise ValueError("Legendary skills cannot be upgraded further.")
    if worker.skill_rarity == 'unique':
        raise ValueError("Unique skills cannot be upgraded.")

    idx         = rarity_order.index(current_rarity)
    target      = rarity_order[idx + 1]
    course_config = get_course_config()
    cfg         = course_config.get((current_rarity, target))
    if not cfg:
        raise ValueError("No course available for this upgrade path.")

    state = _state()
    cost  = cfg['cost']
    if state.course_discount_active:
        cost = round(cost * 0.70, 2)

    if float(state.money) < cost:
        raise ValueError(f"Need ${cost:.2f} for this course.")

    if worker.course_finish_day:
        raise ValueError(f"{worker.name} is already on a course.")

    with transaction.atomic():
        s = GameState.objects.select_for_update().get(pk=state.pk)
        s.money -= D(cost)
        s.save(update_fields=['money'])
        worker.course_target_rarity = target
        worker.course_finish_day    = state.day + cfg['days']
        worker.save(update_fields=['course_target_rarity', 'course_finish_day'])

    log_event('📚', f"{worker.name} started a course — upgrades to {target} in {cfg['days']} days.",
              log_type='info', day=state.day)
    return {'ok': True, 'message': f"{worker.name} is now on a {target} course!"}


def check_courses():
    state       = _state()
    graduating  = Worker.objects.filter(
        game_state=state,
        is_active=True,
        course_finish_day__lte=state.day,
        course_target_rarity__gt='',
    )
    results = []
    for worker in graduating:
        new_rarity = worker.course_target_rarity
        worker.skill_rarity          = new_rarity
        worker.course_target_rarity  = ''
        worker.course_finish_day     = None
        worker.save(update_fields=['skill_rarity', 'course_target_rarity', 'course_finish_day'])

        sc  = get_worker_skill_catalogue().get(worker.skill_id or '', {})
        log_event('🎓',
                  f"{worker.name} completed their course — skill upgraded to {new_rarity}!",
                  log_type='success', day=state.day)
        results.append({
            'worker_name':  worker.name,
            'new_rarity':   new_rarity,
            'skill_name':   sc.get('name', ''),
        })
    return results


# ══════════════════════════════════════════════════════════════════
#  TICK
# ══════════════════════════════════════════════════════════════════

def tick():
    global _last_tick_time

    state = _state()

    # Auto-end day if timer expired
    auto_ended = False
    if (state.is_open and state.day_end_at and
            timezone.now() >= state.day_end_at):
        try:
            result = end_day()
            auto_ended = True
            return {
                'newly_done':   [],
                'brewed_done':   [],
                'new_order':    None,
                'expired_count': 0,
                'new_unlocks':  [],
                'level_ups':    [],
                'courses_done': [],
                'auto_ended':   True,
                'report':       result.get('report'),
                'game_over':    result.get('game_over', False),
            }
        except Exception:
            pass

    newly_done   = _check_baking()
    brewed_done  = _check_brewing()
    new_unlocks  = check_recipe_unlocks()
    courses_done = check_courses()
    level_ups    = []

    now = timezone.now()
    if _last_tick_time is None or (now - _last_tick_time).total_seconds() >= 1.0:
        _last_tick_time = now
        level_ups = _worker_tick()

    new_order     = _maybe_generate_order()
    expired_count = _expire_orders()

    return {
        'newly_done':    newly_done,
        'brewed_done':   brewed_done,
        'new_order':     new_order,
        'expired_count': expired_count,
        'new_unlocks':   new_unlocks,
        'level_ups':     [lu for lu in level_ups if lu],
        'courses_done':  courses_done,
        'auto_ended':    False,
    }


def _check_baking():
    state = _state()
    now  = timezone.now()
    done = list(
    BakedCake.objects
    .filter(game_state=state, is_baking=True, bake_finish_at__lte=now)
    .select_related('recipe', 'oven')
    )
    if not done:
        return []

    with transaction.atomic():
        for cake in done:
            cake.is_baking  = False
            cake.baked_time = now
            cake.save(update_fields=['is_baking', 'baked_time'])
            if cake.oven_id:
                baker = Worker.objects.filter(
                    game_state=state,
                    assigned_oven_id=cake.oven_id, role='baker', is_active=True
                ).first()
                if baker:
                    award_worker_xp(baker, 2)
            log_event(cake.recipe.emoji,
                      f'{cake.recipe.name} ({cake.size}) is ready!',
                      log_type='success')

    return [{'cake_id': c.pk, 'name': c.recipe.name,
             'size': c.size, 'emoji': c.recipe.emoji} for c in done]


def _check_brewing():
    state = _state()
    now = timezone.now()
    done = list(
        BrewingDrink.objects
        .filter(game_state=state, is_brewing=True, brew_finish_at__lte=now)
        .select_related('recipe', 'station')
    )
    if not done:
        return []

    with transaction.atomic():
        for brew in done:
            brew.is_brewing = False
            brew.save(update_fields=['is_brewing'])
            log_event(brew.recipe.emoji, f'{brew.recipe.name} is ready!', log_type='success')

    return [brew.to_dict() for brew in done]


def _worker_tick():
    state = _state()
    if not state.is_open:
        return []

    workers   = list(Worker.objects.filter(game_state=state, is_active=True)
                     .select_related('assigned_oven', 'target_recipe'))
    level_ups = []
    sick_id   = (state.active_event or {}).get('sick_worker_id')

    for worker in workers:
        if sick_id and worker.pk == sick_id:
            continue

        if worker.role == 'cashier':
            lu = _worker_fulfill_order(worker, state)
            if lu:
                level_ups.append(lu)

        elif worker.role == 'baker':
            # Phase 7: simplified — cashier/baker split
            if worker.work_mode == 'orders_only':
                lu = _worker_fulfill_order(worker, state)
                if lu:
                    level_ups.append(lu)
            elif worker.work_mode == 'casual':
                fulfilled = _worker_fulfill_order(worker, state)
                if fulfilled is not None:
                    level_ups.append(fulfilled)
                else:
                    _auto_bake(worker, state)
            elif worker.work_mode == 'cake_only':
                _auto_bake(worker, state, force_recipe=worker.target_recipe)

        elif worker.role == 'waiter':
            sc = get_worker_skill_catalogue().get(worker.skill_id or '', {})
            if sc.get('effect') == 'auto_bump':
                _waiter_bump_urgent()

        elif worker.role == 'barista':
            station = BrewStation.objects.filter(game_state=state, is_active=True).first()
            if station and not station.is_busy:
                drinks = list(DrinkRecipe.objects.filter(is_unlocked=True))
                if drinks:
                    try:
                        start_brewing(random.choice(drinks).pk)
                        award_worker_xp(worker, 1)
                    except ValueError:
                        pass

    return level_ups


def _waiter_bump_urgent():
    state = _state()
    critical = (CustomerOrder.objects
                .filter(game_state=state, status='pending')
                .order_by('expires_at')
                .first())
    if critical and critical.seconds_remaining < 60:
        with transaction.atomic():
            o = CustomerOrder.objects.select_for_update().get(pk=critical.pk)
            o.expires_at += timedelta(seconds=30)
            o.save(update_fields=['expires_at'])


def _worker_fulfill_order(worker, state):
    if worker.role == 'baker':
        if not BakedCake.objects.filter(
                game_state=state, is_baking=False, remaining_slices__gt=0).exists():
            return None

    orders = (CustomerOrder.objects
              .filter(game_state=state, status='pending')
              .select_related('recipe')
              .order_by('expires_at'))

    sc = get_worker_skill_catalogue().get(worker.skill_id or '', {})
    if sc.get('effect') == 'vip_priority':
        vip_orders = orders.filter(customer_type__in=['vip', 'todays'])
        urgent_orders = orders.filter(order_type='urgent')
        combined = list(vip_orders) + list(urgent_orders) + list(orders)
        seen = set()
        orders_list = []
        for o in combined:
            if o.pk not in seen:
                seen.add(o.pk)
                orders_list.append(o)
    else:
        orders_list = list(orders)

    for order in orders_list:
        # --- THE PRE-FLIGHT FIX ---
        if order.quantity > 0:
            qs = BakedCake.objects.filter(
                game_state=state, recipe=order.recipe, size=order.size,
                is_baking=False, remaining_slices=SIZE_SLICES[order.size]
            )
            if order.want_fresh:
                days_fresh = 1 if state.has_upgrade('commercial_fridge') else 0
                qs = qs.filter(day_baked__gte=state.day - days_fresh)
            
            has_stock = qs.count() >= order.quantity
        else:
            qs = BakedCake.objects.filter(
                game_state=state, recipe=order.recipe,
                is_baking=False, remaining_slices__gt=0
            )
            if order.want_fresh:
                days_fresh = 1 if state.has_upgrade('commercial_fridge') else 0
                qs = qs.filter(day_baked__gte=state.day - days_fresh)
            
            total_slices = qs.aggregate(total=Sum('remaining_slices'))['total'] or 0
            has_stock = total_slices >= order.pieces
        # --- END OF FIX ---

        if not has_stock:
            continue
            
        result = fulfill_order(order.pk)
        if result['ok']:
            xp = {'urgent': 5, 'bulk': 4, 'standard': 3}.get(order.order_type, 3)
            if order.customer_type in ('vip', 'todays'):
                xp += 7
            return award_worker_xp(worker, xp)
            
    return None

def _auto_bake(worker, state, force_recipe=None):
    if not worker.assigned_oven_id:
        return
    try:
        oven = Oven.objects.get(pk=worker.assigned_oven_id, game_state=state, is_active=True)
    except Oven.DoesNotExist:
        return
    if oven.is_busy:
        return

    affected_oven = (state.active_event or {}).get('affected_oven_id')
    speed_penalty = 0.5 if affected_oven == oven.pk else 1.0

    allowed_sizes = SKILL_SIZES.get(worker.skill_level, ['Small'])
    buffs = state._get_manager_buffs()
    if buffs.get('star_buff'):
        allowed_sizes = SKILL_SIZES.get(min(3, worker.skill_level + 1), allowed_sizes)

    max_size = allowed_sizes[-1]

    if force_recipe:
        recipe = force_recipe
        size   = max_size
    else:
        needed = _most_needed_recipe(allowed_sizes, state)
        if needed:
            recipe, size = needed
        else:
            recipes = list(unlocked_recipes_for(state))
            if not recipes:
                return
            recipe = random.choice(recipes)
            size   = max_size

    ingredient_cost = round(
        recipe.get_price(size) * recipe.ingredient_cost_pct
        * state.ingredient_cost_mult, 2)
    if float(state.money) < ingredient_cost:
        return

    try:
        start_baking(recipe.pk, size, oven.pk, speed_penalty=speed_penalty)
    except ValueError:
        pass


def _most_needed_recipe(allowed_sizes, state):
    pending = (CustomerOrder.objects.filter(game_state=state, status='pending')
               .select_related('recipe').order_by('expires_at'))
    for order in pending:
        in_stock = BakedCake.objects.filter(
            game_state=state,
            recipe=order.recipe, is_baking=False, remaining_slices__gt=0).exists()
        if not in_stock:
            return (order.recipe, allowed_sizes[-1])
    return None


# ══════════════════════════════════════════════════════════════════
#  ORDER GENERATION (Phase 5: balance-driven frequency caps)
# ══════════════════════════════════════════════════════════════════

def _get_queue_state(state):
    pending = CustomerOrder.objects.filter(game_state=state, status='pending')
    return {
        'queue': pending.filter(lifecycle_state__in=['queued','ordering']).count(),
        'tables': pending.filter(lifecycle_state__in=['waiting_for_food','seated']).count(),
        'paying': pending.filter(lifecycle_state='paying').count(),
    }

def _maybe_generate_order():
    state = _state()
    if not state.is_open:
        return None
    if state.next_order_at is None or timezone.now() < state.next_order_at:
        return None
    qs = _get_queue_state(state)

    # No room in queue
    if qs['queue'] >= state.max_queue_size:
        with transaction.atomic():
            s = GameState.objects.select_for_update().get(pk=state.pk)
            s.next_order_at = timezone.now() + timedelta(seconds=8)
            s.save(update_fields=['next_order_at'])
        return None

    # Phase 5: balance-driven frequency
    if state.day <= 5:
        base_interval = random.randint(35, 70)
    elif state.day <= 20:
        base_interval = random.randint(25, 50)
    else:
        base_interval = random.randint(15, 35)
    interval = max(10, int(base_interval / max(0.5, state.order_frequency_mult)))

    # Phase 4: cap active customers by table + cashier count
    active_orders = CustomerOrder.objects.filter(game_state=state, status='pending').count()
    tables_count  = state.tables_count  # 2 base + upgrades
    cashiers      = Worker.objects.filter(game_state=state, role='cashier', is_active=True).count()
    max_customers = min(tables_count + cashiers + 2, 8)
    if active_orders >= max_customers:
        # Reschedule quickly but don't spawn
        with transaction.atomic():
            s = GameState.objects.select_for_update().get(pk=state.pk)
            s.next_order_at = timezone.now() + timedelta(seconds=max(2, interval // 2))
            s.save(update_fields=['next_order_at'])
        return None

    with transaction.atomic():
        s = GameState.objects.select_for_update().get(pk=state.pk)
        s.next_order_at = timezone.now() + timedelta(seconds=interval)
        s.save(update_fields=['next_order_at'])

    recipes = list(unlocked_recipes_for(state))
    has_brew = state.has_upgrade('brew_station')
    recipes = [r for r in recipes if not (getattr(r, 'requires_brew_station', False) and not has_brew)]
    if not recipes:
        return None

    active_event = state.active_event or {}
    spawn_todays = (
        active_event.get('id') == 'todays_guest'
        and state.todays_guest_id is None
        and random.random() < 0.3
    )

    customer_meta = get_customer_type_meta()
    if not customer_meta:
        return None

    if spawn_todays and 'todays' in customer_meta:
        ctype = 'todays'
        cmeta = customer_meta['todays']
    else:
        types   = [t for t in customer_meta if t != 'todays']
        if not types:
            return None
        weights = [customer_meta[t]['weight'] for t in types]
        ctype   = random.choices(types, weights=weights, k=1)[0]
        cmeta   = customer_meta[ctype]

    if active_event.get('id') == 'vip_party' and state.event_counter < 3 and 'vip' in customer_meta:
        ctype = 'vip'
        cmeta = customer_meta['vip']
        with transaction.atomic():
            s = GameState.objects.select_for_update().get(pk=state.pk)
            s.event_counter += 1
            s.save(update_fields=['event_counter'])

    recipe     = random.choice(recipes)
    size       = random.choice(ALL_SIZES)
    want_fresh = (ctype in ('picky', 'inspector', 'todays')) or random.random() < 0.20

    if ctype == 'bulk_buyer':
        order_type, quantity, pieces = 'bulk', random.randint(2, 4), 0
    elif ctype in ('impatient',):
        order_type, quantity, pieces = 'urgent', 1, 0
    elif ctype == 'todays':
        order_type, quantity, pieces = 'standard', 1, 0
    else:
        r = random.random()
        if r < 0.18:
            order_type, quantity, pieces = 'urgent', 1, 0
        elif r < 0.30:
            order_type = 'bulk'
            quantity   = random.randint(2, 3)
            pieces     = 0
        else:
            order_type = 'standard'
            quantity, pieces = (1, 0) if random.random() < 0.65 else (0, random.randint(1, SIZE_SLICES[size] // 2))

    # --- MOVED TABLE CHECK HERE ---
    # Order needs table but all full
    needs_table = order_type in ('bulk', 'standard')
    if needs_table and qs['tables'] >= state.tables_count:
        # Customer leaves immediately, no order created
        log_event('🚪', 'Customer left — no tables available.', log_type='warning')
        return None

    base_patience = {
        'urgent':   random.randint(60, 110),
        'bulk':     random.randint(280, 450),
        'standard': random.randint(160, 280),
    }[order_type]
    if ctype == 'todays':
        base_patience = 120

    patience = int(base_patience * cmeta['patience_mult'] * state.patience_mult)

    order = CustomerOrder.objects.create(
        game_state=state,
        customer_name=random.choice(CUSTOMER_NAMES),
        customer_type=ctype,
        recipe=recipe,
        size=size,
        quantity=quantity,
        pieces=pieces,
        want_fresh=want_fresh,
        order_type=order_type,
        expires_at=timezone.now() + timedelta(seconds=patience),
        day_placed=state.day,
    )
    queue_pos = CustomerOrder.objects.filter(
        game_state=state, status='pending',
        lifecycle_state__in=['queued','ordering']
    ).count()
    order.queue_position = queue_pos
    order.lifecycle_state = 'queued'
    order.save(update_fields=['queue_position', 'lifecycle_state'])

    if spawn_todays:
        with transaction.atomic():
            s = GameState.objects.select_for_update().get(pk=state.pk)
            s.todays_guest_id = order.pk
            s.save(update_fields=['todays_guest_id'])

    return order.to_dict(state)


def _expire_orders():
    state = _state()
    now = timezone.now()
    with transaction.atomic():
        expired = CustomerOrder.objects.select_for_update().filter(
            game_state=state, status='pending', expires_at__lte=now)
        count = expired.count()
        if count:
            has_spirit = Worker.objects.filter(
                game_state=state, role='waiter', is_active=True,
                skill_id='spirit_of_service').exists()
            if has_spirit:
                return 0

            s = GameState.objects.select_for_update().get(pk=state.pk)
            expired.update(status='expired', lifecycle_state='expired')
            # Re-number remaining queue positions
            remaining = CustomerOrder.objects.filter(
                game_state=state, status='pending',
                lifecycle_state__in=['queued','ordering']
            ).order_by('placed_at')
            for i, o in enumerate(remaining):
                o.queue_position = i
                o.save(update_fields=['queue_position'])

            rep_mult = 1.0
            waiters  = Worker.objects.filter(game_state=state, role='waiter', is_active=True)
            for w in waiters:
                sc = get_worker_skill_catalogue().get(w.skill_id or '', {})
                if sc.get('effect') == 'rep_loss_mult':
                    rep_mult *= sc['value']

            rep_hit = int(min(count * 3, 15) * rep_mult)

            todays_id = s.todays_guest_id
            if todays_id:
                todays_expired = CustomerOrder.objects.filter(
                    pk=todays_id, status='expired').exists()
                if todays_expired:
                    rep_hit = min(100, rep_hit + 15)
                    log_event('👑', "Today's Guest left unhappy! −15 extra reputation!",
                              log_type='error', day=s.day)

            s.reputation = max(0, s.reputation - rep_hit)
            s.save(update_fields=['reputation'])
            log_event('⏰', f'{count} order(s) expired — rep −{rep_hit}',
                      log_type='error', day=s.day)
    return count


# ══════════════════════════════════════════════════════════════════
#  BAKING
# ══════════════════════════════════════════════════════════════════

def start_baking(recipe_id, size, oven_id, speed_penalty=1.0, manual_result=None):
    oven   = validate_oven(oven_id)
    state  = _state()


    with transaction.atomic():
        oven = Oven.objects.select_for_update().get(pk=oven.pk)
        s    = GameState.objects.select_for_update().get(pk=state.pk)

        # FIX: If the oven is busy, don't crash with a 400! Complete the cake instead.
        if oven.is_busy:
            cake = BakedCake.objects.filter(game_state=state, oven=oven, is_baking=True).first()
            if cake:
                cake.is_baking = False
                cake.baked_time = timezone.now()
                if manual_result:
                    mult = {'perfect': 1.15, 'good': 1.0, 'underbaked': 0.90, 'burnt': 0.70}.get(manual_result, 1.0)
                    cake.manual_result_mult = mult
                cake.save(update_fields=['is_baking', 'baked_time', 'manual_result_mult'])
                
                # Reward worker assigned to it
                baker = oven.assigned_workers.filter(role='baker', is_active=True).first()
                if baker:
                    award_worker_xp(baker, 2)
                
                return {
                    'ok': True,
                    'message': f"Successfully pulled {cake.recipe.name} from the oven!",
                    'cake': cake.to_dict(s.day, s)
                }
            # Fallback if no active cake object was tracked cleanly
            return {'ok': True, 'message': 'Oven was cleared.'}
        
        recipe = validate_recipe(recipe_id)
        validate_size(size)

        ingredient_cost = round(
            recipe.get_price(size) * recipe.ingredient_cost_pct
            * s.ingredient_cost_mult, 2)

        if float(s.money) < ingredient_cost:
            raise ValueError(
                f"Need ${ingredient_cost:.2f}, have ${float(s.money):.2f}.")

        baker   = oven.assigned_workers.filter(role='baker', is_active=True).first()
        baker_f = baker.bake_time_factor if baker else 1.0
        buffs    = s._get_manager_buffs()
        baker_f /= buffs.get('global_speed', 1.0)

        base_sec = recipe.get_bake_seconds(size)
        duration = max(5, int(base_sec / oven.speed_bonus * baker_f * speed_penalty))

        s.money -= D(ingredient_cost)
        s.save(update_fields=['money'])
        oven.bakes_count += 1
        oven.save(update_fields=['bakes_count'])

        now  = timezone.now()
        cake = BakedCake.objects.create(
            game_state=state,
            recipe=recipe, size=size, is_baking=True,
            bake_finish_at=now + timedelta(seconds=duration),
            bake_duration_sec=duration,
            remaining_slices=SIZE_SLICES[size],
            oven=oven, day_baked=s.day,
            ingredient_cost=D(ingredient_cost),
        )
    if manual_result:
        mult = {'perfect':1.15,'good':1.0,'underbaked':0.90,'burnt':0.70}.get(manual_result,1.0)
        cake.manual_result_mult = mult
        cake.save(update_fields=['manual_result_mult'])
    log_event('🔥', f'Baking {recipe.name} ({size}) — {duration}s',
              log_type='info', day=state.day)
    return {
        'ok': True,
        'message': f'Baking {recipe.name} ({size}) — {duration}s',
        'cake': cake.to_dict(state.day, state),
        'duration': duration,
    }


# ══════════════════════════════════════════════════════════════════
#  FULFILL ORDER
# ══════════════════════════════════════════════════════════════════

def start_brewing(drink_id):
    state = _state()
    try:
        drink = DrinkRecipe.objects.get(pk=int(drink_id), is_unlocked=True)
    except (DrinkRecipe.DoesNotExist, TypeError, ValueError):
        raise ValueError("Drink not found or locked.")

    station = BrewStation.objects.filter(game_state=state, is_active=True).first()
    if not station:
        raise ValueError("No brew station. Buy one from Upgrades.")
    if station.is_busy:
        raise ValueError(f"{station.name} is already brewing.")

    cost = round(float(drink.price) * drink.ingredient_cost_pct, 2)
    with transaction.atomic():
        s = GameState.objects.select_for_update().get(pk=state.pk)
        if float(s.money) < cost:
            raise ValueError(f"Need ${cost:.2f}, have ${float(s.money):.2f}.")
        station = BrewStation.objects.select_for_update().get(pk=station.pk)
        if station.is_busy:
            raise ValueError(f"{station.name} is already brewing.")
        s.money -= D(cost)
        s.save(update_fields=['money'])
        station.brews_count += 1
        station.save(update_fields=['brews_count'])
        now = timezone.now()
        brew = BrewingDrink.objects.create(
            game_state=state,
            recipe=drink,
            station=station,
            is_brewing=True,
            brew_finish_at=now + timedelta(seconds=drink.brew_time_sec),
            brew_duration_sec=drink.brew_time_sec,
            day_brewed=s.day,
            ingredient_cost=D(cost),
        )

    log_event(drink.emoji, f'Brewing {drink.name} - {drink.brew_time_sec}s', log_type='info')
    return {'ok': True, 'message': f'Brewing {drink.name}!', 'brew': brew.to_dict()}


def fulfill_order(order_id):
    try:
        order_id = int(order_id)
    except (TypeError, ValueError):
        return {'ok': False, 'message': 'Invalid order ID.'}

    state = _state()

    with transaction.atomic():
        try:
            order = (CustomerOrder.objects
                    .select_related('recipe')
                    .get(pk=order_id, game_state=state, status='pending'))
        except CustomerOrder.DoesNotExist:
            return {'ok': False, 'message': 'Order not found or already processed.'}

        if order.seconds_remaining <= 0:
            order.status = 'expired'
            order.save(update_fields=['status'])
            return {'ok': False, 'message': 'This order just expired!'}

        s           = GameState.objects.select_for_update().get(pk=state.pk)
        current_day = s.day

        def shelf_whole():
            qs = (BakedCake.objects.select_for_update()
                  .filter(game_state=state, recipe=order.recipe, size=order.size,
                          is_baking=False, remaining_slices=SIZE_SLICES[order.size])
                  .order_by('baked_time'))
            if order.want_fresh:
                qs = qs.filter(day_baked__gte=current_day -
                               (1 if s.has_upgrade('commercial_fridge') else 0))
            return list(qs)

        def shelf_slices():
            qs = (BakedCake.objects.select_for_update()
                  .filter(game_state=state, recipe=order.recipe,
                          is_baking=False, remaining_slices__gt=0)
                  .order_by('remaining_slices', 'baked_time'))
            if order.want_fresh:
                qs = qs.filter(day_baked__gte=current_day -
                               (1 if s.has_upgrade('commercial_fridge') else 0))
            return list(qs)

        if order.quantity > 0:
            whole_cakes = shelf_whole()
            if len(whole_cakes) < order.quantity:
                tag = "fresh " if order.want_fresh else ""
                return {'ok': False, 'message': f'Not enough {tag}whole {order.recipe.name} ({order.size}) in stock.'}
            
            for i in range(order.quantity):
                whole_cakes[i].remaining_slices = 0
                whole_cakes[i].save(update_fields=['remaining_slices'])

        if order.pieces > 0:
            slice_cakes = shelf_slices()
            total_available = sum(c.remaining_slices for c in slice_cakes)
            if total_available < order.pieces:
                tag = "fresh " if order.want_fresh else ""
                return {'ok': False, 'message': f'Not enough {tag}slices of {order.recipe.name}.'}
            
            needed = order.pieces
            for cake in slice_cakes:
                if needed <= 0:
                    break
                take = min(cake.remaining_slices, needed)
                cake.remaining_slices -= take
                cake.save(update_fields=['remaining_slices'])
                needed -= take

        revenue = order.calculate_revenue(s)
        cakes_used = BakedCake.objects.filter(
            game_state=state, recipe=order.recipe,
            is_baking=False, manual_result_mult__lt=1.0
        ).first()
        if cakes_used:
            revenue = round(revenue * cakes_used.manual_result_mult, 2)

        if (s.active_event or {}).get('id') == 'blogger' and s.event_counter < 5:
            revenue *= 2
            s.event_counter += 1

        ctype     = get_customer_type_meta().get(order.customer_type, {})
        tip_range = ctype.get('tip_range', (0.05, 0.12))
        tip       = 0.0

        cashiers    = Worker.objects.filter(game_state=state, role='cashier', is_active=True)
        tip_chance  = 0.3
        tip_mult    = 1.0
        tip_always  = False
        for c in cashiers:
            sc = get_worker_skill_catalogue().get(c.skill_id or '', {})
            eff = sc.get('effect', '')
            if eff == 'tip_chance_bonus': tip_chance += sc['value']
            if eff == 'tip_mult':         tip_mult   *= sc['value']
            if eff == 'tip_always':
                tip_always = True
                tip_mult  *= sc['value']

        if tip_always or random.random() < min(0.95, tip_chance):
            tip_pct = random.uniform(*tip_range)
            tip     = round(revenue * tip_pct * tip_mult, 2)

        maestro_rep = sum(
            0.5 for w in Worker.objects.filter(game_state=state, role='waiter', is_active=True)
            if get_worker_skill_catalogue().get(w.skill_id or '', {}).get('effect') == 'rep_per_order'
        )

        total_earned = revenue + tip

        order.status = 'fulfilled'
        order.lifecycle_state = 'fulfilled'
        order.table_slot = None
        order.queue_position = None
        order.fulfilled_at = timezone.now()
        order.revenue = D(revenue)
        order.tip = D(tip)
        order.save(update_fields=['status','lifecycle_state', 'fulfilled_at', 'revenue', 'tip'])

        s.money           += D(total_earned)
        s.total_revenue   += D(total_earned)
        s.total_fulfilled += 1

        rep_gain = 0
        if order.want_fresh:
            rep_gain += 1
        if order.customer_type == 'vip':
            rep_gain += 5
        if order.customer_type == 'todays':
            rep_gain += 15
            log_event('👑',
                      f"Today's Guest {order.customer_name} was served! +15 reputation!",
                      log_type='success', day=s.day)
        rep_gain += int(maestro_rep)

        s.reputation = min(100, s.reputation + rep_gain)

        if (s.active_event or {}).get('id') == 'critic' and order.want_fresh:
            s.critic_fresh_served += 1
            if s.critic_fresh_served >= 10:
                s.reputation = min(100, s.reputation + 20)
                log_event('📰', 'Critic challenge complete! +20 reputation!',
                          log_type='success', day=s.day)

        s.save(update_fields=[
            'money', 'total_revenue', 'total_fulfilled', 'reputation',
            'event_counter', 'critic_fresh_served'])

    tip_msg = f" + ${tip:.2f} tip" if tip > 0 else ""
    icon    = ctype.get('icon', '✓') or '✓'
    log_event(icon,
              f"{order.customer_name} served — ${revenue:.2f}{tip_msg}",
              log_type='success', day=state.day)

    return {
        'ok':      True,
        'message': f'✓ Fulfilled! +${total_earned:.2f}{tip_msg}',
        'revenue': total_earned,
    }

def advance_customer_lifecycle(order_id):
    """Move a customer to the next lifecycle stage."""
    state = _state()
    order = CustomerOrder.objects.get(pk=order_id, game_state=state)
    transitions = {
        'queued': 'ordering',
        'ordering': 'waiting_for_food',
        'waiting_for_food': 'seated',
        'seated': 'paying',
    }
    next_state = transitions.get(order.lifecycle_state)
    if next_state:
        order.lifecycle_state = next_state
        order.save(update_fields=['lifecycle_state'])
    return {'ok': True, 'lifecycle_state': order.lifecycle_state}

def cancel_customer(order_id):
    state = _state()
    with transaction.atomic():
        order = CustomerOrder.objects.select_for_update().get(
            pk=order_id, game_state=state, status='pending')
        order.status = 'expired'
        order.lifecycle_state = 'canceled'
        order.table_slot = None
        order.save(update_fields=['status', 'lifecycle_state', 'table_slot'])
        # Rep penalty based on how far along they were
        penalty = {'queued': 1, 'ordering': 2, 'waiting_for_food': 4, 'seated': 3}.get(
            order.lifecycle_state, 2)
        s = GameState.objects.select_for_update().get(pk=state.pk)
        s.reputation = max(0, s.reputation - penalty)
        s.save(update_fields=['reputation'])
    return {'ok': True}

# ══════════════════════════════════════════════════════════════════
#  HIRE POOL (Phase 1: barista role added when brew station owned)
# ══════════════════════════════════════════════════════════════════

def _star_weights_for_day(day):
    if day <= 3:   return [1.00, 0.00, 0.00]
    if day <= 15:  return [0.92, 0.08, 0.00]
    if day <= 40:  return [0.68, 0.25, 0.07]
    return               [0.50, 0.35, 0.15]


def _pick_skill_for_role(role, star):
    candidates = [
        (sid, sc) for sid, sc in get_worker_skill_catalogue().items()
        if sc['role'] == role
    ]
    if not candidates:
        return '', 'standard'

    rarity_weights = {
        1: {'standard':88,'rare':10,'epic':1.5,'legendary':0.5,'unique':0},
        2: {'standard':60,'rare':28,'epic': 10,'legendary':2,  'unique':0},
        3: {'standard':35,'rare':35,'epic': 20,'legendary':9,  'unique':1},
    }[min(star, 3)]

    rarities = list(rarity_weights.keys())
    weights  = [rarity_weights[r] for r in rarities]
    chosen_rarity = random.choices(rarities, weights=weights, k=1)[0]

    matching = [(sid, sc) for sid, sc in candidates if sc['rarity'] == chosen_rarity]
    if not matching:
        matching = [(sid, sc) for sid, sc in candidates if sc['rarity'] == 'standard']
    if not matching:
        return '', 'standard'

    sid, sc = random.choice(matching)
    return sid, chosen_rarity


def _generate_hire_pool():
    state       = _state()
    day         = state.day
    weights     = _star_weights_for_day(day)
    stars       = [1, 2, 3]
    pool_size   = 4 if day <= 3 else (5 if day <= 15 else 6)
    refresh_ev  = 2 if day > 15 else 3
    expires_day = day + refresh_ev

    used_names = set(
        list(Worker.objects.filter(game_state=state, is_active=True).values_list('name', flat=True)) +
        list(HireableWorker.objects.filter(
            game_state=state, is_hired=False, expires_on_day__gt=day
        ).values_list('name', flat=True))
    )
    pool = [n for n in HIRE_POOL_NAMES if n not in used_names] or HIRE_POOL_NAMES
    random.shuffle(pool)
    pool = pool[:pool_size]

    # Phase 4/6: role weights depend on day and upgrades
    has_brew_station = state.has_upgrade('brew_station')
    if day <= 10:
        role_weights = {'baker': 50, 'cashier': 30, 'waiter': 15, 'manager': 5}
    else:
        role_weights = {'baker': 38, 'cashier': 20, 'waiter': 18, 'manager': 10,
                        'barista': 14 if has_brew_station else 0}
        # Remove zero-weight roles
        role_weights = {k: v for k, v in role_weights.items() if v > 0}

    salary_ranges = get_salary_ranges()

    for name in pool:
        star  = random.choices(stars, weights=weights, k=1)[0]
        role  = random.choices(
            list(role_weights.keys()),
            weights=list(role_weights.values()), k=1
        )[0]

        skill_id, skill_rarity = _pick_skill_for_role(role, star)
        pos_trait = random.choice(list(POSITIVE_TRAITS.keys()))
        neg_trait = random.choice(list(NEGATIVE_TRAITS.keys()))

        bake_speed    = random.randint(star, min(star + 1, 5))
        service_speed = random.randint(star, min(star + 1, 5))

        # Phase 1 fix: always get int ranges, with fallback
        role_ranges = salary_ranges.get(role) or salary_ranges.get('baker', {})
        star_ranges = role_ranges.get(star) or role_ranges.get(1, (80, 200, 25, 60))

        # Defensive: ensure all 4 values exist and are int
        while len(star_ranges) < 4:
            star_ranges = star_ranges + (star_ranges[-1],)

        hire_min, hire_max, sal_min, sal_max = (int(v) for v in star_ranges[:4])
        if hire_min > hire_max: hire_max = hire_min + 50
        if sal_min  > sal_max:  sal_max  = sal_min  + 20

        salary  = random.randint(sal_min,  sal_max)
        hire_c  = random.randint(hire_min, hire_max)
        hire_c  = round(hire_c * RARITY_COST_PREMIUM.get(skill_rarity, 1.0))

        HireableWorker.objects.create(
            game_state=state,
            name=name, role=role, skill_level=star,
            bake_speed=bake_speed, service_speed=service_speed,
            skill_id=skill_id, skill_rarity=skill_rarity,
            salary_per_day=D(salary), hire_cost=D(hire_c),
            available_from_day=day, expires_on_day=expires_day,
            positive_trait=pos_trait,
            negative_trait=neg_trait,
            is_hired=False,
        )


def refresh_hire_pool():
    state = _state()
    day   = state.day
    if state.pool_refreshed_day >= day:
        return
    HireableWorker.objects.filter(game_state=state, is_hired=False, expires_on_day__lte=day).delete()
    _generate_hire_pool()
    state.pool_refreshed_day = day
    state.save(update_fields=['pool_refreshed_day'])


def get_hire_pool(day):
    state = _state()
    return list(HireableWorker.objects
                .filter(game_state=state, is_hired=False, expires_on_day__gt=day)
                .order_by('skill_level', 'role'))


def hire_from_pool(hw_id):
    hw    = validate_hireable_worker(hw_id)
    state = _state()
    with transaction.atomic():
        hw    = HireableWorker.objects.select_for_update().get(pk=hw.pk)
        if hw.is_hired:
            raise ValueError("Already hired by someone else.")
        s = GameState.objects.select_for_update().get(pk=state.pk)
        if float(s.money) < float(hw.hire_cost):
            raise ValueError(
                f"Need ${float(hw.hire_cost):.2f}, have ${float(s.money):.2f}.")

        worker = Worker.objects.create(
            game_state=state,
            name=hw.name, role=hw.role, skill_level=hw.skill_level,
            bake_speed=hw.bake_speed, service_speed=hw.service_speed,
            skill_id=hw.skill_id, skill_rarity=hw.skill_rarity,
            salary_per_day=hw.salary_per_day, hired_on_day=s.day,
            positive_trait=hw.positive_trait,
            negative_trait=hw.negative_trait,
            skill_mastery={ROLE_SKILLS.get(hw.role, [''])[0]: 1} if ROLE_SKILLS.get(hw.role) else {},
        )
        hw.is_hired = True
        hw.save(update_fields=['is_hired'])
        s.money -= hw.hire_cost
        s.save(update_fields=['money'])

    log_event('👋', f'Hired {worker.name} ({worker.role}, ★{worker.skill_level})!',
              log_type='success')
    return {'ok': True, 'message': f'Hired {worker.name}!', 'worker': worker.to_dict()}


def fire_worker(worker_id):
    worker = validate_worker(worker_id)
    with transaction.atomic():
        worker = Worker.objects.select_for_update().get(pk=worker.pk)
        name   = worker.name
        worker.is_active     = False
        worker.assigned_oven = None
        worker.save(update_fields=['is_active', 'assigned_oven'])
    log_event('👋', f'{name} was let go.', log_type='warning')
    return {'ok': True, 'message': f'{name} has been let go.'}


# ══════════════════════════════════════════════════════════════════
#  BUY OVEN / UPGRADE
# ══════════════════════════════════════════════════════════════════

def buy_oven(tier):
    validate_oven_tier(tier)
    cfg   = get_oven_catalog()[tier]
    state = _state()
    with transaction.atomic():
        s = GameState.objects.select_for_update().get(pk=state.pk)
        if float(s.money) < cfg['cost']:
            raise ValueError(f"Need ${cfg['cost']}, have ${float(s.money):.2f}.")
        n    = Oven.objects.filter(game_state=state, is_active=True).count() + 1
        oven = Oven.objects.create(
            game_state=state,
            name=f"{cfg['name']} #{n}", tier=cfg['tier'],
            speed_bonus=cfg['speed_bonus'], purchased_on_day=s.day,
            cost=D(cfg['cost']))
        s.money -= D(cfg['cost'])
        s.save(update_fields=['money'])
    log_event('🔥', f'Purchased {oven.name}!', log_type='success')
    return {'ok': True, 'message': f'Purchased {oven.name}!', 'oven': oven.to_dict()}


def buy_upgrade(uid):
    validate_upgrade(uid)
    cfg   = get_kitchen_upgrades()[uid]
    state = _state()
    with transaction.atomic():
        s = GameState.objects.select_for_update().get(pk=state.pk)
        if s.has_upgrade(uid):
            raise ValueError(f"Already owned: {cfg['name']}.")
        if float(s.money) < cfg['cost']:
            raise ValueError(f"Need ${cfg['cost']} for {cfg['name']}.")
        owned = list(s.owned_upgrades or [])
        owned.append(uid)
        s.owned_upgrades = owned
        s.money         -= D(cfg['cost'])
        if uid == 'extra_table':
            s.tables_count = min(s.tables_count + 1, 8)
            s.save(update_fields=['owned_upgrades', 'money', 'tables_count'])
        elif uid == 'cashier_stand_2':
            s.cashier_stands = min(s.cashier_stands + 1, 3)
            s.max_queue_size = s.cashier_stands * 3
            s.save(update_fields=['owned_upgrades', 'money', 'cashier_stands', 'max_queue_size'])
        elif uid == 'brew_station':
            s.save(update_fields=['owned_upgrades', 'money'])
            station, _created = BrewStation.objects.get_or_create(
                game_state=state,
                name='Brew Station #1',
                defaults={
                    'purchased_on_day': s.day,
                    'cost': D(cfg['cost']),
                    'is_active': True,
                },
            )
            if not station.is_active:
                station.is_active = True
                station.save(update_fields=['is_active'])
        else:
            s.save(update_fields=['owned_upgrades', 'money'])
    log_event(cfg['emoji'], f"Purchased: {cfg['name']}!", log_type='success')
    return {'ok': True, 'message': f"Purchased {cfg['name']}!", 'upgrade_id': uid}


# ══════════════════════════════════════════════════════════════════
#  ASSIGN / MODE
# ══════════════════════════════════════════════════════════════════

def assign_worker(worker_id, oven_id):
    worker = validate_worker(worker_id)
    with transaction.atomic():
        worker = Worker.objects.select_for_update().get(pk=worker.pk)
        if oven_id is None:
            worker.assigned_oven = None
            worker.save(update_fields=['assigned_oven'])
            return {'ok': True, 'message': f'{worker.name} unassigned.'}
        oven = validate_oven(oven_id)
        worker.assigned_oven = oven
        worker.save(update_fields=['assigned_oven'])
    return {'ok': True, 'message': f'{worker.name} assigned to {oven.name}.'}


def set_worker_mode(worker_id, work_mode=None, target_recipe_id=None):
    worker = validate_worker(worker_id)
    with transaction.atomic():
        worker = Worker.objects.select_for_update().get(pk=worker.pk)
        if work_mode is not None:
            validate_work_mode(work_mode)
            worker.work_mode = work_mode
        if target_recipe_id is not None:
            if not target_recipe_id:
                worker.target_recipe = None
            else:
                recipe = validate_recipe(target_recipe_id)
                worker.target_recipe = recipe
        worker.save(update_fields=['work_mode', 'target_recipe'])
    return {'ok': True, 'message': f'{worker.name} updated.'}


# ══════════════════════════════════════════════════════════════════
#  DAY END
# ══════════════════════════════════════════════════════════════════

def end_day():
    state = _state()
    with transaction.atomic():
        s = GameState.objects.select_for_update().get(pk=state.pk)
        if not s.is_open:
            raise ValueError('The store is not open.')

        opening_balance = float(s.money)
        day = s.day

        pending       = CustomerOrder.objects.filter(game_state=s, day_placed=day, status='pending')
        expired_count = pending.count()
        pending.update(status='expired')

        fulfilled_qs    = CustomerOrder.objects.filter(game_state=s, day_placed=day, status='fulfilled')
        fulfilled_count = fulfilled_qs.count()
        revenue         = float(fulfilled_qs.aggregate(total=Sum('revenue'))['total'] or 0)
        tips            = float(fulfilled_qs.aggregate(total=Sum('tip'))['total'] or 0)

        best_seller = best_count = ''
        if fulfilled_count:
            counts      = Counter(fulfilled_qs.values_list('recipe__name', flat=True))
            bs          = counts.most_common(1)[0]
            best_seller = bs[0]
            best_count  = bs[1]

        workers  = list(Worker.objects.filter(game_state=s, is_active=True))
        salaries = round(sum(float(w.salary_per_day) for w in workers), 2)
        s.money -= D(salaries)

        ingredient_costs = float(
            BakedCake.objects.filter(game_state=s, day_baked=day)
            .aggregate(total=Sum('ingredient_cost'))['total'] or 0)

        leftover = list(BakedCake.objects
                        .filter(game_state=s, day_baked=day, is_baking=False, remaining_slices__gt=0)
                        .select_related('recipe'))
        waste_cost = round(
            sum(float(c.ingredient_cost) * (c.remaining_slices / c.total_slices)
                for c in leftover), 2)
        for c in leftover:
            c.remaining_slices = 0
            c.save(update_fields=['remaining_slices'])

        baked_count  = BakedCake.objects.filter(game_state=s, day_baked=day).count()
        total_orders = fulfilled_count + expired_count
        satisfaction = round(
            (fulfilled_count / total_orders * 100) if total_orders else 50.0, 1)
        rep_delta    = int((satisfaction - s.reputation) * 0.12)
        s.reputation = max(0, min(100, s.reputation + rep_delta))

        net_profit      = round(revenue + tips - salaries - waste_cost, 2)
        closing_balance = round(opening_balance + net_profit, 2)
        for w in workers:
            delta = 0
            if net_profit > 0: delta += 2
            if expired_count == 0: delta += 1
            delta -= min(expired_count, 5)
            w.morale = max(0, min(100, w.morale + delta))
            w.save(update_fields=['morale'])
            if w.morale < 20:
                log_event('⚠️', f'{w.name} is very unhappy — morale critical!',
                          log_type='warning', day=day)
        s.money = D(closing_balance)

        worker_notes = []
        for w in workers:
            if w.level > 1:
                sk = get_worker_skill_catalogue().get(w.skill_id or '', {})
                icon = {'baker':'👨‍🍳','cashier':'💳','waiter':'🍽️',
                        'barista':'☕','manager':'📋'}.get(w.role, '👤')
                note = f"{icon} {w.name} — Lv.{w.level} ★{w.skill_level}"
                if sk:
                    note += f" [{sk['name']}]"
                worker_notes.append(note)

        s.briefing_data = {
            'day': day, 'net_profit': net_profit,
            'best_seller': best_seller, 'best_count': best_count,
            'worker_notes': worker_notes[:4],
        }

        report = DayReport.objects.create(
            game_state=s,
            day=day, revenue=D(revenue), worker_salaries=D(salaries),
            ingredient_costs=D(ingredient_costs), waste_cost=D(waste_cost),
            net_profit=D(net_profit), orders_fulfilled=fulfilled_count,
            orders_expired=expired_count, cakes_baked=baked_count,
            cakes_wasted=len(leftover), opening_balance=D(opening_balance),
            closing_balance=D(closing_balance), customer_satisfaction=satisfaction,
            best_seller=best_seller, best_seller_count=best_count or 0,
        )

        s.is_open             = False
        s.day                += 1
        s.day_started_at      = None
        s.day_end_at          = None
        s.next_order_at       = None
        s.active_event        = None
        s.event_counter       = 0
        s.rush_ends_at        = None
        s.critic_fresh_served = 0
        s.todays_guest_id     = None
        s.course_discount_active = False
        s.save()

    refresh_hire_pool()
    check_recipe_unlocks()

    global _last_tick_time
    _last_tick_time = None

    return {
        'ok':        True,
        'report':    report.to_dict(),
        'game_over': closing_balance < float(get_balance_value('game_over_debt_limit', -50, float)),
    }


# ══════════════════════════════════════════════════════════════════
#  OPEN STORE / START GAME / BRIEFING
# ══════════════════════════════════════════════════════════════════

def open_store():
    state = _state()
    day_duration = get_balance_value(
        'default_day_duration_seconds',
        getattr(settings, 'DEFAULT_DAY_DURATION_SECONDS', 300),
        int,
    )

    with transaction.atomic():
        s = GameState.objects.select_for_update().get(pk=state.pk)
        if not s.game_started:
            raise ValueError('Start a game first.')
        if s.is_open:
            raise ValueError('Store is already open.')
        now = timezone.now()
        s.is_open        = True
        s.day_started_at = now
        s.next_order_at  = now
        s.day_end_at     = now + timedelta(seconds=day_duration)
        s.save(update_fields=['is_open', 'day_started_at', 'next_order_at', 'day_end_at'])

    state = _state()
    event = roll_daily_event(state)
    return {
        'ok':           True,
        'message':      f'Store is open! Day {state.day} begins. You have {day_duration//60} min.',
        'active_event': event,
        'day_end_at':   state.day_end_at.isoformat() if state.day_end_at else None,
        'has_brew_station': state.has_upgrade('brew_station'),
    }


def get_briefing():
    state = _state()
    return {
        'ok':            True,
        'briefing':      state.briefing_data,
        'day':           state.day,
        'hire_pool_count': HireableWorker.objects.filter(
            game_state=state, is_hired=False, expires_on_day__gt=state.day).count(),
    }


def start_game(store_name, confirmed=False):
    state = _state()
    if state.game_started and not confirmed:
        return {
            'ok': False, 'needs_confirm': True,
            'message': (f'"{state.store_name}" is already running '
                        f'(Day {state.day}). Confirm to start over.'),
        }

    with transaction.atomic():
        BakedCake.objects.filter(game_state=state).delete()
        CustomerOrder.objects.filter(game_state=state).delete()
        DayReport.objects.filter(game_state=state).delete()
        Worker.objects.filter(game_state=state).delete()
        HireableWorker.objects.filter(game_state=state).delete()
        EventLog.objects.filter(game_state=state).delete()
        Oven.objects.filter(game_state=state).delete()

        starter = Oven.objects.create(
            game_state=state,
            name='Starter Oven', tier='basic', speed_bonus=1.0,
            is_active=True, purchased_on_day=1, cost=D(0))

        s = GameState.objects.select_for_update().get(pk=state.pk)
        s.store_name             = (store_name or 'Sweet Layers').strip()[:100]
        s.day                    = 1
        s.money                  = D(get_balance_value('starting_money', 500, float))
        s.reputation             = get_balance_value('starting_reputation', 50, int)
        s.is_open                = False
        s.game_started           = True
        s.day_started_at         = None
        s.day_end_at             = None
        s.next_order_at          = None
        s.total_revenue          = D(0)
        s.total_fulfilled        = 0
        s.pool_refreshed_day     = 0
        s.active_event           = None
        s.event_counter          = 0
        s.owned_upgrades         = []
        s.briefing_data          = None
        s.rush_ends_at           = None
        s.critic_fresh_served    = 0
        s.todays_guest_id        = None
        s.course_discount_active = False
        s.tables_count           = 2
        s.cashier_stands         = 1
        s.max_queue_size         = 3
        s.save()
        s.reset_unlocked_recipes()

    refresh_hire_pool()
    global _last_tick_time
    _last_tick_time = None
    return {'ok': True, 'message': f'Welcome to {state.store_name}!'}


# ══════════════════════════════════════════════════════════════════
#  FULL STATE
# ══════════════════════════════════════════════════════════════════

def get_full_state():
    state       = _state()
    state.ensure_starter_recipes()
    current_day = state.day

    ovens     = [o.to_dict() for o in
                 Oven.objects.filter(game_state=state, is_active=True)
                             .prefetch_related('assigned_workers','cakes')]
    workers   = [w.to_dict() for w in Worker.objects.filter(game_state=state, is_active=True)]
    inventory = [c.to_dict(current_day, state) for c in
                 BakedCake.objects
                           .filter(game_state=state, is_baking=False, remaining_slices__gt=0,
                                   day_baked__gte=current_day-1)
                           .select_related('recipe')
                           .order_by('remaining_slices','baked_time')]
    baking    = [c.to_dict(current_day, state) for c in
                 BakedCake.objects.filter(game_state=state, is_baking=True).select_related('recipe')]
    orders    = [o.to_dict(state) for o in
                 CustomerOrder.objects
                               .filter(game_state=state, status='pending')
                               .select_related('recipe')
                               .order_by('queue_position', 'placed_at', 'expires_at')]
    recipes   = [r.to_dict(state) for r in CakeRecipe.objects.all().order_by('pk')]
    reports   = [r.to_dict() for r in DayReport.objects.filter(game_state=state)[:7]]
    hire_pool = [hw.to_dict() for hw in get_hire_pool(current_day)]
    event_log = [e.to_dict() for e in EventLog.objects.filter(game_state=state)[:30]]

    upgrades = [
        {'id':uid,'name':ucfg['name'],'emoji':ucfg['emoji'],
         'cost':ucfg['cost'],'desc':ucfg['desc'],'owned':state.has_upgrade(uid)}
        for uid, ucfg in get_kitchen_upgrades().items()
    ]

    course_costs = {}
    for (fr, to), cfg in get_course_config().items():
        cost = round(cfg['cost'] * (0.70 if state.course_discount_active else 1.0))
        course_costs[f"{fr}_to_{to}"] = {'cost': cost, 'days': cfg['days']}

    drink_recipes = [d.to_dict() for d in DrinkRecipe.objects.all().order_by('pk')]
    brew_stations = [b.to_dict() for b in BrewStation.objects.filter(game_state=state, is_active=True)]
    brewing_drinks = [
        b.to_dict() for b in
        BrewingDrink.objects
        .filter(game_state=state, is_brewing=True)
        .select_related('recipe', 'station')
    ]

    return {
        'state':        state.to_dict(),
        'ovens':        ovens,
        'workers':      workers,
        'inventory':    inventory,
        'baking':       baking,
        'orders':       orders,
        'recipes':      recipes,
        'reports':      reports,
        'hire_pool':    hire_pool,
        'event_log':    event_log,
        'upgrades':     upgrades,
        'course_costs': course_costs,
        'drink_recipes': drink_recipes,
        'brew_stations': brew_stations,
        'brewing_drinks': brewing_drinks,
        'shop': {
            'ovens': [{'tier':k,**v} for k,v in get_oven_catalog().items()],
        },
        # Phase 6: expose brew station state for UI
        'has_brew_station': state.has_upgrade('brew_station'),
        'tables_count': state.tables_count,
    }
