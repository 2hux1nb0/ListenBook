from rest_framework import serializers
from .models import ShadowRecord


class ShadowRecordSerializer(serializers.ModelSerializer):
    episode_title = serializers.CharField(source='episode.title', read_only=True)
    audio_url = serializers.SerializerMethodField()

    class Meta:
        model = ShadowRecord
        fields = [
            'id', 'episode', 'episode_title', 'sentence_index', 'sentence_text',
            'audio_url', 'recorded_duration', 'target_duration', 'score', 'created_at',
        ]
        read_only_fields = ['id', 'score', 'created_at', 'audio_url']

    def get_audio_url(self, obj):
        if obj.audio_file:
            request = self.context.get('request')
            url = obj.audio_file.url
            if request:
                return request.build_absolute_uri(url)
            return url
        return None


def score_recording(recorded_duration, target_duration):
    """Heuristic fluency score (0-100).

    Without a speech-recognition service we use the recorded duration vs the
    original sentence duration as a fluency proxy: a close match means the
    learner spoke at a natural pace. A minimum recorded length is required so
    silence is not rewarded.
    """
    if recorded_duration <= 0.3:
        return 0
    if target_duration <= 0:
        return 60
    ratio = recorded_duration / target_duration
    # ideal ratio is ~1.0; penalize deviation
    deviation = abs(ratio - 1.0)
    if ratio < 0.5:
        # spoke too little (trailing off) -> low
        base = max(0, 70 - deviation * 60)
    elif ratio > 1.8:
        # spoke too much / dragging -> moderate
        base = max(0, 75 - (ratio - 1.0) * 25)
    else:
        base = 100 - deviation * 55
    return int(max(0, min(100, round(base))))
