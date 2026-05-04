from django.contrib import admin
from .models import GameState, CakeRecipe, Oven, Worker, BakedCake, CustomerOrder, DayReport

@admin.register(GameState)
class GameStateAdmin(admin.ModelAdmin):
    list_display = ['store_name', 'day', 'money', 'reputation', 'is_open']

@admin.register(CakeRecipe)
class CakeRecipeAdmin(admin.ModelAdmin):
    list_display = ['name', 'cake_type', 'price_small', 'price_medium', 'price_large', 'is_unlocked']

@admin.register(Oven)
class OvenAdmin(admin.ModelAdmin):
    list_display = ['name', 'tier', 'speed_bonus', 'is_active']

@admin.register(Worker)
class WorkerAdmin(admin.ModelAdmin):
    list_display = ['name', 'role', 'skill_level', 'salary_per_day', 'assigned_oven', 'is_active']

@admin.register(BakedCake)
class BakedCakeAdmin(admin.ModelAdmin):
    list_display = ['recipe', 'size', 'is_baking', 'remaining_slices', 'day_baked']

@admin.register(CustomerOrder)
class CustomerOrderAdmin(admin.ModelAdmin):
    list_display = ['customer_name', 'recipe', 'size', 'status', 'want_fresh', 'day_placed']

@admin.register(DayReport)
class DayReportAdmin(admin.ModelAdmin):
    list_display = ['day', 'revenue', 'net_profit', 'orders_fulfilled', 'orders_expired']