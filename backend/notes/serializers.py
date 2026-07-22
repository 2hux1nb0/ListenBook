from rest_framework import serializers
from .models import Note


class NoteSerializer(serializers.ModelSerializer):
    episode_title = serializers.CharField(source='episode.title', read_only=True)

    class Meta:
        model = Note
        fields = ['id', 'episode', 'episode_title', 'content', 'timestamp_seconds', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']