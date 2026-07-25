from django.db import models
from accounts.models import User
from episodes.models import Episode


class ShadowRecord(models.Model):
    """A user's shadowing (repeat-after-me) recording for one transcript sentence."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='shadow_records')
    episode = models.ForeignKey(Episode, on_delete=models.SET_NULL, null=True, blank=True)
    sentence_index = models.IntegerField(default=0)
    sentence_text = models.TextField(blank=True, default='')
    audio_file = models.FileField(upload_to='shadowing/', blank=True, null=True)
    recorded_duration = models.FloatField(default=0.0, help_text='seconds')
    target_duration = models.FloatField(default=0.0, help_text='original sentence seconds')
    score = models.IntegerField(default=0, help_text='0-100 heuristic fluency score')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'shadowing_record'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} #{self.sentence_index} score={self.score}"
