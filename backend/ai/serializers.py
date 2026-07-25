from rest_framework import serializers
from .models import AIExplanation


class AIExplanationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIExplanation
        fields = ['id', 'episode', 'sentence_index', 'sentence', 'explanation_en', 'explanation_zh', 'created_at']
