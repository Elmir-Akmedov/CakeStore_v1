from django.urls import path
from . import views

urlpatterns = [
    path('',                   views.index,           name='index'),
    path('api/tick/',          views.api_tick,        name='api_tick'),
    path('api/state/',         views.api_state,       name='api_state'),
    path('api/start/',         views.api_start,       name='api_start'),
    path('api/open/',          views.api_open,        name='api_open'),
    path('api/end-day/',       views.api_end_day,     name='api_end_day'),
    path('api/briefing/',      views.api_briefing,    name='api_briefing'),
    path('api/bake/',          views.api_bake,        name='api_bake'),
    path('api/fulfill/',       views.api_fulfill,     name='api_fulfill'),
    path('api/hire-pool/',     views.api_hire_pool,   name='api_hire_pool'),
    path('api/hire-worker/',   views.api_hire_worker, name='api_hire_worker'),
    path('api/fire/',          views.api_fire,        name='api_fire'),
    path('api/assign/',        views.api_assign,      name='api_assign'),
    path('api/worker-mode/',   views.api_worker_mode, name='api_worker_mode'),
    path('api/buy-oven/',      views.api_buy_oven,    name='api_buy_oven'),
    path('api/buy-upgrade/',   views.api_buy_upgrade, name='api_buy_upgrade'),
    path('api/buy-recipe/',    views.api_buy_recipe,  name='api_buy_recipe'),
    path('api/start-course/',  views.api_start_course,name='api_start_course'),
]