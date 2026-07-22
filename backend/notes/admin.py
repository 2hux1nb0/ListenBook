from django.contrib import admin
from .models import Note


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'episode', 'content_preview', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__username', 'content', 'episode__title']
    ordering = ['-created_at']

    def content_preview(self, obj):
        return obj.content[:50] + ('...' if len(obj.content) > 50 else '')
    content_preview.short_description = '内容预览'