from django.contrib import admin
from .models import ShadowRecord


@admin.register(ShadowRecord)
class ShadowRecordAdmin(admin.ModelAdmin):
    list_display = ('user', 'episode', 'sentence_index', 'score', 'recorded_duration', 'created_at')
    list_filter = ('episode',)
    search_fields = ('user__username', 'sentence_text')
