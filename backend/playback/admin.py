from django.contrib import admin
from .models import PlayHistory


@admin.register(PlayHistory)
class PlayHistoryAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'episode', 'position_display', 'is_completed', 'last_played']
    list_filter = ['is_completed', 'last_played']
    search_fields = ['user__username', 'episode__title']
    ordering = ['-last_played']
    readonly_fields = ['last_played', 'created_at']

    def position_display(self, obj):
        m, s = divmod(obj.current_position, 60)
        return f"{m}:{s:02d}"
    position_display.short_description = '播放位置'