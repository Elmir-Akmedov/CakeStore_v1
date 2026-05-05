"""views.py — Phase 2 + auth"""
import json
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.contrib.auth import login
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from .models import GameState
from . import game_engine as engine


def _body(request):
    try: return json.loads(request.body) if request.body else {}
    except json.JSONDecodeError: return {}

def _ok(data): return JsonResponse({'ok': True, **data})
def _err(msg, status=400): return JsonResponse({'ok': False, 'message': msg}, status=status)

def _inject_user(request):
    """Set thread-local user so engine functions resolve the right GameState."""
    engine.set_current_user(request.user)

def _run(fn, *args, **kwargs):
    try:
        result = fn(*args, **kwargs)
        if isinstance(result, dict) and not result.get('ok', True):
            return _err(result.get('message', 'Action failed.'))
        return _ok(result) if isinstance(result, dict) else _ok({'result': result})
    except ValueError as e:
        return _err(str(e))
    except Exception as e:
        import traceback; traceback.print_exc()
        return _err('An unexpected server error occurred.', status=500)


# ── Auth views ────────────────────────────────────────────────────────────────
def register(request):
    if request.user.is_authenticated:
        return redirect('/')
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect('/')
    else:
        form = UserCreationForm()
    return render(request, 'registration/register.html', {'form': form})


# ── Game views (all require login) ───────────────────────────────────────────
@login_required
def index(request):
    return render(request, 'game/index.html', {'username': request.user.username})


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_tick(request):
    _inject_user(request)
    try:
        events = engine.tick()
        return JsonResponse({'ok': True, 'events': events})
    except Exception as e:
        import traceback; traceback.print_exc()
        return _err('Tick error.', status=500)


@login_required
@require_http_methods(['GET'])
def api_state(request):
    _inject_user(request)
    try: return JsonResponse(engine.get_full_state())
    except Exception as e:
        import traceback; traceback.print_exc()
        return _err('State error.', status=500)


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_start(request):
    _inject_user(request)
    data = _body(request)
    return _run(engine.start_game,
                (data.get('store_name') or 'Sweet Layers').strip()[:100],
                bool(data.get('confirmed', False)))


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_open(request):
    _inject_user(request)
    return _run(engine.open_store)


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_end_day(request):
    _inject_user(request)
    return _run(engine.end_day)


@login_required
@require_http_methods(['GET'])
def api_briefing(request):
    _inject_user(request)
    return _run(engine.get_briefing)


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_bake(request):
    _inject_user(request)
    data = _body(request)
    return _run(engine.start_baking,
                data.get('recipe_id'), data.get('size'), data.get('oven_id'))


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_fulfill(request):
    _inject_user(request)
    data = _body(request)
    return _run(engine.fulfill_order, data.get('order_id'))


@login_required
@require_http_methods(['GET'])
def api_hire_pool(request):
    _inject_user(request)
    state = GameState.get(request.user)
    pool  = engine.get_hire_pool(state.day)
    return JsonResponse({'ok': True, 'hire_pool': [hw.to_dict() for hw in pool]})


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_hire_worker(request):
    _inject_user(request)
    data = _body(request)
    return _run(engine.hire_from_pool, data.get('hireable_worker_id'))


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_fire(request):
    _inject_user(request)
    data = _body(request)
    return _run(engine.fire_worker, data.get('worker_id'))


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_assign(request):
    _inject_user(request)
    data = _body(request)
    return _run(engine.assign_worker, data.get('worker_id'), data.get('oven_id'))


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_worker_mode(request):
    _inject_user(request)
    data = _body(request)
    return _run(engine.set_worker_mode,
                data.get('worker_id'),
                work_mode=data.get('work_mode'),
                target_recipe_id=data.get('target_recipe_id'))


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_buy_oven(request):
    _inject_user(request)
    data = _body(request)
    return _run(engine.buy_oven, data.get('tier'))


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_buy_upgrade(request):
    _inject_user(request)
    data = _body(request)
    return _run(engine.buy_upgrade, data.get('upgrade_id'))


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_buy_recipe(request):
    _inject_user(request)
    data = _body(request)
    return _run(engine.buy_recipe, data.get('recipe_id'))


@login_required
@csrf_exempt
@require_http_methods(['POST'])
def api_start_course(request):
    _inject_user(request)
    data = _body(request)
    return _run(engine.start_course, data.get('worker_id'))
