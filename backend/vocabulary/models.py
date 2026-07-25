from django.db import models
from accounts.models import User
from episodes.models import Episode


class Word(models.Model):
    """A word saved by a user into their personal word bank."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='words')
    term = models.CharField(max_length=120)
    pronunciation = models.CharField(max_length=120, blank=True, default='')
    pos = models.CharField(max_length=40, blank=True, default='', help_text='part of speech')
    definition = models.TextField(blank=True, default='', help_text='中文释义')
    example = models.TextField(blank=True, default='')
    source = models.CharField(max_length=20, blank=True, default='transcript',
                              help_text='transcript / manual / ai')
    episode = models.ForeignKey(Episode, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vocabulary_word'
        unique_together = ('user', 'term')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username}: {self.term}"
