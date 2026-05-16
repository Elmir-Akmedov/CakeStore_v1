import json
from datetime import timedelta
from decimal import Decimal

from django.contrib import admin, messages
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Count, Sum
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html

from . import game_engine as engine
from .models import (
    AdminActionLog,
    AdminNote,
    BakedCake,
    CakeRecipe,
    CourseConfig,
    ConfigImportJob,
    CustomerOrder,
    CustomerTypeConfig,
    DailyEventConfig,
    DayReport,
    DrinkRecipe,
    BrewStation,
    BrewingDrink,
    EventLog,
    GameBalanceConfig,
    GameState,
    HireableWorker,
    KitchenUpgradeConfig,
    Oven,
    OvenTypeConfig,
    PlayerSnapshot,
    SalaryRangeConfig,
    Worker,
    WorkerSkillConfig,
    WorkerTraitConfig,
    get_worker_skill_catalogue,
)


admin.site.site_header = "Cake Store Control Room"
admin.site.site_title = "Cake Store Admin"
admin.site.index_title = "Operations"
admin.site.index_template = "admin/game/control_room_index.html"


def admin_change_url(obj):
    opts = obj._meta
    return reverse(f"admin:{opts.app_label}_{opts.model_name}_change", args=[obj.pk])


def badge(text, color="#666"):
    return format_html('<strong style="color: {};">{}</strong>', color, text)


def object_link(obj, label=None):
    if not obj or not obj.pk:
        return "-"
    return format_html('<a href="{}">{}</a>', admin_change_url(obj), label or str(obj))


def snapshot_summary(state):
    return {
        "day": state.day,
        "money": str(state.money),
        "reputation": state.reputation,
        "is_open": state.is_open,
        "unlocked_recipes": state.unlocked_recipes.count(),
        "workers": state.workers.count(),
        "orders": state.orders.count(),
        "shelf": state.baked_cakes.filter(is_baking=False, remaining_slices__gt=0).count(),
    }


def log_admin_action(request, game_state, action_name, before=None, after=None, reason=""):
    AdminActionLog.objects.create(
        admin_user=request.user if request and request.user.is_authenticated else None,
        game_state=game_state,
        action_name=action_name,
        before_summary=before or {},
        after_summary=after or {},
        reason=reason,
    )


class GameStateScopedAdmin(admin.ModelAdmin):
    autocomplete_fields = ("game_state",)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("game_state", "game_state__user")


class SkillDisplayMixin:
    @admin.display(description="Skill", ordering="skill_id")
    def skill_name(self, obj):
        if not obj.skill_id:
            return "-"
        return get_worker_skill_catalogue().get(obj.skill_id, {}).get("name", obj.skill_id)

    @admin.display(description="Rarity", ordering="skill_rarity")
    def rarity_badge(self, obj):
        colors = {
            "standard": "#666",
            "rare": "#1d70b8",
            "epic": "#7b3fb2",
            "legendary": "#b86b00",
            "unique": "#b00040",
        }
        return badge((obj.skill_rarity or "-").title(), colors.get(obj.skill_rarity, "#666"))


class BaseConfigAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_enabled", "sort_order", "notes_preview")
    list_filter = ("is_enabled",)
    search_fields = ("code", "name", "notes")
    list_editable = ("is_enabled", "sort_order")
    actions = ("enable_selected", "disable_selected", "duplicate_selected", "export_selected_json")

    @admin.display(description="Notes")
    def notes_preview(self, obj):
        return (obj.notes[:70] + "...") if len(obj.notes) > 70 else obj.notes

    @admin.action(description="Enable selected configs")
    def enable_selected(self, request, queryset):
        count = queryset.update(is_enabled=True)
        self.message_user(request, f"Enabled {count} config row(s).")

    @admin.action(description="Disable selected configs")
    def disable_selected(self, request, queryset):
        count = queryset.update(is_enabled=False)
        self.message_user(request, f"Disabled {count} config row(s).")

    @admin.action(description="Duplicate selected configs")
    def duplicate_selected(self, request, queryset):
        created = 0
        for obj in queryset:
            base_code = f"{obj.code}_copy"
            code = base_code
            suffix = 2
            while queryset.model.objects.filter(code=code).exists():
                code = f"{base_code}_{suffix}"
                suffix += 1
            obj.pk = None
            obj.code = code
            obj.name = f"{obj.name} Copy"
            obj.is_enabled = False
            obj.save()
            created += 1
        self.message_user(request, f"Duplicated {created} config row(s) as disabled copies.")

    @admin.action(description="Export selected configs as JSON")
    def export_selected_json(self, request, queryset):
        payload = list(queryset.values())
        response = HttpResponse(
            json.dumps(payload, indent=2, cls=DjangoJSONEncoder),
            content_type="application/json",
        )
        response["Content-Disposition"] = f'attachment; filename="{queryset.model._meta.model_name}.json"'
        return response


@admin.register(OvenTypeConfig)
class OvenTypeConfigAdmin(BaseConfigAdmin):
    list_display = ("code", "name", "tier", "cost", "speed_bonus", "is_enabled", "sort_order")
    list_editable = ("cost", "speed_bonus", "is_enabled", "sort_order")


@admin.register(KitchenUpgradeConfig)
class KitchenUpgradeConfigAdmin(BaseConfigAdmin):
    list_display = ("code", "emoji", "name", "cost", "is_enabled", "sort_order", "description")
    list_editable = ("cost", "is_enabled", "sort_order")


@admin.register(DailyEventConfig)
class DailyEventConfigAdmin(BaseConfigAdmin):
    list_display = ("code", "icon", "title", "event_type", "weight", "is_enabled", "sort_order")
    list_filter = ("event_type", "is_enabled")
    list_editable = ("weight", "is_enabled", "sort_order")


@admin.register(WorkerSkillConfig)
class WorkerSkillConfigAdmin(BaseConfigAdmin):
    list_display = ("code", "name", "role", "rarity", "effect", "value", "is_negative", "is_enabled")
    list_filter = ("role", "rarity", "effect", "is_negative", "is_enabled")
    list_editable = ("value", "is_enabled")


@admin.register(WorkerTraitConfig)
class WorkerTraitConfigAdmin(BaseConfigAdmin):
    list_display = ("code", "icon", "name", "trait_type", "is_enabled", "sort_order")
    list_filter = ("trait_type", "is_enabled")


@admin.register(CustomerTypeConfig)
class CustomerTypeConfigAdmin(BaseConfigAdmin):
    list_display = ("code", "icon", "name", "patience_mult", "revenue_mult", "weight", "rep_on_fail", "is_enabled")
    list_editable = ("patience_mult", "revenue_mult", "weight", "is_enabled")


@admin.register(CourseConfig)
class CourseConfigAdmin(BaseConfigAdmin):
    list_display = ("code", "from_rarity", "to_rarity", "cost", "days", "is_enabled", "sort_order")
    list_editable = ("cost", "days", "is_enabled", "sort_order")


@admin.register(SalaryRangeConfig)
class SalaryRangeConfigAdmin(BaseConfigAdmin):
    list_display = ("code", "role", "skill_level", "hire_cost_min", "hire_cost_max", "salary_min", "salary_max", "is_enabled")
    list_filter = ("role", "skill_level", "is_enabled")
    list_editable = ("hire_cost_min", "hire_cost_max", "salary_min", "salary_max", "is_enabled")


@admin.register(GameBalanceConfig)
class GameBalanceConfigAdmin(BaseConfigAdmin):
    list_display = ("code", "name", "value_type", "value", "is_enabled", "sort_order")
    list_editable = ("value", "is_enabled", "sort_order")


CONFIG_IMPORT_TARGETS = {
    "oven_type": OvenTypeConfig,
    "kitchen_upgrade": KitchenUpgradeConfig,
    "daily_event": DailyEventConfig,
    "worker_skill": WorkerSkillConfig,
    "worker_trait": WorkerTraitConfig,
    "customer_type": CustomerTypeConfig,
    "course": CourseConfig,
    "salary_range": SalaryRangeConfig,
    "game_balance": GameBalanceConfig,
}


@admin.register(ConfigImportJob)
class ConfigImportJobAdmin(admin.ModelAdmin):
    list_display = ("target_model", "created_by", "created_at", "applied_at", "result")
    list_filter = ("target_model", "applied_at")
    search_fields = ("result", "created_by__username")
    readonly_fields = ("created_by", "created_at", "applied_at", "result")
    actions = ("apply_import_jobs",)

    def save_model(self, request, obj, form, change):
        if not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    @admin.action(description="Apply selected config imports")
    def apply_import_jobs(self, request, queryset):
        for job in queryset:
            model = CONFIG_IMPORT_TARGETS.get(job.target_model)
            if not model:
                job.result = "Unknown target model."
                job.save(update_fields=["result"])
                continue
            payload = job.payload if isinstance(job.payload, list) else []
            applied = 0
            for row in payload:
                if not isinstance(row, dict) or not row.get("code"):
                    continue
                data = dict(row)
                data.pop("id", None)
                code = data.pop("code")
                model.objects.update_or_create(code=code, defaults=data)
                applied += 1
            job.applied_at = timezone.now()
            job.result = f"Applied {applied} row(s)."
            job.save(update_fields=["applied_at", "result"])
        self.message_user(request, f"Processed {queryset.count()} import job(s).")


class AdminNoteInline(admin.TabularInline):
    model = AdminNote
    extra = 0
    fields = ("title", "body", "author", "updated_at")
    readonly_fields = ("author", "updated_at")


class PlayerSnapshotInline(admin.TabularInline):
    model = PlayerSnapshot
    extra = 0
    fields = ("label", "reason", "created_by", "created_at")
    readonly_fields = ("created_by", "created_at")
    can_delete = False


@admin.register(GameState)
class GameStateAdmin(admin.ModelAdmin):
    change_form_template = "admin/game/gamestate/change_form.html"
    list_display = (
        "player_link",
        "store_name",
        "day",
        "money",
        "reputation",
        "status_badge",
        "active_event_title",
        "unlocked_recipe_count",
        "worker_count",
        "pending_orders",
        "inventory_count",
        "latest_profit",
        "last_activity",
    )
    list_filter = ("is_open", "game_started", "course_discount_active")
    search_fields = ("store_name", "user__username", "user__email")
    filter_horizontal = ("unlocked_recipes",)
    inlines = (AdminNoteInline, PlayerSnapshotInline)
    readonly_fields = (
        "worker_count",
        "oven_count",
        "unlocked_recipe_count",
        "unlocked_recipe_names",
        "pending_orders",
        "inventory_count",
        "latest_report",
        "last_activity",
    )
    actions = (
        "create_snapshots",
        "open_stores",
        "close_stores",
        "end_days_safely",
        "add_100_money",
        "subtract_100_money",
        "add_10_reputation",
        "subtract_10_reputation",
        "grant_starter_recipes",
        "grant_all_recipes",
        "clear_active_event",
        "refresh_hire_pools",
    )
    fieldsets = (
        ("Player Store", {"fields": ("user", "store_name", "game_started", "is_open")}),
        ("Progress", {"fields": ("day", "money", "reputation", "total_revenue", "total_fulfilled")}),
        ("Player Menu", {"fields": ("unlocked_recipes", "unlocked_recipe_count", "unlocked_recipe_names")}),
        ("Timing", {"fields": ("day_started_at", "day_end_at", "next_order_at", "rush_ends_at")}),
        ("Events", {"fields": ("active_event", "event_counter", "critic_fresh_served", "todays_guest_id", "course_discount_active")}),
        ("Upgrades & Briefing", {"fields": ("owned_upgrades", "briefing_data", "pool_refreshed_day")}),
        ("Quick Snapshot", {"fields": ("worker_count", "oven_count", "pending_orders", "inventory_count", "latest_report", "last_activity")}),
    )
    ordering = ("-game_started", "-is_open", "user__username")

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "analytics/",
                self.admin_site.admin_view(self.analytics_view),
                name="game_gamestate_analytics",
            ),
        ]
        return custom_urls + urls

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("user").prefetch_related(
            "workers", "ovens", "orders", "baked_cakes", "day_reports",
            "event_logs", "unlocked_recipes", "admin_notes", "player_snapshots",
        )

    def change_view(self, request, object_id, form_url="", extra_context=None):
        state = self.get_queryset(request).get(pk=object_id)
        dashboard = self.build_dashboard_context(state)
        extra_context = extra_context or {}
        extra_context["dashboard"] = dashboard
        extra_context["analytics_url"] = reverse("admin:game_gamestate_analytics")
        return super().change_view(request, object_id, form_url, extra_context)

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for obj in instances:
            if isinstance(obj, AdminNote) and not obj.author_id:
                obj.author = request.user
            if isinstance(obj, PlayerSnapshot) and not obj.created_by_id:
                obj.created_by = request.user
            obj.save()
        for obj in formset.deleted_objects:
            obj.delete()
        formset.save_m2m()

    def analytics_view(self, request):
        states = GameState.objects.select_related("user").prefetch_related("workers", "ovens", "orders", "baked_cakes")
        top_players = states.order_by("-money")[:10]
        stuck_players = []
        for state in states:
            expired_count = state.orders.filter(status="expired").count()
            if (
                state.money < 0
                or state.ovens.filter(is_active=True).count() == 0
                or state.unlocked_recipes.count() == 0
                or expired_count >= 5
            ):
                stuck_players.append({"state": state, "expired_count": expired_count})
            if len(stuck_players) >= 25:
                break
        context = {
            **self.admin_site.each_context(request),
            "title": "Game Analytics",
            "top_players": top_players,
            "stuck_players": stuck_players,
            "recipe_popularity": (
                CustomerOrder.objects.filter(status="fulfilled")
                .values("recipe__name")
                .annotate(total=Count("id"), revenue=Sum("revenue"))
                .order_by("-total")[:20]
            ),
            "worker_roles": Worker.objects.values("role").annotate(total=Count("id")).order_by("role"),
            "event_frequency": EventLog.objects.values("log_type").annotate(total=Count("id")).order_by("-total"),
            "economy": DayReport.objects.aggregate(
                revenue=Sum("revenue"),
                salaries=Sum("worker_salaries"),
                waste=Sum("waste_cost"),
                net=Sum("net_profit"),
            ),
        }
        return TemplateResponse(request, "admin/game/analytics.html", context)

    def build_dashboard_context(self, state):
        current_day = state.day

        def row(obj, extra=None):
            data = {"obj": obj, "url": admin_change_url(obj)}
            if extra:
                data.update(extra)
            return data

        shelf = [
            row(cake, {
                "fresh": cake.is_fresh(state),
                "slice_price": cake.slice_price(state),
                "value": round(cake.remaining_slices * cake.slice_price(state), 2),
            })
            for cake in state.baked_cakes.filter(is_baking=False, remaining_slices__gt=0)
            .select_related("recipe", "oven")
            .order_by("-day_baked", "recipe__name")[:30]
        ]
        baking = [
            row(cake, {"progress": cake.progress_pct, "seconds": round(cake.seconds_remaining, 1)})
            for cake in state.baked_cakes.filter(is_baking=True)
            .select_related("recipe", "oven")
            .order_by("bake_finish_at")[:30]
        ]
        return {
            "overview": {
                "status": "Open" if state.is_open else "Closed",
                "timer": round(state.day_seconds_remaining, 1) if state.day_seconds_remaining is not None else None,
                "active_event": (state.active_event or {}).get("title") or "-",
                "upgrades": state.owned_upgrades or [],
            },
            "shelf": shelf,
            "baking": baking,
            "workers": [
                row(worker)
                for worker in state.workers.select_related("assigned_oven", "target_recipe").order_by("-is_active", "role", "name")[:40]
            ],
            "hire_pool": [
                row(worker)
                for worker in state.hireable_workers.order_by("is_hired", "expires_on_day", "role")[:40]
            ],
            "ovens": [row(oven) for oven in state.ovens.order_by("-is_active", "tier", "name")[:30]],
            "recipes": [
                row(recipe)
                for recipe in state.unlocked_recipes.order_by("cake_type", "name")[:60]
            ],
            "orders": [
                row(order)
                for order in state.orders.select_related("recipe").order_by("status", "expires_at")[:50]
            ],
            "reports": [row(report) for report in state.day_reports.order_by("-day")[:14]],
            "logs": [row(log) for log in state.event_logs.order_by("-timestamp")[:30]],
            "notes": [row(note) for note in state.admin_notes.order_by("-updated_at")[:10]],
            "snapshots": [row(snapshot) for snapshot in state.player_snapshots.order_by("-created_at")[:10]],
            "current_day": current_day,
        }

    @admin.display(description="Player", ordering="user__username")
    def player_link(self, obj):
        return object_link(obj.user, obj.user.username if obj.user_id else "anon")

    @admin.display(description="Status", ordering="is_open")
    def status_badge(self, obj):
        return badge("Open" if obj.is_open else "Closed", "#12805c" if obj.is_open else "#666")

    @admin.display(description="Active Event")
    def active_event_title(self, obj):
        return (obj.active_event or {}).get("title") or "-"

    @admin.display(description="Workers")
    def worker_count(self, obj):
        return obj.workers.filter(is_active=True).count()

    @admin.display(description="Unlocked Recipes")
    def unlocked_recipe_count(self, obj):
        return obj.unlocked_recipes.count()

    @admin.display(description="Unlocked Recipe Names")
    def unlocked_recipe_names(self, obj):
        names = list(obj.unlocked_recipes.order_by("name").values_list("name", flat=True))
        return ", ".join(names) or "-"

    @admin.display(description="Ovens")
    def oven_count(self, obj):
        return obj.ovens.filter(is_active=True).count()

    @admin.display(description="Pending Orders")
    def pending_orders(self, obj):
        return obj.orders.filter(status="pending").count()

    @admin.display(description="Shelf")
    def inventory_count(self, obj):
        return obj.baked_cakes.filter(is_baking=False, remaining_slices__gt=0).count()

    @admin.display(description="Latest Report")
    def latest_report(self, obj):
        report = obj.day_reports.order_by("-day").first()
        if not report:
            return "-"
        return f"Day {report.day}: net ${report.net_profit}"

    @admin.display(description="Latest Profit")
    def latest_profit(self, obj):
        report = obj.day_reports.order_by("-day").first()
        return report.net_profit if report else "-"

    @admin.display(description="Last Activity")
    def last_activity(self, obj):
        log = obj.event_logs.order_by("-timestamp").first()
        return log.timestamp if log else "-"

    def _mutate_states(self, request, queryset, action_name, mutator):
        count = 0
        for state in queryset:
            before = snapshot_summary(state)
            mutator(state)
            state.refresh_from_db()
            after = snapshot_summary(state)
            log_admin_action(request, state, action_name, before, after)
            count += 1
        self.message_user(request, f"{action_name}: updated {count} player store(s).")

    @admin.action(description="Create player snapshots")
    def create_snapshots(self, request, queryset):
        for state in queryset:
            PlayerSnapshot.capture(state, request.user, "Admin action snapshot", "Created from player list.")
            log_admin_action(request, state, "Create snapshot", snapshot_summary(state), snapshot_summary(state))
        self.message_user(request, f"Created {queryset.count()} snapshot(s).")

    @admin.action(description="Open selected stores")
    def open_stores(self, request, queryset):
        def mutate(state):
            state.is_open = True
            state.day_started_at = timezone.now()
            state.day_end_at = timezone.now() + timedelta(seconds=engine.get_balance_value("default_day_duration_seconds", 300, int))
            state.next_order_at = timezone.now()
            state.save(update_fields=["is_open", "day_started_at", "day_end_at", "next_order_at"])
        self._mutate_states(request, queryset, "Open store", mutate)

    @admin.action(description="Close selected stores")
    def close_stores(self, request, queryset):
        def mutate(state):
            state.is_open = False
            state.day_started_at = None
            state.day_end_at = None
            state.next_order_at = None
            state.save(update_fields=["is_open", "day_started_at", "day_end_at", "next_order_at"])
        self._mutate_states(request, queryset, "Close store", mutate)

    @admin.action(description="End day safely")
    def end_days_safely(self, request, queryset):
        ended = 0
        for state in queryset:
            if not state.user_id or not state.is_open:
                continue
            before = snapshot_summary(state)
            PlayerSnapshot.capture(state, request.user, "Before admin end day", "Automatic safety snapshot.")
            engine.set_current_user(state.user)
            try:
                engine.end_day()
            except ValueError as exc:
                self.message_user(request, f"{state}: {exc}", level=messages.WARNING)
                continue
            state.refresh_from_db()
            log_admin_action(request, state, "End day safely", before, snapshot_summary(state))
            ended += 1
        self.message_user(request, f"Ended day for {ended} store(s).")

    @admin.action(description="Add $100")
    def add_100_money(self, request, queryset):
        self._mutate_states(request, queryset, "Add $100", lambda state: (setattr(state, "money", state.money + Decimal("100")), state.save(update_fields=["money"])))

    @admin.action(description="Subtract $100")
    def subtract_100_money(self, request, queryset):
        self._mutate_states(request, queryset, "Subtract $100", lambda state: (setattr(state, "money", state.money - Decimal("100")), state.save(update_fields=["money"])))

    @admin.action(description="Add 10 reputation")
    def add_10_reputation(self, request, queryset):
        self._mutate_states(request, queryset, "Add 10 reputation", lambda state: (setattr(state, "reputation", min(100, state.reputation + 10)), state.save(update_fields=["reputation"])))

    @admin.action(description="Subtract 10 reputation")
    def subtract_10_reputation(self, request, queryset):
        self._mutate_states(request, queryset, "Subtract 10 reputation", lambda state: (setattr(state, "reputation", max(0, state.reputation - 10)), state.save(update_fields=["reputation"])))

    @admin.action(description="Grant starter recipes")
    def grant_starter_recipes(self, request, queryset):
        starters = CakeRecipe.objects.filter(is_starter=True)
        self._mutate_states(request, queryset, "Grant starter recipes", lambda state: state.unlocked_recipes.add(*starters))

    @admin.action(description="Grant all recipes")
    def grant_all_recipes(self, request, queryset):
        recipes = CakeRecipe.objects.all()
        self._mutate_states(request, queryset, "Grant all recipes", lambda state: state.unlocked_recipes.add(*recipes))

    @admin.action(description="Clear active event")
    def clear_active_event(self, request, queryset):
        def mutate(state):
            state.active_event = None
            state.event_counter = 0
            state.rush_ends_at = None
            state.course_discount_active = False
            state.save(update_fields=["active_event", "event_counter", "rush_ends_at", "course_discount_active"])
        self._mutate_states(request, queryset, "Clear active event", mutate)

    @admin.action(description="Refresh hire pool")
    def refresh_hire_pools(self, request, queryset):
        refreshed = 0
        for state in queryset:
            if not state.user_id:
                continue
            before = snapshot_summary(state)
            engine.set_current_user(state.user)
            engine.refresh_hire_pool()
            state.refresh_from_db()
            log_admin_action(request, state, "Refresh hire pool", before, snapshot_summary(state))
            refreshed += 1
        self.message_user(request, f"Refreshed {refreshed} hire pool(s).")


@admin.register(CakeRecipe)
class CakeRecipeAdmin(admin.ModelAdmin):
    list_display = (
        "emoji", "name", "cake_type", "price_small", "price_medium",
        "price_large", "ingredient_cost_pct", "is_unlocked", "is_starter",
        "unlocked_by_player_count", "unlock_summary",
    )
    list_filter = ("cake_type", "is_unlocked", "is_starter")
    search_fields = ("name", "unlock_message")
    list_editable = ("is_unlocked", "is_starter")
    readonly_fields = ("unlocked_by_player_count", "unlocked_by_player_names")
    ordering = ("cake_type", "name")
    fieldsets = (
        ("Recipe", {"fields": ("name", "emoji", "cake_type", "ingredients")}),
        ("Pricing", {"fields": ("price_small", "price_medium", "price_large", "ingredient_cost_pct")}),
        ("Bake Times", {"fields": ("bake_sec_small", "bake_sec_medium", "bake_sec_large")}),
        ("Default Unlocking", {"fields": ("is_unlocked", "is_starter", "shop_price", "unlock_day", "unlock_rep", "unlock_message")}),
        ("Player Progress", {"fields": ("unlocked_by_player_count", "unlocked_by_player_names")}),
        ("Secret Availability", {"fields": ("secret_available_from_day", "secret_expires_day"), "classes": ("collapse",)}),
    )
    actions = ("enable_recipes", "disable_recipes", "grant_to_all_players")

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("unlocked_by_states__user")

    @admin.display(description="Unlock")
    def unlock_summary(self, obj):
        parts = []
        if obj.shop_price:
            parts.append(f"${obj.shop_price}")
        if obj.unlock_day:
            parts.append(f"Day {obj.unlock_day}")
        if obj.unlock_rep:
            parts.append(f"Rep {obj.unlock_rep}")
        return ", ".join(parts) or ("Starter" if obj.is_starter else "-")

    @admin.display(description="Players Unlocked")
    def unlocked_by_player_count(self, obj):
        return obj.unlocked_by_states.count()

    @admin.display(description="Unlocked By")
    def unlocked_by_player_names(self, obj):
        names = []
        for state in obj.unlocked_by_states.all():
            owner = state.user.username if state.user_id else "anon"
            names.append(f"{owner} ({state.store_name})")
        return ", ".join(names) or "-"

    @admin.action(description="Enable selected recipes by default")
    def enable_recipes(self, request, queryset):
        self.message_user(request, f"Enabled {queryset.update(is_unlocked=True)} recipe(s).")

    @admin.action(description="Disable selected recipes by default")
    def disable_recipes(self, request, queryset):
        self.message_user(request, f"Disabled {queryset.update(is_unlocked=False)} recipe(s).")

    @admin.action(description="Grant selected recipes to all players")
    def grant_to_all_players(self, request, queryset):
        count = 0
        for state in GameState.objects.all():
            before = snapshot_summary(state)
            state.unlocked_recipes.add(*queryset)
            log_admin_action(request, state, "Grant selected recipes", before, snapshot_summary(state))
            count += 1
        self.message_user(request, f"Granted {queryset.count()} recipe(s) to {count} player store(s).")


@admin.register(Oven)
class OvenAdmin(GameStateScopedAdmin):
    list_display = ("name", "game_state", "tier", "speed_bonus", "busy_badge", "assigned_bakers", "bakes_count", "is_active", "purchased_on_day")
    list_filter = ("tier", "is_active", "game_state")
    search_fields = ("name", "game_state__store_name", "game_state__user__username")
    list_editable = ("is_active",)
    readonly_fields = ("busy_badge", "assigned_bakers", "current_cake_name")
    actions = ("activate_ovens", "deactivate_ovens")
    ordering = ("game_state__store_name", "tier", "name")

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("assigned_workers", "cakes")

    @admin.display(description="Busy")
    def busy_badge(self, obj):
        return badge("Baking", "#b86b00") if obj.is_busy else badge("Ready", "#12805c")

    @admin.display(description="Assigned Bakers")
    def assigned_bakers(self, obj):
        names = [w.name for w in obj.assigned_workers.all() if w.is_active]
        return ", ".join(names) or "-"

    @admin.display(description="Current Cake")
    def current_cake_name(self, obj):
        return object_link(obj.current_cake)

    @admin.action(description="Activate selected ovens")
    def activate_ovens(self, request, queryset):
        self.message_user(request, f"Activated {queryset.update(is_active=True)} oven(s).")

    @admin.action(description="Deactivate selected ovens")
    def deactivate_ovens(self, request, queryset):
        self.message_user(request, f"Deactivated {queryset.update(is_active=False)} oven(s).")


@admin.register(Worker)
class WorkerAdmin(SkillDisplayMixin, GameStateScopedAdmin):
    list_display = ("name", "game_state", "role", "skill_level", "level", "experience", "morale_badge", "rarity_badge", "skill_name", "assigned_oven", "work_mode", "course_status", "salary_per_day", "is_active")
    list_filter = ("role", "skill_rarity", "skill_level", "work_mode", "is_active", "game_state")
    search_fields = ("name", "game_state__store_name", "game_state__user__username", "skill_id", "positive_trait", "negative_trait")
    list_editable = ("is_active", "work_mode")
    autocomplete_fields = ("game_state", "assigned_oven", "target_recipe")
    readonly_fields = ("skill_name", "rarity_badge", "xp_progress_pct", "xp_for_next_level", "course_status")
    actions = ("activate_workers", "deactivate_workers", "restore_workers", "clear_assignments", "cancel_courses", "set_morale_100", "set_morale_50")
    ordering = ("game_state__store_name", "role", "-skill_level", "name")

    @admin.display(description="Morale", ordering="morale")
    def morale_badge(self, obj):
        color = "#12805c" if obj.morale >= 70 else "#b86b00" if obj.morale >= 35 else "#b00040"
        return badge(obj.morale, color)

    @admin.display(description="Course")
    def course_status(self, obj):
        if not obj.course_finish_day:
            return "-"
        return f"{obj.course_target_rarity} on day {obj.course_finish_day}"

    @admin.action(description="Activate selected workers")
    def activate_workers(self, request, queryset):
        self.message_user(request, f"Activated {queryset.update(is_active=True)} worker(s).")

    @admin.action(description="Deactivate/fire selected workers")
    def deactivate_workers(self, request, queryset):
        self.message_user(request, f"Deactivated {queryset.update(is_active=False, assigned_oven=None)} worker(s).")

    @admin.action(description="Restore inactive workers")
    def restore_workers(self, request, queryset):
        self.message_user(request, f"Restored {queryset.update(is_active=True)} worker(s).")

    @admin.action(description="Clear oven assignments")
    def clear_assignments(self, request, queryset):
        self.message_user(request, f"Cleared assignments for {queryset.update(assigned_oven=None)} worker(s).")

    @admin.action(description="Cancel courses")
    def cancel_courses(self, request, queryset):
        self.message_user(request, f"Canceled courses for {queryset.update(course_target_rarity='', course_finish_day=None)} worker(s).")

    @admin.action(description="Set morale to 100")
    def set_morale_100(self, request, queryset):
        self.message_user(request, f"Updated morale for {queryset.update(morale=100)} worker(s).")

    @admin.action(description="Set morale to 50")
    def set_morale_50(self, request, queryset):
        self.message_user(request, f"Updated morale for {queryset.update(morale=50)} worker(s).")


@admin.register(HireableWorker)
class HireableWorkerAdmin(SkillDisplayMixin, GameStateScopedAdmin):
    list_display = ("name", "game_state", "role", "skill_level", "rarity_badge", "skill_name", "salary_per_day", "hire_cost", "available_from_day", "expires_on_day", "is_hired")
    list_filter = ("role", "skill_rarity", "skill_level", "is_hired", "game_state")
    search_fields = ("name", "game_state__store_name", "game_state__user__username", "skill_id")
    list_editable = ("is_hired",)
    actions = ("mark_available", "mark_hired")
    ordering = ("game_state__store_name", "is_hired", "expires_on_day", "role")

    @admin.action(description="Mark selected candidates as available")
    def mark_available(self, request, queryset):
        self.message_user(request, f"Marked {queryset.update(is_hired=False)} candidate(s) as available.")

    @admin.action(description="Mark selected candidates as hired")
    def mark_hired(self, request, queryset):
        self.message_user(request, f"Marked {queryset.update(is_hired=True)} candidate(s) as hired.")


@admin.register(BakedCake)
class BakedCakeAdmin(GameStateScopedAdmin):
    list_display = ("recipe", "game_state", "size", "freshness_badge", "status_badge", "remaining_slices", "progress_pct", "seconds_left", "slice_price_display", "oven", "day_baked", "ingredient_cost", "manual_result_mult")
    list_filter = ("is_baking", "size", "day_baked", "game_state", "recipe__cake_type")
    search_fields = ("recipe__name", "game_state__store_name", "game_state__user__username", "oven__name")
    autocomplete_fields = ("game_state", "recipe", "oven")
    readonly_fields = ("progress_pct", "seconds_left", "slice_price_display", "total_slices")
    actions = ("mark_finished", "move_to_shelf", "clear_inventory", "clear_stale_cakes", "set_full_slices")
    ordering = ("-is_baking", "-day_baked", "recipe__name")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("recipe", "oven")

    @admin.display(description="Fresh")
    def freshness_badge(self, obj):
        if not obj.game_state_id or obj.is_baking:
            return "-"
        return badge("Fresh", "#12805c") if obj.is_fresh(obj.game_state) else badge("Stale", "#b00040")

    @admin.display(description="Status", ordering="is_baking")
    def status_badge(self, obj):
        return badge("Baking", "#b86b00") if obj.is_baking else badge("Shelf", "#12805c")

    @admin.display(description="Seconds Left")
    def seconds_left(self, obj):
        return round(obj.seconds_remaining, 1)

    @admin.display(description="Slice Price")
    def slice_price_display(self, obj):
        return f"${obj.slice_price(obj.game_state):.2f}" if obj.game_state else "-"

    @admin.action(description="Mark selected cakes as finished")
    def mark_finished(self, request, queryset):
        self.message_user(request, f"Marked {queryset.update(is_baking=False, baked_time=timezone.now(), bake_finish_at=None)} cake(s) as finished.")

    @admin.action(description="Move selected baking cakes to shelf")
    def move_to_shelf(self, request, queryset):
        self.mark_finished(request, queryset)

    @admin.action(description="Set remaining slices to zero")
    def clear_inventory(self, request, queryset):
        self.message_user(request, f"Cleared inventory for {queryset.update(remaining_slices=0)} cake(s).")

    @admin.action(description="Clear stale cakes")
    def clear_stale_cakes(self, request, queryset):
        count = 0
        for cake in queryset:
            if cake.game_state_id and not cake.is_baking and not cake.is_fresh(cake.game_state):
                cake.remaining_slices = 0
                cake.save(update_fields=["remaining_slices"])
                count += 1
        self.message_user(request, f"Cleared {count} stale cake(s).")

    @admin.action(description="Set remaining slices to full size")
    def set_full_slices(self, request, queryset):
        count = 0
        for cake in queryset:
            cake.remaining_slices = cake.total_slices
            cake.save(update_fields=["remaining_slices"])
            count += 1
        self.message_user(request, f"Restored slices for {count} cake(s).")


@admin.register(CustomerOrder)
class CustomerOrderAdmin(GameStateScopedAdmin):
    list_display = ("customer_name", "game_state", "recipe", "size", "quantity", "pieces", "customer_type", "order_type", "urgency_badge", "status", "revenue", "tip", "satisfaction", "day_placed", "seconds_left")
    list_filter = ("status", "customer_type", "order_type", "want_fresh", "size", "day_placed", "game_state")
    search_fields = ("customer_name", "recipe__name", "game_state__store_name", "game_state__user__username")
    autocomplete_fields = ("game_state", "recipe")
    readonly_fields = ("urgency_badge", "seconds_left")
    date_hierarchy = "placed_at"
    actions = ("mark_pending", "mark_fulfilled", "mark_expired", "extend_5_minutes", "recalculate_revenue")
    ordering = ("status", "expires_at")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("recipe")

    @admin.display(description="Urgency")
    def urgency_badge(self, obj):
        colors = {"normal": "#12805c", "urgent": "#b86b00", "critical": "#b00040", "done": "#666"}
        return badge(obj.urgency.title(), colors.get(obj.urgency, "#666"))

    @admin.display(description="Seconds Left")
    def seconds_left(self, obj):
        return round(obj.seconds_remaining, 1) if obj.status == "pending" else "-"

    @admin.action(description="Mark selected orders as pending")
    def mark_pending(self, request, queryset):
        self.message_user(request, f"Marked {queryset.update(status='pending', fulfilled_at=None)} order(s) as pending.")

    @admin.action(description="Mark selected orders as fulfilled")
    def mark_fulfilled(self, request, queryset):
        self.message_user(request, f"Marked {queryset.update(status='fulfilled', fulfilled_at=timezone.now())} order(s) as fulfilled.")

    @admin.action(description="Mark selected orders as expired")
    def mark_expired(self, request, queryset):
        self.message_user(request, f"Marked {queryset.update(status='expired', fulfilled_at=None)} order(s) as expired.")

    @admin.action(description="Extend expiration by 5 minutes")
    def extend_5_minutes(self, request, queryset):
        count = 0
        for order in queryset:
            order.expires_at = order.expires_at + timedelta(minutes=5)
            order.save(update_fields=["expires_at"])
            count += 1
        self.message_user(request, f"Extended {count} order(s).")

    @admin.action(description="Recalculate revenue")
    def recalculate_revenue(self, request, queryset):
        count = 0
        for order in queryset.select_related("game_state", "recipe"):
            order.revenue = order.calculate_revenue(order.game_state)
            order.save(update_fields=["revenue"])
            count += 1
        self.message_user(request, f"Recalculated {count} order(s).")


@admin.register(DayReport)
class DayReportAdmin(GameStateScopedAdmin):
    autocomplete_fields = ()
    list_display = ("day", "game_state", "revenue", "worker_salaries", "ingredient_costs", "waste_cost", "net_profit", "orders_fulfilled", "orders_expired", "customer_satisfaction", "best_seller", "created_at")
    list_filter = ("day", "game_state", "created_at")
    search_fields = ("game_state__store_name", "game_state__user__username", "best_seller")
    readonly_fields = [field.name for field in DayReport._meta.fields]
    date_hierarchy = "created_at"
    ordering = ("-day",)

    def has_add_permission(self, request):
        return False


@admin.register(EventLog)
class EventLogAdmin(GameStateScopedAdmin):
    list_display = ("timestamp", "day", "game_state", "type_badge", "icon", "short_message")
    list_filter = ("log_type", "day", "game_state", "timestamp")
    search_fields = ("message", "game_state__store_name", "game_state__user__username")
    readonly_fields = ("timestamp",)
    date_hierarchy = "timestamp"
    ordering = ("-timestamp",)

    @admin.display(description="Type", ordering="log_type")
    def type_badge(self, obj):
        colors = {"success": "#12805c", "warning": "#b86b00", "error": "#b00040", "info": "#1d70b8"}
        return badge(obj.log_type, colors.get(obj.log_type, "#666"))

    @admin.display(description="Message")
    def short_message(self, obj):
        return obj.message if len(obj.message) <= 90 else f"{obj.message[:87]}..."


@admin.register(DrinkRecipe)
class DrinkRecipeAdmin(admin.ModelAdmin):
    list_display = ("name", "emoji", "brew_time_sec", "price", "ingredient_cost_pct", "is_unlocked", "is_starter", "unlock_day")
    list_filter = ("is_unlocked", "is_starter", "unlock_day")
    search_fields = ("name",)
    actions = ("enable_drinks", "disable_drinks")

    @admin.action(description="Unlock selected drinks")
    def enable_drinks(self, request, queryset):
        self.message_user(request, f"Unlocked {queryset.update(is_unlocked=True)} drink(s).")

    @admin.action(description="Lock selected drinks")
    def disable_drinks(self, request, queryset):
        self.message_user(request, f"Locked {queryset.update(is_unlocked=False)} drink(s).")


@admin.register(BrewStation)
class BrewStationAdmin(GameStateScopedAdmin):
    list_display = ("name", "game_state", "is_active", "is_busy", "purchased_on_day", "cost", "brews_count")
    list_filter = ("is_active", "purchased_on_day", "game_state")
    search_fields = ("name", "game_state__store_name", "game_state__user__username")
    actions = ("activate_stations", "deactivate_stations")

    @admin.action(description="Activate selected brew stations")
    def activate_stations(self, request, queryset):
        self.message_user(request, f"Activated {queryset.update(is_active=True)} brew station(s).")

    @admin.action(description="Deactivate selected brew stations")
    def deactivate_stations(self, request, queryset):
        self.message_user(request, f"Deactivated {queryset.update(is_active=False)} brew station(s).")


@admin.register(BrewingDrink)
class BrewingDrinkAdmin(GameStateScopedAdmin):
    list_display = ("recipe", "game_state", "station", "is_brewing", "seconds_left", "day_brewed", "ingredient_cost")
    list_filter = ("is_brewing", "day_brewed", "game_state")
    search_fields = ("recipe__name", "station__name", "game_state__store_name", "game_state__user__username")
    actions = ("finish_brewing", "clear_brewing")

    @admin.display(description="Seconds Left")
    def seconds_left(self, obj):
        return round(obj.seconds_remaining, 1) if obj.is_brewing else 0

    @admin.action(description="Finish selected brewing drinks")
    def finish_brewing(self, request, queryset):
        self.message_user(request, f"Finished {queryset.update(is_brewing=False)} brewing drink(s).")

    @admin.action(description="Clear selected brewing drinks")
    def clear_brewing(self, request, queryset):
        count = queryset.count()
        queryset.delete()
        self.message_user(request, f"Cleared {count} brewing drink(s).")


@admin.register(AdminNote)
class AdminNoteAdmin(GameStateScopedAdmin):
    list_display = ("title", "game_state", "author", "updated_at")
    search_fields = ("title", "body", "game_state__store_name", "game_state__user__username")
    list_filter = ("updated_at",)
    readonly_fields = ("author", "created_at", "updated_at")

    def save_model(self, request, obj, form, change):
        if not obj.author_id:
            obj.author = request.user
        super().save_model(request, obj, form, change)


@admin.register(AdminActionLog)
class AdminActionLogAdmin(GameStateScopedAdmin):
    autocomplete_fields = ()
    list_display = ("created_at", "action_name", "game_state", "admin_user", "reason")
    search_fields = ("action_name", "reason", "game_state__store_name", "game_state__user__username", "admin_user__username")
    list_filter = ("created_at", "action_name")
    readonly_fields = [field.name for field in AdminActionLog._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(PlayerSnapshot)
class PlayerSnapshotAdmin(GameStateScopedAdmin):
    list_display = ("label", "game_state", "created_by", "created_at", "reason")
    search_fields = ("label", "reason", "game_state__store_name", "game_state__user__username")
    list_filter = ("created_at",)
    readonly_fields = ("created_by", "created_at", "data")
    actions = ("restore_core_state",)

    def save_model(self, request, obj, form, change):
        if not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    @admin.action(description="Restore core state and unlocked recipes")
    def restore_core_state(self, request, queryset):
        count = 0
        for snapshot in queryset:
            before = snapshot_summary(snapshot.game_state)
            snapshot.restore_core_state()
            log_admin_action(request, snapshot.game_state, "Restore snapshot core state", before, snapshot_summary(snapshot.game_state), snapshot.label)
            count += 1
        self.message_user(request, f"Restored {count} snapshot(s).")
