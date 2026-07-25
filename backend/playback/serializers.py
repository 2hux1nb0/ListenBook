from rest_framework import serializers
from .models import PlayHistory


class PlayHistorySerializer(serializers.ModelSerializer):
    episode_title = serializers.CharField(source='episode.title', read_only=True)
    podcast_title = serializers.CharField(source='episode.podcast.title', read_only=True)
    podcast_id = serializers.IntegerField(source='episode.podcast.id', read_only=True)

    class Meta:
        model = PlayHistory
        fields = ['id', 'episode', 'episode_title', 'podcast_title',
                  'current_position', 'duration', 'is_completed', 'last_played']
        read_only_fields = ['id', 'last_played']