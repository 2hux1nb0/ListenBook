from django.contrib import admin
from django.utils.html import format_html
from .models import Episode


@admin.register(Episode)
class EpisodeAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'podcast_link', 'duration_display', 'episode_number',
                    'is_active', 'play_count', 'publish_date']
    list_editable = ['is_active']
    list_filter = ['is_active', 'podcast__category', 'podcast__difficulty', 'publish_date']
    search_fields = ['title', 'description', 'podcast__title']
    readonly_fields = ['play_count', 'created_at']
    ordering = ['-publish_date', '-episode_number']
    fieldsets = (
        ('基本信息', {
            'fields': ('podcast', 'title', 'description', 'episode_number', 'season_number')
        }),
        ('音频', {
            'fields': ('audio_url', 'audio_duration', 'audio_size')
        }),
        ('字幕', {
            'fields': ('subtitle_en', 'subtitle_zh')
        }),
        ('状态和统计', {
            'fields': ('is_active', 'play_count', 'publish_date', 'created_at')
        }),
    )
    actions = ['make_published', 'make_unpublished']

    def podcast_link(self, obj):
        return format_html(
            '<a href="/admin/podcasts/podcast/{}/change/" target="_blank">{}</a>',
            obj.podcast_id, obj.podcast.title
        )
    podcast_link.short_description = '播客'
    podcast_link.admin_order_field = 'podcast__title'

    def duration_display(self, obj):
        m, s = divmod(obj.audio_duration, 60)
        h, m = divmod(m, 60)
        if h > 0:
            return f"{h}:{m:02d}:{s:02d}"
        return f"{m}:{s:02d}"
    duration_display.short_description = '时长'
    duration_display.admin_order_field = 'audio_duration'

    def make_published(self, request, queryset):
        queryset.update(is_active=True)
        self.message_user(request, f'已上架 {queryset.count()} 个节目')
    make_published.short_description = '上架选中的节目'

    def make_unpublished(self, request, queryset):
        queryset.update(is_active=False)
        self.message_user(request, f'已下架 {queryset.count()} 个节目')
    make_unpublished.short_description = '下架选中的节目'