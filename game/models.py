"""
models.py — Phase 2 + auth + day-timer
New: user-scoped GameState, day_end_at for timed days
"""
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta

CUSTOMER_NAMES = [
    "Alice","Bob","Carol","Dave","Eve","Frank","Grace","Hank",
    "Iris","Jake","Karen","Liam","Mia","Noah","Olivia","Pete",
    "Quinn","Rachel","Sam","Tina","Uma","Victor","Wendy","Zoe",
    "Max","Luna","Leo","Lily","Oscar","Nora","Ethan","Ava",
    "Chloe","Dylan","Ella","Finn","Gina","Hugo","Ivy","Jack",
]

SIZE_SLICES  = {'Small': 4, 'Medium': 8, 'Large': 12}
SIZE_CHOICES = [('Small','Small'),('Medium','Medium'),('Large','Large')]

# ── Skill rarity ──────────────────────────────────────────────────────────────
SKILL_RARITY_CHOICES = [
    ('standard',  'Standard'),
    ('rare',      'Rare'),
    ('epic',      'Epic'),
    ('legendary', 'Legendary'),
    ('unique',    'Unique'),
]

SKILL_RARITY_COLORS = {
    'standard':  '#888888',
    'rare':      '#3498db',
    'epic':      '#9b59b6',
    'legendary': '#f5a623',
    'unique':    '#e94560',
}

SKILL_RARITY_LABELS = {
    'standard':  '◆ Standard',
    'rare':      '◆ Rare',
    'epic':      '◆ Epic',
    'legendary': '◆ Legendary',
    'unique':    '◆ Unique',
}

# ── Full skill catalogue ──────────────────────────────────────────────────────
SKILL_CATALOGUE = {
    # BAKER SKILLS
    'speed_hands':       {'name':'Speed Hands',        'role':'baker',   'rarity':'standard',  'desc':'Bake time −8%',                      'effect':'bake_time_mult',    'value':0.92, 'negative':False},
    'gentle_touch':      {'name':'Gentle Touch',        'role':'baker',   'rarity':'standard',  'desc':'Ingredient cost −10%',               'effect':'ingredient_mult',   'value':0.90, 'negative':False},
    'oven_master':       {'name':'Oven Master',          'role':'baker',   'rarity':'rare',      'desc':'Bake time −18%, recipe flexibility', 'effect':'bake_time_mult',    'value':0.82, 'negative':False},
    'recipe_memory':     {'name':'Recipe Memory',        'role':'baker',   'rarity':'rare',      'desc':'Ingredient cost −15%',               'effect':'ingredient_mult',   'value':0.85, 'negative':False},
    'heat_intuition':    {'name':'Heat Intuition',       'role':'baker',   'rarity':'epic',      'desc':'Bake time −30%',                     'effect':'bake_time_mult',    'value':0.70, 'negative':False},
    'artisan_craft':     {'name':'Artisan Craft',        'role':'baker',   'rarity':'epic',      'desc':'Cake sells for +20%',                'effect':'revenue_mult',      'value':1.20, 'negative':False},
    'clockwork':         {'name':'Clockwork Precision',  'role':'baker',   'rarity':'legendary', 'desc':'Bake time −45%, revenue +15%',       'effect':'bake_time_mult',    'value':0.55, 'negative':False},
    'golden_hands':      {'name':'Golden Hands',         'role':'baker',   'rarity':'legendary', 'desc':'All baker stats +25%',               'effect':'all_stats_mult',    'value':1.25, 'negative':False},
    'phoenix_flame':     {'name':'Phoenix Flame',        'role':'baker',   'rarity':'unique',    'desc':'Instant bake once per day',          'effect':'instant_bake',      'value':1,    'negative':False},

    # CASHIER SKILLS
    'quick_eyes':        {'name':'Quick Eyes',           'role':'cashier', 'rarity':'standard',  'desc':'Service speed +10%',                 'effect':'service_mult',      'value':1.10, 'negative':False},
    'friendly_smile':    {'name':'Friendly Smile',       'role':'cashier', 'rarity':'standard',  'desc':'Tip chance +8%',                     'effect':'tip_chance_bonus',  'value':0.08, 'negative':False},
    'people_person':     {'name':'People Person',        'role':'cashier', 'rarity':'rare',      'desc':'Customer patience +15%',             'effect':'patience_mult',     'value':1.15, 'negative':False},
    'upsell':            {'name':'Upsell',                'role':'cashier', 'rarity':'rare',      'desc':'Revenue per order +12%',             'effect':'revenue_mult',      'value':1.12, 'negative':False},
    'crowd_reader':      {'name':'Crowd Reader',         'role':'cashier', 'rarity':'epic',      'desc':'Prioritizes VIP/urgent orders',      'effect':'vip_priority',      'value':1,    'negative':False},
    'silver_tongue':     {'name':'Silver Tongue',        'role':'cashier', 'rarity':'epic',      'desc':'Tips +40%, converts impatient',      'effect':'tip_mult',          'value':1.40, 'negative':False},
    'golden_service':    {'name':'Golden Service',       'role':'cashier', 'rarity':'legendary', 'desc':'Tips always trigger, amount +60%',   'effect':'tip_always',        'value':1.60, 'negative':False},
    'memory_of_faces':   {'name':'Memory of Faces',      'role':'cashier', 'rarity':'legendary', 'desc':'Regulars return 2× more often',      'effect':'regular_freq',      'value':2.0,  'negative':False},
    'customer_whisperer':{'name':'Customer Whisperer',   'role':'cashier', 'rarity':'unique',    'desc':'Today\'s Customer is always pleased', 'effect':'vip_always_happy', 'value':1,    'negative':False},

    # WAITER SKILLS
    'floor_presence':    {'name':'Floor Presence',       'role':'waiter',  'rarity':'standard',  'desc':'Customer patience +12%',             'effect':'patience_mult',     'value':1.12, 'negative':False},
    'warm_welcome':      {'name':'Warm Welcome',          'role':'waiter',  'rarity':'standard',  'desc':'Order frequency +8%',                'effect':'order_freq_mult',   'value':1.08, 'negative':False},
    'table_radar':       {'name':'Table Radar',           'role':'waiter',  'rarity':'rare',      'desc':'Auto-bumps expiring orders',         'effect':'auto_bump',         'value':1,    'negative':False},
    'diplomatic':        {'name':'Diplomatic',            'role':'waiter',  'rarity':'rare',      'desc':'Rep loss from expiry −40%',          'effect':'rep_loss_mult',     'value':0.60, 'negative':False},
    'crowd_favorite':    {'name':'Crowd Favorite',        'role':'waiter',  'rarity':'epic',      'desc':'All customers +25% patience',        'effect':'patience_mult',     'value':1.25, 'negative':False},
    'rush_specialist':   {'name':'Rush Specialist',       'role':'waiter',  'rarity':'epic',      'desc':'Rush hour patience ×2',              'effect':'rush_patience',     'value':2.0,  'negative':False},
    'maestro':           {'name':'Maestro',                'role':'waiter',  'rarity':'legendary', 'desc':'Every order fulfilled = +0.5 rep',   'effect':'rep_per_order',     'value':0.5,  'negative':False},
    'charming_host':     {'name':'Charming Host',         'role':'waiter',  'rarity':'legendary', 'desc':'VIP visit chance +20%',              'effect':'vip_chance',        'value':0.20, 'negative':False},
    'spirit_of_service': {'name':'Spirit of Service',    'role':'waiter',  'rarity':'unique',    'desc':'No orders expire today',             'effect':'no_expiry',         'value':1,    'negative':False},

    # MANAGER SKILLS
    'motivator':         {'name':'Motivator',             'role':'manager', 'rarity':'standard',  'desc':'All workers +5% speed',              'effect':'global_speed',      'value':1.05, 'negative':False},
    'organizer':         {'name':'Organizer',             'role':'manager', 'rarity':'standard',  'desc':'Reduces idle time',                  'effect':'idle_reduction',    'value':0.15, 'negative':False},
    'iron_will':         {'name':'Iron Will',             'role':'manager', 'rarity':'standard',  'desc':'One random worker −5% speed',        'effect':'random_nerf',       'value':0.95, 'negative':True},
    'talent_scout':      {'name':'Talent Scout',          'role':'manager', 'rarity':'rare',      'desc':'Hire pool refreshes 1 day earlier',  'effect':'pool_refresh_bonus','value':1,    'negative':False},
    'cost_cutter':       {'name':'Cost Cutter',           'role':'manager', 'rarity':'rare',      'desc':'Ingredient costs −8% store-wide',    'effect':'ingredient_mult',   'value':0.92, 'negative':False},
    'micromanager':      {'name':'Micromanager',          'role':'manager', 'rarity':'rare',      'desc':'Cashiers serve 10% slower',          'effect':'cashier_speed_nerf','value':0.90, 'negative':True},
    'inspiring':         {'name':'Inspiring',             'role':'manager', 'rarity':'epic',      'desc':'Workers gain XP 30% faster',         'effect':'xp_mult',           'value':1.30, 'negative':False},
    'strategic_eye':     {'name':'Strategic Eye',         'role':'manager', 'rarity':'epic',      'desc':'Bulk orders +20% more frequent',     'effect':'bulk_freq',         'value':1.20, 'negative':False},
    'demanding':         {'name':'Demanding',             'role':'manager', 'rarity':'epic',      'desc':'Workers request raises 5 days early','effect':'raise_accelerate',  'value':5,    'negative':True},
    'executive_vision':  {'name':'Executive Vision',      'role':'manager', 'rarity':'legendary', 'desc':'All order revenue +15%',             'effect':'revenue_mult',      'value':1.15, 'negative':False},
    'natural_leader':    {'name':'Natural Leader',        'role':'manager', 'rarity':'legendary', 'desc':'All workers +1 star effectively',    'effect':'star_buff',         'value':1,    'negative':False},
    'chaos_aura':        {'name':'Chaos Aura',            'role':'manager', 'rarity':'legendary', 'desc':'Triggers one random event per day',  'effect':'chaos',             'value':1,    'negative':True},
    'the_chosen_one':    {'name':'The Chosen One',        'role':'manager', 'rarity':'unique',    'desc':'All buffs ×1.5 on high-satisfaction','effect':'chosen_buff',       'value':1.5,  'negative':False},
}

# ── Course system ─────────────────────────────────────────────────────────────
COURSE_CONFIG = {
    ('standard', 'rare'):      {'cost': 200, 'days': 2},
    ('rare',     'epic'):      {'cost': 500, 'days': 3},
    ('epic',     'legendary'): {'cost': 1200,'days': 5},
}

# ── Hire pool names ───────────────────────────────────────────────────────────
HIRE_POOL_NAMES = [
    "Tom","Sarah","Mike","Emma","Jake","Lisa","David","Anna",
    "Chris","Kate","James","Amy","Ben","Fiona","Ryan","Maya",
    "Harry","Chloe","Sam","Nora","Alex","Zara","Kai","Ruby",
    "Owen","Felix","Hazel","Luca","Violet","Theo","Mila","Iris",
    "Cole","Daisy","Eli","Freya","Gio","Hana","Ivan","Jade",
]

# ── Customer types ────────────────────────────────────────────────────────────
CUSTOMER_TYPE_CHOICES = [
    ('standard',   'Standard'),
    ('patient',    'Patient'),
    ('impatient',  'Impatient'),
    ('picky',      'Picky'),
    ('bulk_buyer', 'Bulk Buyer'),
    ('vip',        'VIP'),
    ('regular',    'Regular'),
    ('inspector',  'Inspector'),
    ('critic',     'Critic'),
    ('todays',     "Today's Guest"),
]

CUSTOMER_TYPE_META = {
    'standard':   {'patience_mult':1.00,'tip_range':(0.05,0.12),'revenue_mult':1.0, 'icon':'',   'weight':35,'rep_on_fail':3},
    'patient':    {'patience_mult':2.00,'tip_range':(0.08,0.18),'revenue_mult':1.0, 'icon':'😌', 'weight':18,'rep_on_fail':2},
    'impatient':  {'patience_mult':0.55,'tip_range':(0.15,0.30),'revenue_mult':1.2, 'icon':'😤', 'weight':14,'rep_on_fail':4},
    'picky':      {'patience_mult':1.20,'tip_range':(0.12,0.25),'revenue_mult':1.15,'icon':'🧐', 'weight':10,'rep_on_fail':5},
    'bulk_buyer': {'patience_mult':1.50,'tip_range':(0.05,0.12),'revenue_mult':1.1, 'icon':'📦', 'weight':8, 'rep_on_fail':2},
    'vip':        {'patience_mult':1.30,'tip_range':(0.40,0.80),'revenue_mult':2.0, 'icon':'⭐', 'weight':3, 'rep_on_fail':8},
    'regular':    {'patience_mult':1.40,'tip_range':(0.20,0.35),'revenue_mult':1.0, 'icon':'🤝', 'weight':10,'rep_on_fail':4},
    'inspector':  {'patience_mult':1.80,'tip_range':(0.0, 0.0), 'revenue_mult':1.0, 'icon':'🔍', 'weight':3, 'rep_on_fail':12},
    'critic':     {'patience_mult':1.50,'tip_range':(0.0, 0.0), 'revenue_mult':1.0, 'icon':'📰', 'weight':3, 'rep_on_fail':10},
    'todays':     {'patience_mult':1.50,'tip_range':(0.50,1.00),'revenue_mult':1.5, 'icon':'👑', 'weight':0, 'rep_on_fail':0},
}

WORKER_LEVEL_XP     = [0,20,50,100,180,300,480,700,1000,1400]
WORKER_STAR_AT_LEVEL = {4:2, 8:3}

POSITIVE_TRAITS = {
    'fast_learner':  {'name':'Fast Learner',  'icon':'⚡', 'desc':'Gains skill XP 30% faster'},
    'perfectionist': {'name':'Perfectionist', 'icon':'🎯', 'desc':'Perfect zone 20% more likely'},
    'team_player':   {'name':'Team Player',   'icon':'🤝', 'desc':'Adjacent workers +5% speed'},
    'early_bird':    {'name':'Early Bird',    'icon':'🌅', 'desc':'First 2 orders 20% faster'},
    'cool_head':     {'name':'Cool Head',     'icon':'🧊', 'desc':'No penalty in rush hour'},
    'innovative':    {'name':'Innovative',    'icon':'💡', 'desc':'Discovers new deco options'},
    'loyal':         {'name':'Loyal',         'icon':'💛', 'desc':'Salary never increases'},
    'energetic':     {'name':'Energetic',     'icon':'⚡', 'desc':'Serves 1 extra customer/tick'},
}

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

ROLE_SKILLS = {
    'baker':   ['mixing_technique','dough_shaping','decoration_eye','oven_instinct','recipe_memory'],
    'cashier': ['quick_service','charm','upselling','cash_handling','regular_memory'],
    'waiter':  ['floor_reading','presentation','conflict_resolution','speed_walking','sommelier_eye'],
    'manager': ['staff_motivation','cost_control','scheduling','talent_eye','crisis_management'],
}

SKILL_MASTERY_NAMES = {1:'Novice', 2:'Apprentice', 3:'Skilled', 4:'Expert', 5:'Master'}

KITCHEN_UPGRADES = {
    'display_case':        {'name':'Display Case',        'emoji':'🏪','cost':300, 'desc':'Customers see fresh cakes — +10% order patience'},
    'commercial_fridge':   {'name':'Commercial Fridge',   'emoji':'❄️', 'cost':450, 'desc':'Cakes stay fresh for 2 days instead of 1'},
    'second_counter':      {'name':'Second Counter',      'emoji':'🪑','cost':600, 'desc':'2 cashiers can serve simultaneously'},
    'premium_ingredients': {'name':'Premium Ingredients', 'emoji':'✨','cost':200, 'desc':'+15% selling price on all cakes, permanent'},
    'industrial_mixer':    {'name':'Industrial Mixer',    'emoji':'🌀','cost':500, 'desc':'-20% ingredient cost on all bakes, permanent'},
    'recipe_book':         {'name':'Recipe Book',         'emoji':'📖','cost':350, 'desc':'Workers bake with better variety in casual mode'},
    'loyalty_board':       {'name':'Loyalty Board',       'emoji':'🎖️','cost':400, 'desc':'Regular customers return 30% more often'},
    'music_system':        {'name':'Music System',        'emoji':'🎵','cost':250, 'desc':'All customer patience +8% (ambient music)'},
}

DAILY_EVENTS = [
    {'id':'blogger',       'icon':'🎥','title':'Food Blogger Visit',   'msg':'First 5 orders earn ×2 revenue.',          'type':'positive','weight':8},
    {'id':'festival',      'icon':'🎪','title':'Local Festival',       'msg':'Order frequency doubled all day.',           'type':'positive','weight':7},
    {'id':'good_delivery', 'icon':'📦','title':'Ingredient Discount',  'msg':'Ingredient costs −20% today.',               'type':'positive','weight':9},
    {'id':'sugar_rush',    'icon':'🍬','title':'Sweet Trend',          'msg':'Special cakes revenue +25% today.',          'type':'positive','weight':8},
    {'id':'rush_hour',     'icon':'⚡','title':'Morning Rush',         'msg':'Orders 3× faster for 60 seconds.',          'type':'positive','weight':10},
    {'id':'vip_party',     'icon':'🥂','title':'VIP Party Booking',    'msg':'3 VIP customers arrive today.',              'type':'positive','weight':4},
    {'id':'inspector',     'icon':'🔍','title':'Health Inspector',     'msg':'Stale cakes cost −15 reputation if served.', 'type':'negative','weight':6},
    {'id':'shortage',      'icon':'😰','title':'Flour Shortage',       'msg':'Ingredient costs +30% today.',               'type':'negative','weight':6},
    {'id':'oven_fault',    'icon':'⚠️', 'title':'Oven Malfunction',    'msg':'One oven runs at 50% speed today.',          'type':'negative','weight':5},
    {'id':'sick_day',      'icon':'🤒','title':"Baker's Day Off",      'msg':'One baker is unavailable today.',            'type':'negative','weight':5},
    {'id':'critic',        'icon':'📰','title':'Critic Visit',         'msg':'Serve 10 fresh orders for +20 reputation.',  'type':'challenge','weight':5},
    {'id':'todays_guest',  'icon':'👑','title':"Today's Special Guest",'msg':'A special guest visits — serve them perfectly for ×3 reputation!','type':'positive','weight':6},
    {'id':'course_discount','icon':'📚','title':'Training Discount',   'msg':'All skill courses cost −30% today.',         'type':'positive','weight':4},
]


# ══════════════════════════════════════════════════════════════════
class GameState(models.Model):
    # Issue 7: per-user GameState
    user                = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='game_state', null=True, blank=True)
    store_name          = models.CharField(max_length=100, default="Sweet Layers")
    day                 = models.IntegerField(default=1)
    money               = models.DecimalField(max_digits=10, decimal_places=2, default=500.00)
    reputation          = models.IntegerField(default=50)
    is_open             = models.BooleanField(default=False)
    game_started        = models.BooleanField(default=False)
    day_started_at      = models.DateTimeField(null=True, blank=True)
    # Issue 8: timed days
    day_end_at          = models.DateTimeField(null=True, blank=True)
    next_order_at       = models.DateTimeField(null=True, blank=True)
    total_revenue       = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_fulfilled     = models.IntegerField(default=0)
    pool_refreshed_day  = models.IntegerField(default=0)
    active_event        = models.JSONField(null=True, blank=True)
    event_counter       = models.IntegerField(default=0)
    briefing_data       = models.JSONField(null=True, blank=True)
    owned_upgrades      = models.JSONField(default=list)
    rush_ends_at        = models.DateTimeField(null=True, blank=True)
    critic_fresh_served = models.IntegerField(default=0)
    todays_guest_id     = models.IntegerField(null=True, blank=True)
    course_discount_active = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Game State"

    def __str__(self):
        owner = self.user.username if self.user_id else 'anon'
        return f"{self.store_name} — Day {self.day} ({owner})"

    @classmethod
    def get(cls, user=None):
        """Get or create GameState for a user (or the legacy pk=1 state)."""
        if user and user.is_authenticated:
            obj, _ = cls.objects.get_or_create(user=user, defaults={'store_name': 'Sweet Layers'})
            return obj
        # Fallback: legacy single-state (used by engine before user context set)
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def has_upgrade(self, uid):
        return uid in (self.owned_upgrades or [])

    @property
    def day_seconds_remaining(self):
        """Seconds left in the current timed day. None if no timer running."""
        if not self.is_open or not self.day_end_at:
            return None
        return max(0.0, (self.day_end_at - timezone.now()).total_seconds())

    @property
    def reputation_tier(self):
        r = self.reputation
        if r >= 85: return ('Legendary',   '#f5a623')
        if r >= 70: return ('Beloved',     '#9b59b6')
        if r >= 50: return ('Popular',     '#2ecc71')
        if r >= 30: return ('Local Gem',   '#3498db')
        return              ('Unknown',    '#888888')

    def _get_manager_buffs(self):
        buffs = {
            'global_speed': 1.0,
            'ingredient_mult': 1.0,
            'revenue_mult': 1.0,
            'xp_mult': 1.0,
            'cashier_speed_nerf': 1.0,
        }
        managers = Worker.objects.filter(game_state=self, role='manager', is_active=True)
        for m in managers:
            skill = m.skill_id
            if not skill or skill not in SKILL_CATALOGUE:
                continue
            sc = SKILL_CATALOGUE[skill]
            eff = sc['effect']
            val = sc['value']
            if eff == 'global_speed':       buffs['global_speed']      *= val
            if eff == 'ingredient_mult':    buffs['ingredient_mult']    *= val
            if eff == 'revenue_mult':       buffs['revenue_mult']       *= val
            if eff == 'xp_mult':            buffs['xp_mult']            *= val
            if eff == 'cashier_speed_nerf': buffs['cashier_speed_nerf'] *= val
        return buffs

    @property
    def order_frequency_mult(self):
        base = 1.0 + (self.reputation - 50) / 100
        if self.active_event and self.active_event.get('id') == 'festival': base *= 2.0
        if self.rush_ends_at and timezone.now() < self.rush_ends_at: base *= 3.0
        waiters = Worker.objects.filter(game_state=self, role='waiter', is_active=True)
        for w in waiters:
            if w.skill_id and SKILL_CATALOGUE.get(w.skill_id, {}).get('effect') == 'order_freq_mult':
                base *= SKILL_CATALOGUE[w.skill_id]['value']
        return base

    @property
    def ingredient_cost_mult(self):
        mult = 1.0
        if self.active_event:
            eid = self.active_event.get('id')
            if eid == 'good_delivery': mult *= 0.80
            if eid == 'shortage':      mult *= 1.30
        if self.has_upgrade('industrial_mixer'): mult *= 0.80
        buffs = self._get_manager_buffs()
        mult *= buffs['ingredient_mult']
        return mult

    @property
    def price_mult(self):
        mult = 1.0
        tier, _ = self.reputation_tier
        if tier == 'Beloved':   mult *= 1.15
        if tier == 'Legendary': mult *= 1.30
        if self.has_upgrade('premium_ingredients'): mult *= 1.15
        buffs = self._get_manager_buffs()
        mult *= buffs['revenue_mult']
        return mult

    @property
    def patience_mult(self):
        mult = 1.0
        if self.has_upgrade('display_case'): mult *= 1.10
        if self.has_upgrade('music_system'): mult *= 1.08
        waiters = Worker.objects.filter(game_state=self, role='waiter', is_active=True)
        for w in waiters:
            sc = SKILL_CATALOGUE.get(w.skill_id or '', {})
            if sc.get('effect') == 'patience_mult': mult *= sc['value']
        return mult

    def to_dict(self):
        tier_name, tier_color = self.reputation_tier
        day_secs = self.day_seconds_remaining
        return {
            'store_name':        self.store_name,
            'day':               self.day,
            'money':             float(self.money),
            'reputation':        self.reputation,
            'reputation_tier':   tier_name,
            'reputation_color':  tier_color,
            'is_open':           self.is_open,
            'game_started':      self.game_started,
            'total_revenue':     float(self.total_revenue),
            'total_fulfilled':   self.total_fulfilled,
            'active_event':      self.active_event,
            'event_counter':     self.event_counter,
            'owned_upgrades':    self.owned_upgrades or [],
            'rush_active':       bool(self.rush_ends_at and timezone.now() < self.rush_ends_at),
            'course_discount':   self.course_discount_active,
            # Issue 8: day timer
            'day_end_at':        self.day_end_at.isoformat() if self.day_end_at else None,
            'day_seconds_remaining': day_secs,
        }


# ══════════════════════════════════════════════════════════════════
class CakeRecipe(models.Model):
    TYPE_CHOICES = [('Regular','Regular'),('Special','Special'),('Secret','Secret')]

    name                = models.CharField(max_length=100, unique=True)
    cake_type           = models.CharField(max_length=20, choices=TYPE_CHOICES)
    ingredients         = models.JSONField(default=list)
    emoji               = models.CharField(max_length=10, default="🎂")
    price_small         = models.DecimalField(max_digits=6, decimal_places=2, default=18.00)
    price_medium        = models.DecimalField(max_digits=6, decimal_places=2, default=32.00)
    price_large         = models.DecimalField(max_digits=6, decimal_places=2, default=52.00)
    bake_sec_small      = models.IntegerField(default=25)
    bake_sec_medium     = models.IntegerField(default=40)
    bake_sec_large      = models.IntegerField(default=60)
    ingredient_cost_pct = models.FloatField(default=0.30)
    is_unlocked         = models.BooleanField(default=False)
    is_starter          = models.BooleanField(default=False)
    shop_price          = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    unlock_day          = models.IntegerField(null=True, blank=True)
    unlock_rep          = models.IntegerField(null=True, blank=True)
    unlock_message      = models.CharField(max_length=200, blank=True, default='')
    secret_available_from_day = models.IntegerField(null=True, blank=True)
    secret_expires_day        = models.IntegerField(null=True, blank=True)

    def __str__(self): return self.name

    def get_price(self, size, state=None):
        base = float({'Small':self.price_small,'Medium':self.price_medium,'Large':self.price_large}[size])
        if state: base *= state.price_mult
        if state and state.active_event and state.active_event.get('id') == 'sugar_rush':
            if self.cake_type == 'Special': base *= 1.25
        return round(base, 2)

    def get_bake_seconds(self, size):
        return {'Small':self.bake_sec_small,'Medium':self.bake_sec_medium,'Large':self.bake_sec_large}[size]

    def can_be_purchased(self, state):
        if self.is_unlocked or self.is_starter: return False
        day_ok = self.unlock_day is None or state.day >= self.unlock_day
        rep_ok = self.unlock_rep is None or state.reputation >= self.unlock_rep
        return day_ok and rep_ok and self.shop_price is not None

    def to_dict(self, state=None):
        purchasable = self.can_be_purchased(state) if state else False
        return {
            'id':self.pk,'name':self.name,'type':self.cake_type,
            'emoji':self.emoji,'ingredients':self.ingredients,
            'is_unlocked':self.is_unlocked,'is_starter':self.is_starter,
            'shop_price':float(self.shop_price) if self.shop_price else None,
            'unlock_day':self.unlock_day,'unlock_rep':self.unlock_rep,
            'unlock_message':self.unlock_message,
            'can_purchase':purchasable,
            'prices':{
                'Small': self.get_price('Small',state),
                'Medium':self.get_price('Medium',state),
                'Large': self.get_price('Large',state),
            },
            'bake_seconds':{
                'Small':self.bake_sec_small,'Medium':self.bake_sec_medium,'Large':self.bake_sec_large,
            },
        }


# ══════════════════════════════════════════════════════════════════
class Oven(models.Model):
    TIER_CHOICES = [('basic','Basic'),('pro','Pro'),('industrial','Industrial')]
    # Issue 7: scope ovens to game_state
    game_state       = models.ForeignKey(
        GameState, on_delete=models.CASCADE, related_name='ovens', null=True, blank=True)
    name             = models.CharField(max_length=100)
    tier             = models.CharField(max_length=20, choices=TIER_CHOICES, default='basic')
    speed_bonus      = models.FloatField(default=1.0)
    is_active        = models.BooleanField(default=True)
    purchased_on_day = models.IntegerField(default=1)
    cost             = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    bakes_count      = models.IntegerField(default=0)

    def __str__(self): return self.name

    @property
    def is_busy(self):
        return BakedCake.objects.filter(oven=self, is_baking=True).exists()

    @property
    def current_cake(self):
        return BakedCake.objects.filter(oven=self, is_baking=True).first()

    def to_dict(self):
        current = self.current_cake
        baker   = self.assigned_workers.filter(role='baker', is_active=True).first()
        return {
            'id':self.pk,'name':self.name,'tier':self.tier,
            'speed_bonus':self.speed_bonus,'is_busy':self.is_busy,
            'baker':baker.to_dict() if baker else None,
            'current_cake':current.to_dict() if current else None,
        }


# ══════════════════════════════════════════════════════════════════
class Worker(models.Model):
    ROLE_CHOICES = [
        ('baker',   'Baker'),
        ('cashier', 'Cashier'),
        ('waiter',  'Waiter'),
        ('manager', 'Manager'),
    ]
    WORK_MODE_CHOICES = [
        ('orders_only','Orders Only'),
        ('casual',     'Casual'),
        ('cake_only',  'Cake Only'),
    ]

    # Issue 7: scope workers to game_state
    game_state     = models.ForeignKey(
        GameState, on_delete=models.CASCADE, related_name='workers', null=True, blank=True)
    name           = models.CharField(max_length=100)
    role           = models.CharField(max_length=20, choices=ROLE_CHOICES)
    salary_per_day = models.DecimalField(max_digits=6, decimal_places=2)
    hired_on_day   = models.IntegerField()
    skill_level    = models.IntegerField(default=1)
    bake_speed     = models.IntegerField(default=1)
    service_speed  = models.IntegerField(default=1)
    skill_id       = models.CharField(max_length=60, blank=True, default='')
    skill_rarity   = models.CharField(max_length=20, default='standard')
    is_active      = models.BooleanField(default=True)
    assigned_oven  = models.ForeignKey(
        Oven, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='assigned_workers')
    work_mode      = models.CharField(max_length=20, choices=WORK_MODE_CHOICES, default='orders_only')
    target_recipe  = models.ForeignKey(
        CakeRecipe, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='dedicated_workers')
    experience     = models.IntegerField(default=0)
    level          = models.IntegerField(default=1)
    course_target_rarity = models.CharField(max_length=20, blank=True, default='')
    course_finish_day    = models.IntegerField(null=True, blank=True)
    positive_trait       = models.CharField(max_length=60, blank=True, default='')
    negative_trait       = models.CharField(max_length=60, blank=True, default='')
    skill_mastery        = models.JSONField(default=dict)
    morale               = models.IntegerField(default=70)

    def __str__(self): return f"{self.name} ({self.role})"

    @property
    def bake_time_factor(self):
        base = max(0.5, 1.0 - (self.bake_speed - 1) * 0.1)
        sc = SKILL_CATALOGUE.get(self.skill_id or '', {})
        if sc.get('effect') == 'bake_time_mult': base *= sc['value']
        if sc.get('effect') == 'golden_hands':   base *= 0.75
        return max(0.35, base)

    @property
    def xp_for_next_level(self):
        if self.level >= len(WORKER_LEVEL_XP): return None
        return WORKER_LEVEL_XP[min(self.level, len(WORKER_LEVEL_XP)-1)]

    @property
    def xp_progress_pct(self):
        if self.level >= len(WORKER_LEVEL_XP): return 100
        prev  = WORKER_LEVEL_XP[self.level-1] if self.level > 1 else 0
        next_ = WORKER_LEVEL_XP[self.level]
        span  = next_ - prev
        return min(100, max(0, int((self.experience - prev) / span * 100))) if span > 0 else 100

    def get_skill_info(self):
        if not self.skill_id: return None
        sc = SKILL_CATALOGUE.get(self.skill_id, {})
        if not sc: return None
        return {
            'id':       self.skill_id,
            'name':     sc['name'],
            'rarity':   self.skill_rarity,
            'rarity_label': SKILL_RARITY_LABELS.get(self.skill_rarity,''),
            'rarity_color': SKILL_RARITY_COLORS.get(self.skill_rarity,'#888'),
            'desc':     sc['desc'],
            'negative': sc.get('negative', False),
        }

    def to_dict(self):
        skill_info = self.get_skill_info()
        return {
            'id':self.pk,'name':self.name,'role':self.role,
            'skill_level':self.skill_level,
            'bake_speed':self.bake_speed,'service_speed':self.service_speed,
            'skill_id':self.skill_id,'skill_rarity':self.skill_rarity,
            'skill_info':skill_info,
            'salary_per_day':float(self.salary_per_day),
            'assigned_oven_id':self.assigned_oven_id,
            'work_mode':self.work_mode,
            'target_recipe_id':self.target_recipe_id,
            'experience':self.experience,'level':self.level,
            'xp_progress_pct':self.xp_progress_pct,
            'xp_for_next_level':self.xp_for_next_level,
            'hired_on_day':self.hired_on_day,
            'course_target_rarity':self.course_target_rarity,
            'course_finish_day':self.course_finish_day,
            'positive_trait': self.positive_trait,
            'negative_trait': self.negative_trait,
            'skill_mastery':  self.skill_mastery or {},
            'morale':         self.morale,
        }


# ══════════════════════════════════════════════════════════════════
class HireableWorker(models.Model):
    ROLE_CHOICES = [('baker','Baker'),('cashier','Cashier'),('waiter','Waiter'),('manager','Manager')]
    # Issue 7: scope hire pool to game_state
    game_state         = models.ForeignKey(
        GameState, on_delete=models.CASCADE, related_name='hireable_workers', null=True, blank=True)
    name               = models.CharField(max_length=100)
    role               = models.CharField(max_length=20, choices=ROLE_CHOICES)
    skill_level        = models.IntegerField(default=1)
    bake_speed         = models.IntegerField(default=1)
    service_speed      = models.IntegerField(default=1)
    skill_id           = models.CharField(max_length=60, blank=True, default='')
    skill_rarity       = models.CharField(max_length=20, default='standard')
    salary_per_day     = models.DecimalField(max_digits=6, decimal_places=2)
    hire_cost          = models.DecimalField(max_digits=8, decimal_places=2)
    available_from_day = models.IntegerField(default=1)
    expires_on_day     = models.IntegerField(default=4)
    is_hired           = models.BooleanField(default=False)
    positive_trait = models.CharField(max_length=60, blank=True, default='')
    negative_trait = models.CharField(max_length=60, blank=True, default='')

    def __str__(self): return f"{self.name} ({self.role}, ★{self.skill_level})"

    def to_dict(self):
        skill_info = None
        if self.skill_id and self.skill_id in SKILL_CATALOGUE:
            sc = SKILL_CATALOGUE[self.skill_id]
            skill_info = {
                'id':self.skill_id,'name':sc['name'],
                'rarity':self.skill_rarity,
                'rarity_label':SKILL_RARITY_LABELS.get(self.skill_rarity,''),
                'rarity_color':SKILL_RARITY_COLORS.get(self.skill_rarity,'#888'),
                'desc':sc['desc'],'negative':sc.get('negative',False),
            }
        return {
            'id':self.pk,'name':self.name,'role':self.role,
            'skill_level':self.skill_level,
            'bake_speed':self.bake_speed,'service_speed':self.service_speed,
            'skill_id':self.skill_id,'skill_rarity':self.skill_rarity,
            'skill_info':skill_info,
            'salary_per_day':float(self.salary_per_day),
            'hire_cost':float(self.hire_cost),
            'expires_on_day':self.expires_on_day,
            'positive_trait': self.positive_trait,
            'negative_trait': self.negative_trait,
        }


# ══════════════════════════════════════════════════════════════════
class BakedCake(models.Model):
    # Issue 7: scope baked cakes to game_state
    game_state        = models.ForeignKey(
        GameState, on_delete=models.CASCADE, related_name='baked_cakes', null=True, blank=True)
    recipe            = models.ForeignKey(CakeRecipe, on_delete=models.CASCADE, related_name='baked_instances')
    size              = models.CharField(max_length=10, choices=SIZE_CHOICES)
    is_baking         = models.BooleanField(default=True)
    baked_time        = models.DateTimeField(null=True, blank=True)
    bake_finish_at    = models.DateTimeField(null=True, blank=True)
    bake_duration_sec = models.IntegerField(default=30)
    remaining_slices  = models.IntegerField(default=4)
    oven              = models.ForeignKey(Oven, null=True, blank=True, on_delete=models.SET_NULL, related_name='cakes')
    day_baked         = models.IntegerField(default=1)
    ingredient_cost   = models.DecimalField(max_digits=6, decimal_places=2, default=0)

    def __str__(self): return f"{self.recipe.name} ({self.size})"

    @property
    def total_slices(self): return SIZE_SLICES[self.size]

    @property
    def progress_pct(self):
        if not self.is_baking or not self.bake_finish_at or self.bake_duration_sec == 0: return 100
        start   = self.bake_finish_at - timedelta(seconds=self.bake_duration_sec)
        elapsed = (timezone.now() - start).total_seconds()
        return min(100, max(0, int(elapsed / self.bake_duration_sec * 100)))

    @property
    def seconds_remaining(self):
        if not self.is_baking or not self.bake_finish_at: return 0
        return max(0.0, (self.bake_finish_at - timezone.now()).total_seconds())

    def is_fresh(self, state):
        days_fresh = 2 if state.has_upgrade('commercial_fridge') else 1
        return self.day_baked >= (state.day - days_fresh + 1)

    def slice_price(self, state=None):
        return round(self.recipe.get_price(self.size, state) / self.total_slices, 2)

    def to_dict(self, current_day=None, state=None):
        fresh = self.is_fresh(state) if state else (self.day_baked == current_day)
        return {
            'id':self.pk,'recipe_id':self.recipe_id,
            'recipe_name':self.recipe.name,'emoji':self.recipe.emoji,
            'size':self.size,'is_baking':self.is_baking,'is_fresh':fresh,
            'progress_pct':self.progress_pct,
            'seconds_remaining':round(self.seconds_remaining,1),
            'bake_finish_at':self.bake_finish_at.isoformat() if self.bake_finish_at else None,
            'bake_duration_sec':self.bake_duration_sec,
            'remaining_slices':self.remaining_slices,'total_slices':self.total_slices,
            'slice_price':self.slice_price(state),'day_baked':self.day_baked,'oven_id':self.oven_id,
        }


# ══════════════════════════════════════════════════════════════════
class CustomerOrder(models.Model):
    STATUS_CHOICES     = [('pending','Pending'),('fulfilled','Fulfilled'),('expired','Expired')]
    ORDER_TYPE_CHOICES = [('standard','Standard'),('urgent','Urgent'),('bulk','Bulk')]

    # Issue 7: scope orders to game_state
    game_state     = models.ForeignKey(
        GameState, on_delete=models.CASCADE, related_name='orders', null=True, blank=True)
    customer_name  = models.CharField(max_length=100)
    customer_type  = models.CharField(max_length=20, choices=CUSTOMER_TYPE_CHOICES, default='standard')
    recipe         = models.ForeignKey(CakeRecipe, on_delete=models.CASCADE)
    size           = models.CharField(max_length=10)
    quantity       = models.IntegerField(default=0)
    pieces         = models.IntegerField(default=0)
    want_fresh     = models.BooleanField(default=False)
    order_type     = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default='standard')
    status         = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    placed_at      = models.DateTimeField(auto_now_add=True)
    expires_at     = models.DateTimeField()
    fulfilled_at   = models.DateTimeField(null=True, blank=True)
    day_placed     = models.IntegerField()
    revenue        = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    tip            = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    satisfaction   = models.IntegerField(default=0)

    def __str__(self): return f"{self.customer_name}: {self.recipe.name}"

    @property
    def urgency(self):
        if self.status != 'pending': return 'done'
        r = (self.expires_at - timezone.now()).total_seconds()
        if r > 120: return 'normal'
        if r > 60:  return 'urgent'
        return 'critical'

    @property
    def seconds_remaining(self):
        return max(0.0, (self.expires_at - timezone.now()).total_seconds())

    def calculate_revenue(self, state=None):
        price  = self.recipe.get_price(self.size, state)
        slices = SIZE_SLICES[self.size]
        base   = price * self.quantity + (price / slices) * self.pieces
        mult   = 1.5 if self.order_type == 'urgent' else (1.2 if self.order_type == 'bulk' else 1.0)
        ctype  = CUSTOMER_TYPE_META.get(self.customer_type, {})
        mult  *= ctype.get('revenue_mult', 1.0)
        if self.customer_type == 'todays': mult *= 1.5
        return round(base * mult, 2)

    def to_dict(self, state=None):
        ctype = CUSTOMER_TYPE_META.get(self.customer_type, {})
        return {
            'id':self.pk,'customer_name':self.customer_name,
            'customer_type':self.customer_type,'customer_icon':ctype.get('icon',''),
            'recipe_name':self.recipe.name,'emoji':self.recipe.emoji,
            'size':self.size,'quantity':self.quantity,'pieces':self.pieces,
            'want_fresh':self.want_fresh,'order_type':self.order_type,
            'status':self.status,'urgency':self.urgency,
            'seconds_remaining':round(self.seconds_remaining,1),
            'expires_at':self.expires_at.isoformat(),
            'revenue':self.calculate_revenue(state),
            'is_todays': self.customer_type == 'todays',
        }


# ══════════════════════════════════════════════════════════════════
class EventLog(models.Model):
    game_state = models.ForeignKey(
        GameState, on_delete=models.CASCADE, related_name='event_logs', null=True, blank=True)
    day       = models.IntegerField()
    timestamp = models.DateTimeField(auto_now_add=True)
    icon      = models.CharField(max_length=10, default='ℹ️')
    message   = models.CharField(max_length=300)
    log_type  = models.CharField(max_length=20, default='info')

    class Meta: ordering = ['-timestamp']

    def to_dict(self):
        return {'id':self.pk,'day':self.day,'timestamp':self.timestamp.isoformat(),
                'icon':self.icon,'message':self.message,'log_type':self.log_type}


# ══════════════════════════════════════════════════════════════════
class DayReport(models.Model):
    game_state            = models.ForeignKey(
        GameState, on_delete=models.CASCADE, related_name='day_reports', null=True, blank=True)
    day                   = models.IntegerField()
    revenue               = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    worker_salaries       = models.DecimalField(max_digits=8,  decimal_places=2, default=0)
    ingredient_costs      = models.DecimalField(max_digits=8,  decimal_places=2, default=0)
    waste_cost            = models.DecimalField(max_digits=8,  decimal_places=2, default=0)
    net_profit            = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    orders_fulfilled      = models.IntegerField(default=0)
    orders_expired        = models.IntegerField(default=0)
    cakes_baked           = models.IntegerField(default=0)
    cakes_wasted          = models.IntegerField(default=0)
    opening_balance       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    closing_balance       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    customer_satisfaction = models.FloatField(default=0)
    best_seller           = models.CharField(max_length=100, blank=True, default='')
    best_seller_count     = models.IntegerField(default=0)
    created_at            = models.DateTimeField(auto_now_add=True)

    class Meta: ordering = ['-day']

    def __str__(self): return f"Day {self.day} — Net ${self.net_profit}"

    def to_dict(self):
        return {
            'day':self.day,'revenue':float(self.revenue),
            'worker_salaries':float(self.worker_salaries),
            'ingredient_costs':float(self.ingredient_costs),
            'waste_cost':float(self.waste_cost),'net_profit':float(self.net_profit),
            'orders_fulfilled':self.orders_fulfilled,'orders_expired':self.orders_expired,
            'cakes_baked':self.cakes_baked,'cakes_wasted':self.cakes_wasted,
            'opening_balance':float(self.opening_balance),
            'closing_balance':float(self.closing_balance),
            'customer_satisfaction':self.customer_satisfaction,
            'best_seller':self.best_seller,'best_seller_count':self.best_seller_count,
        }
