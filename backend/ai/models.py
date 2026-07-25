from django.db import models
from episodes.models import Episode


class AIExplanation(models.Model):
    """Cached AI explanation for a transcript sentence."""
    episode = models.ForeignKey(Episode, on_delete=models.CASCADE, related_name='ai_explanations',
                                null=True, blank=True)
    sentence_index = models.IntegerField(default=0)
    sentence = models.TextField()
    explanation_en = models.TextField(blank=True, default='')
    explanation_zh = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ai_explanation'
        unique_together = ('episode', 'sentence_index')

    def __str__(self):
        return f"Explain #{self.sentence_index}: {self.sentence[:40]}"
