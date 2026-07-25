from rest_framework import serializers
from .models import Word


class WordSerializer(serializers.ModelSerializer):
    episode_title = serializers.CharField(source='episode.title', read_only=True)

    class Meta:
        model = Word
        fields = [
            'id', 'term', 'pronunciation', 'pos', 'definition', 'example',
            'source', 'episode', 'episode_title', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class WordCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Word
        fields = ['term', 'pronunciation', 'pos', 'definition', 'example', 'source', 'episode']

    def validate_term(self, value):
        return value.strip().lower()
