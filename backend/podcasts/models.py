from django.db import models


class Category(models.Model):
    """Podcast category."""
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    icon = models.CharField(max_length=50, blank=True, default='')
    color = models.CharField(max_length=7, default='#5858f5')
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'categories_category'
        ordering = ['sort_order', 'name']
        verbose_name_plural = 'Categories'

    def __str__(self):
        return self.name


class Podcast(models.Model):
    """Podcast model."""
    DIFFICULTY_CHOICES = [
        ('beginner', '初级'),
        ('intermediate', '中级'),
        ('advanced', '高级'),
    ]
    CONTENT_TYPE_CHOICES = [
        ('audio', '音频播客'),
        ('youtube', 'YouTube 视频'),
    ]

    title = models.CharField(max_length=300)
    slug = models.SlugField(max_length=300, unique=True)
    author = models.CharField(max_length=200, blank=True, default='')
    description = models.TextField(blank=True, default='')
    cover_image = models.ImageField(upload_to='podcasts/covers/', blank=True, null=True)
    # 外部封面直链（爬虫抓的官方专辑图）。前端优先用它，省去转存和带宽。
    cover_url = models.URLField(max_length=600, blank=True, default='')
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='podcasts')
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES, default='intermediate')
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPE_CHOICES, default='audio')
    youtube_url = models.URLField(blank=True, default='', help_text='YouTube 频道/视频地址（content_type=youtube 时填写）')
    language = models.CharField(max_length=10, default='en')
    website_url = models.URLField(blank=True, default='')
    feed_url = models.URLField(blank=True, default='')
    is_featured = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    episode_count = models.IntegerField(default=0)
    subscriber_count = models.IntegerField(default=0)
    avg_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'podcasts_podcast'
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class PodcastFollower(models.Model):
    """User following a podcast."""
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='followed_podcasts')
    podcast = models.ForeignKey(Podcast, on_delete=models.CASCADE, related_name='followers')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'podcasts_follower'
        unique_together = ('user', 'podcast')