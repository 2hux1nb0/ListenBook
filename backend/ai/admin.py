from django.contrib import admin
from .models import AIExplanation


@admin.register(AIExplanation)
class AIExplanationAdmin(admin.ModelAdmin):
    list_display = ('episode', 'sentence_index', 'sentence', 'created_at')
    search_fields = ('sentence',)
