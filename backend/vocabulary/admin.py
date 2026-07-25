from django.contrib import admin
from .models import Word


@admin.register(Word)
class WordAdmin(admin.ModelAdmin):
    list_display = ('user', 'term', 'pos', 'source', 'episode', 'created_at')
    search_fields = ('term', 'user__username')
    list_filter = ('source',)
