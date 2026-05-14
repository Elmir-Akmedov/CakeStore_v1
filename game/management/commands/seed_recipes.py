from django.core.management.base import BaseCommand
from game.models import CakeRecipe

RECIPES = [
    {
        'name':'Chocolate Cake','cake_type':'Regular','emoji':'🍫',
        'ingredients':['chocolate','flour','sugar','eggs','butter'],
        'price_small':18,'price_medium':32,'price_large':52,
        'bake_sec_small':25,'bake_sec_medium':40,'bake_sec_large':60,
        'ingredient_cost_pct':0.28,'is_unlocked':True,'is_starter':True,
        'shop_price':None,'unlock_day':None,'unlock_rep':None,'unlock_message':'',
    },
    {
        'name':'Vanilla Cake','cake_type':'Regular','emoji':'🍦',
        'ingredients':['flour','sugar','eggs','vanilla extract','butter'],
        'price_small':16,'price_medium':28,'price_large':46,
        'bake_sec_small':22,'bake_sec_medium':35,'bake_sec_large':55,
        'ingredient_cost_pct':0.26,'is_unlocked':True,'is_starter':True,
        'shop_price':None,'unlock_day':None,'unlock_rep':None,'unlock_message':'',
    },
    {
        'name':'Strawberry Cake','cake_type':'Regular','emoji':'🍓',
        'ingredients':['flour','sugar','eggs','strawberries','cream'],
        'price_small':20,'price_medium':36,'price_large':58,
        'bake_sec_small':28,'bake_sec_medium':45,'bake_sec_large':65,
        'ingredient_cost_pct':0.32,'is_unlocked':False,'is_starter':False,
        'shop_price':80,'unlock_day':3,'unlock_rep':None,
        'unlock_message':'Customers want Strawberry Cake!',
    },
    {
        'name':'Lemon Drizzle','cake_type':'Regular','emoji':'🍋',
        'ingredients':['flour','sugar','eggs','lemon zest','icing'],
        'price_small':18,'price_medium':30,'price_large':50,
        'bake_sec_small':24,'bake_sec_medium':38,'bake_sec_large':58,
        'ingredient_cost_pct':0.29,'is_unlocked':False,'is_starter':False,
        'shop_price':130,'unlock_day':6,'unlock_rep':None,
        'unlock_message':'A refreshing option for your menu!',
    },
    {
        'name':'Cheesecake','cake_type':'Regular','emoji':'🧀',
        'ingredients':['cream cheese','sugar','eggs','biscuit base','vanilla'],
        'price_small':22,'price_medium':38,'price_large':62,
        'bake_sec_small':30,'bake_sec_medium':48,'bake_sec_large':70,
        'ingredient_cost_pct':0.33,'is_unlocked':False,'is_starter':False,
        'shop_price':180,'unlock_day':8,'unlock_rep':None,
        'unlock_message':'A classic crowd-pleaser!',
    },
    {
        'name':'Red Velvet Cake','cake_type':'Regular','emoji':'❤️',
        'ingredients':['flour','cocoa','red food dye','cream cheese frosting','eggs'],
        'price_small':24,'price_medium':42,'price_large':68,
        'bake_sec_small':32,'bake_sec_medium':50,'bake_sec_large':72,
        'ingredient_cost_pct':0.31,'is_unlocked':False,'is_starter':False,
        'shop_price':200,'unlock_day':10,'unlock_rep':None,
        'unlock_message':'Rich and dramatic — customers will love it.',
    },
    {
        'name':'Birthday Cake','cake_type':'Special','emoji':'🎂',
        'ingredients':['chocolate','vanilla','cream','fondant','candles'],
        'price_small':28,'price_medium':50,'price_large':80,
        'bake_sec_small':35,'bake_sec_medium':55,'bake_sec_large':80,
        'ingredient_cost_pct':0.34,'is_unlocked':False,'is_starter':False,
        'shop_price':150,'unlock_day':None,'unlock_rep':40,
        'unlock_message':'Customers want something special for celebrations!',
    },
    {
        'name':'Gluten-Free Cake','cake_type':'Special','emoji':'🌾',
        'ingredients':['gluten-free flour','sugar','eggs','xanthan gum','vanilla'],
        'price_small':24,'price_medium':42,'price_large':68,
        'bake_sec_small':30,'bake_sec_medium':50,'bake_sec_large':72,
        'ingredient_cost_pct':0.36,'is_unlocked':False,'is_starter':False,
        'shop_price':250,'unlock_day':None,'unlock_rep':60,
        'unlock_message':'Health-conscious customers have arrived!',
    },
    {
        'name':'Vegan Cake','cake_type':'Special','emoji':'🌱',
        'ingredients':['flour','sugar','flax eggs','oat milk','coconut oil'],
        'price_small':22,'price_medium':38,'price_large':62,
        'bake_sec_small':28,'bake_sec_medium':45,'bake_sec_large':68,
        'ingredient_cost_pct':0.30,'is_unlocked':False,'is_starter':False,
        'shop_price':300,'unlock_day':None,'unlock_rep':75,
        'unlock_message':'The vegan community has heard about your store!',
    },
    {
        'name':'Macaron Box','cake_type':'Special','emoji':'🌈',
        'ingredients':['almond flour','egg whites','sugar','food coloring','filling'],
        'price_small':35,'price_medium':60,'price_large':95,
        'bake_sec_small':40,'bake_sec_medium':65,'bake_sec_large':90,
        'ingredient_cost_pct':0.38,'is_unlocked':False,'is_starter':False,
        'shop_price':450,'unlock_day':20,'unlock_rep':None,
        'unlock_message':'Master patisserie — requires a skilled baker.',
    },
    {
        'name':'Wedding Cake','cake_type':'Special','emoji':'💒',
        'ingredients':['vanilla','fondant','fresh flowers','royal icing','sugar paste'],
        'price_small':60,'price_medium':100,'price_large':160,
        'bake_sec_small':60,'bake_sec_medium':90,'bake_sec_large':130,
        'ingredient_cost_pct':0.40,'is_unlocked':False,'is_starter':False,
        'shop_price':800,'unlock_day':30,'unlock_rep':None,
        'unlock_message':'Your reputation has attracted wedding clients!',
    },
    {
        'name':'Carrot Cake','cake_type':'Regular','emoji':'🥕',
        'ingredients':['carrots','flour','sugar','eggs','cream cheese'],
        'price_small':22,'price_medium':38,'price_large':62,
        'bake_sec_small':30,'bake_sec_medium':48,'bake_sec_large':70,
        'ingredient_cost_pct':0.30,'is_unlocked':False,'is_starter':False,
        'shop_price':160,'unlock_day':12,'unlock_rep':None,'unlock_message':'A wholesome classic!',
    },
    {
        'name':'Tiramisu','cake_type':'Special','emoji':'🍰',
        'ingredients':['mascarpone','espresso','ladyfingers','eggs','cocoa'],
        'price_small':26,'price_medium':46,'price_large':74,
        'bake_sec_small':34,'bake_sec_medium':52,'bake_sec_large':76,
        'ingredient_cost_pct':0.34,'is_unlocked':False,'is_starter':False,
        'shop_price':200,'unlock_day':14,'unlock_rep':None,'unlock_message':'Italian perfection.',
    },
    {
        'name':'Black Forest','cake_type':'Special','emoji':'🍒',
        'ingredients':['chocolate','cherries','cream','kirsch','sponge'],
        'price_small':26,'price_medium':46,'price_large':74,
        'bake_sec_small':34,'bake_sec_medium':54,'bake_sec_large':78,
        'ingredient_cost_pct':0.33,'is_unlocked':False,'is_starter':False,
        'shop_price':None,'unlock_day':None,'unlock_rep':55,'unlock_message':'A legend arrives!',
    },
    {
        'name':'Mango Mousse','cake_type':'Special','emoji':'🥭',
        'ingredients':['mango','cream','gelatin','sugar','lime'],
        'price_small':28,'price_medium':50,'price_large':80,
        'bake_sec_small':36,'bake_sec_medium':56,'bake_sec_large':80,
        'ingredient_cost_pct':0.35,'is_unlocked':False,'is_starter':False,
        'shop_price':280,'unlock_day':18,'unlock_rep':None,'unlock_message':'Tropical vibes!',
    },
    {
        'name':'Pistachio Roll','cake_type':'Special','emoji':'🌿',
        'ingredients':['pistachio','cream cheese','flour','eggs','cardamom'],
        'price_small':30,'price_medium':54,'price_large':86,
        'bake_sec_small':38,'bake_sec_medium':58,'bake_sec_large':84,
        'ingredient_cost_pct':0.36,'is_unlocked':False,'is_starter':False,
        'shop_price':None,'unlock_day':None,'unlock_rep':70,'unlock_message':'For the connoisseurs.',
    },
    {
        'name':'Cotton Candy Cake','cake_type':'Special','emoji':'🩷',
        'ingredients':['cotton candy','vanilla','cream','food colouring','sponge'],
        'price_small':34,'price_medium':60,'price_large':96,
        'bake_sec_small':40,'bake_sec_medium':62,'bake_sec_large':88,
        'ingredient_cost_pct':0.37,'is_unlocked':False,'is_starter':False,
        'shop_price':400,'unlock_day':25,'unlock_rep':None,'unlock_message':'Fairground magic!',
    },
]

DRINKS = [
    {'name':'Espresso',     'emoji':'☕','brew_time_sec':8,  'price':4.00,'ingredient_cost_pct':0.20,'is_unlocked':True, 'is_starter':True, 'unlock_day':None},
    {'name':'Latte',        'emoji':'☕','brew_time_sec':12, 'price':6.00,'ingredient_cost_pct':0.22,'is_unlocked':True, 'is_starter':True, 'unlock_day':None},
    {'name':'Hot Chocolate','emoji':'🍫','brew_time_sec':15, 'price':5.50,'ingredient_cost_pct':0.24,'is_unlocked':False,'is_starter':False,'unlock_day':5},
    {'name':'Lemonade',     'emoji':'🍋','brew_time_sec':10, 'price':4.50,'ingredient_cost_pct':0.18,'is_unlocked':False,'is_starter':False,'unlock_day':4},
    {'name':'Matcha Latte', 'emoji':'🍵','brew_time_sec':18, 'price':7.00,'ingredient_cost_pct':0.26,'is_unlocked':False,'is_starter':False,'unlock_day':8},
    {'name':'Cold Brew',    'emoji':'🧊','brew_time_sec':5,  'price':6.50,'ingredient_cost_pct':0.20,'is_unlocked':False,'is_starter':False,'unlock_day':10},
]


class Command(BaseCommand):
    help = 'Seed cake recipes'

    def handle(self, *args, **kwargs):
        from game.models import DrinkRecipe
        created = updated = 0
        for data in RECIPES:
            obj, made = CakeRecipe.objects.update_or_create(name=data['name'], defaults=data)
            if made: created += 1
            else: updated += 1

        dc = du = 0
        for data in DRINKS:
            obj, made = DrinkRecipe.objects.update_or_create(name=data['name'], defaults=data)
            if made: dc += 1
            else: du += 1

        self.stdout.write(self.style.SUCCESS(
            f'✅ Cakes: {created} created, {updated} updated. '
            f'Drinks: {dc} created, {du} updated.'))
