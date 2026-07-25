from django.db import models
from django.utils import timezone
from accounts.models import User

# Features available to every free user
FREE_FEATURES = [
    'basic_player',   # play audio / watch video
    'transcript',     # view bilingual transcript
    'translation',    # show Chinese translation
    'notes',          # take notes
    'favorites',      # follow podcasts
    'history',        # playback history
    'vocabulary',     # save words to word bank
]

# Feature labels (zh) used by the frontend paywall / membership page
FEATURE_LABELS = {
    'basic_player': '基础播放',
    'transcript': '双语字幕',
    'translation': '中文翻译',
    'notes': '学习笔记',
    'favorites': '收藏关注',
    'history': '播放历史',
    'vocabulary': '生词本',
    'ai_explain': 'AI 智能讲解',
    'shadowing': 'AI 跟读评分',
    'hd_audio': '高清音质',
    'all_content': '全部精选内容',
    'no_ads': '免广告干扰',
    'offline': '离线下载',
}


class MembershipTier(models.Model):
    """A membership plan (Free / Pro / Premium ...)."""
    slug = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=50, verbose_name='名称')
    name_en = models.CharField(max_length=50, blank=True, default='')
    price_monthly = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    price_yearly = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    description = models.TextField(blank=True, default='')
    # list of feature keys enabled for this tier
    features = models.JSONField(default=list)
    badge_color = models.CharField(max_length=7, default='#5858f5')
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'membership_tier'
        ordering = ['sort_order']

    def __str__(self):
        return self.name


class UserMembership(models.Model):
    STATUS_CHOICES = [
        ('active', '生效中'),
        ('canceled', '已取消'),
        ('expired', '已过期'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='membership')
    tier = models.ForeignKey(MembershipTier, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    auto_renew = models.BooleanField(default=False)
    payment_method = models.CharField(max_length=20, blank=True, default='')  # mock_card / apple / google
    order_id = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'membership_usermembership'

    def __str__(self):
        return f"{self.user.username} -> {self.tier.name if self.tier else 'Free'} ({self.status})"

    @property
    def is_active(self):
        if self.status != 'active':
            return False
        if self.tier is None:
            return False
        if self.expires_at and self.expires_at < timezone.now():
            return False
        return True

    def enabled_features(self):
        feats = list(FREE_FEATURES)
        if self.is_active and self.tier:
            feats += list(self.tier.features or [])
        return list(dict.fromkeys(feats))  # dedupe, keep order


def get_user_features(user):
    """Return the set of feature keys enabled for a user."""
    if not user or not getattr(user, 'is_authenticated', False):
        return set(FREE_FEATURES)
    membership = getattr(user, 'membership', None)
    if membership is None:
        return set(FREE_FEATURES)
    return set(membership.enabled_features())
