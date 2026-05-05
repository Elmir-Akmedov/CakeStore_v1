from django.contrib import admin
from .models import GameState, CakeRecipe, Oven, Worker, BakedCake, CustomerOrder, DayReport, HireableWorker, EventLog

@admin.register(GameState)
class GameStateAdmin(admin.ModelAdmin):
    list_display = ['store_name', 'user', 'day', 'money', 'reputation', 'is_open']

@admin.register(CakeRecipe)
class CakeRecipeAdmin(admin.ModelAdmin):
    list_display = ['name', 'cake_type', 'price_small', 'price_medium', 'price_large', 'is_unlocked']

@admin.register(Oven)
class OvenAdmin(admin.ModelAdmin):
    list_display = ['name', 'game_state', 'tier', 'speed_bonus', 'is_active']

@admin.register(Worker)
class WorkerAdmin(admin.ModelAdmin):
    list_display = ['name', 'game_state', 'role', 'skill_level', 'salary_per_day', 'is_active']

@admin.register(BakedCake)
class BakedCakeAdmin(admin.ModelAdmin):
    list_display = ['recipe', 'game_state', 'size', 'is_baking', 'remaining_slices', 'day_baked']

@admin.register(CustomerOrder)
class CustomerOrderAdmin(admin.ModelAdmin):
    list_display = ['customer_name', 'game_state', 'recipe', 'size', 'status', 'day_placed']

@admin.register(DayReport)
class DayReportAdmin(admin.ModelAdmin):
    list_display = ['day', 'game_state', 'revenue', 'net_profit', 'orders_fulfilled']

@admin.register(HireableWorker)
class HireableWorkerAdmin(admin.ModelAdmin):
    list_display = ['name', 'game_state', 'role', 'skill_level', 'hire_cost', 'is_hired']

@admin.register(EventLog)
class EventLogAdmin(admin.ModelAdmin):
    list_display = ['day', 'game_state', 'icon', 'message', 'log_type']
