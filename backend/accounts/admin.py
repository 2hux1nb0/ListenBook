from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html
from .models import User, LearningStats


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['id', 'username', 'email', 'is_staff', 'is_active', 'date_joined', 'last_login']
    list_filter = ['is_active', 'is_staff', 'is_superuser', 'date_joined']
    search_fields = ['username', 'email']
    ordering = ['-date_joined']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('额外信息', {'fields': ('avatar', 'bio')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('额外信息', {'fields': ('avatar', 'bio')}),
    )


@admin.register(LearningStats)
class LearningStatsAdmin(admin.ModelAdmin):
    list_display = ['user', 'total_listen_minutes', 'total_episodes_played', 'streak_days', 'weekly_goal_minutes']
    search_fields = ['user__username']
    list_filter = ['streak_days']