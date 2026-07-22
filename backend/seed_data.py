"""
Seed data script for ListenLeap.
Run: python3 manage.py shell < seed_data.py
"""
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from podcasts.models import Category, Podcast
from episodes.models import Episode
from accounts.models import LearningStats

User = get_user_model()

# Create superuser
if not User.objects.filter(username='admin').exists():
    admin = User.objects.create_superuser('admin', 'admin@listenleap.com', 'admin123')
    admin.nickname = '管理员'
    admin.save()
    LearningStats.objects.create(user=admin)
    print('✅ Superuser created: admin / admin123')

# Create test user
if not User.objects.filter(username='testuser').exists():
    test_user = User.objects.create_user('testuser', 'test@listenleap.com', 'test123')
    test_user.nickname = '测试用户'
    test_user.learning_level = 'intermediate'
    test_user.save()
    LearningStats.objects.create(user=test_user, total_listen_minutes=120, total_episodes_played=15, streak_days=7)
    print('✅ Test user created: testuser / test123')

# Create categories
categories_data = [
    {'name': '新闻时事', 'slug': 'news', 'icon': 'newspaper', 'color': '#e74c3c', 'sort_order': 1},
    {'name': '科技', 'slug': 'tech', 'icon': 'microchip', 'color': '#3498db', 'sort_order': 2},
    {'name': '商业', 'slug': 'business', 'icon': 'briefcase', 'color': '#f39c12', 'sort_order': 3},
    {'name': '教育', 'slug': 'education', 'icon': 'graduation-cap', 'color': '#2ecc71', 'sort_order': 4},
    {'name': '健康', 'slug': 'health', 'icon': 'heartbeat', 'color': '#e91e63', 'sort_order': 5},
    {'name': '社会', 'slug': 'society', 'icon': 'users', 'color': '#9b59b6', 'sort_order': 6},
    {'name': '文化', 'slug': 'culture', 'icon': 'palette', 'color': '#1abc9c', 'sort_order': 7},
    {'name': '科学', 'slug': 'science', 'icon': 'flask', 'color': '#e67e22', 'sort_order': 8},
    {'name': '体育', 'slug': 'sports', 'icon': 'futbol', 'color': '#27ae60', 'sort_order': 9},
    {'name': '娱乐', 'slug': 'entertainment', 'icon': 'film', 'color': '#e74c3c', 'sort_order': 10},
    {'name': '故事', 'slug': 'story', 'icon': 'book-open', 'color': '#8e44ad', 'sort_order': 11},
]

categories = {}
for cat_data in categories_data:
    cat, created = Category.objects.get_or_create(
        slug=cat_data['slug'], defaults=cat_data
    )
    categories[cat_data['slug']] = cat
    if created:
        print(f'✅ Category created: {cat.name}')

# Create podcasts
podcasts_data = [
    {
        'title': 'BBC News Daily',
        'slug': 'bbc-news-daily',
        'author': 'BBC News',
        'category': 'news',
        'difficulty': 'advanced',
        'description': '每日新闻播报，涵盖全球重要事件。',
        'is_featured': True,
    },
    {
        'title': 'NPR News Now',
        'slug': 'npr-news-now',
        'author': 'NPR',
        'category': 'news',
        'difficulty': 'intermediate',
        'description': '美国国家公共电台的新闻播报。',
    },
    {
        'title': 'CNN 10',
        'slug': 'cnn-10',
        'author': 'CNN',
        'category': 'news',
        'difficulty': 'beginner',
        'description': '专为学生设计的10分钟新闻播报。',
    },
    {
        'title': 'Lex Fridman Podcast',
        'slug': 'lex-fridman-podcast',
        'author': 'Lex Fridman',
        'category': 'tech',
        'difficulty': 'advanced',
        'description': '深度访谈科技领袖和科学家。',
        'is_featured': True,
    },
    {
        'title': 'TED Talks Daily',
        'slug': 'ted-talks-daily',
        'author': 'TED',
        'category': 'education',
        'difficulty': 'intermediate',
        'description': 'TED演讲合集，涵盖科技、娱乐、设计等多个领域。',
        'is_featured': True,
    },
    {
        'title': '6 Minute English',
        'slug': '6-minute-english',
        'author': 'BBC Learning English',
        'category': 'education',
        'difficulty': 'beginner',
        'description': 'BBC出品的英语学习节目，每期6分钟。',
    },
    {
        'title': 'How I Built This',
        'slug': 'how-i-built-this',
        'author': 'Guy Raz / NPR',
        'category': 'business',
        'difficulty': 'intermediate',
        'description': '创业者分享他们的成功故事和创业历程。',
        'is_featured': True,
    },
    {
        'title': 'The Huberman Lab',
        'slug': 'huberman-lab',
        'author': 'Andrew Huberman',
        'category': 'health',
        'difficulty': 'advanced',
        'description': '斯坦福大学神经科学家讲解大脑和身体科学。',
    },
    {
        'title': 'Radiolab',
        'slug': 'radiolab',
        'author': 'WNYC Studios',
        'category': 'science',
        'difficulty': 'intermediate',
        'description': '用创新的声音设计讲述科学故事。',
    },
    {
        'title': 'The Moth',
        'slug': 'the-moth',
        'author': 'The Moth',
        'category': 'story',
        'difficulty': 'intermediate',
        'description': '真实故事讲述播客。',
        'is_featured': True,
    },
    {
        'title': 'TechCrunch Daily',
        'slug': 'techcrunch-daily',
        'author': 'TechCrunch',
        'category': 'tech',
        'difficulty': 'intermediate',
        'description': '每日科技新闻和创业公司动态。',
    },
    {
        'title': 'The Tim Ferriss Show',
        'slug': 'tim-ferriss-show',
        'author': 'Tim Ferriss',
        'category': 'business',
        'difficulty': 'advanced',
        'description': '深度访谈世界顶级人物。',
    },
]

episodes_data = {
    'bbc-news-daily': [
        {'title': 'Global Economy Update - January 2024', 'audio_duration': 1112, 'publish_date': '2024-01-15'},
        {'title': 'Climate Summit: Key Takeaways', 'audio_duration': 945, 'publish_date': '2024-01-14'},
        {'title': 'Tech Industry Layoffs Continue', 'audio_duration': 740, 'publish_date': '2024-01-13'},
    ],
    'npr-news-now': [
        {'title': 'Breaking: Major Policy Changes Announced', 'audio_duration': 615, 'publish_date': '2024-01-15'},
        {'title': 'Community Stories: Local Heroes', 'audio_duration': 510, 'publish_date': '2024-01-14'},
    ],
    'ted-talks-daily': [
        {'title': 'The Power of Vulnerability', 'audio_duration': 1215, 'publish_date': '2024-01-15'},
        {'title': 'How Great Leaders Inspire Action', 'audio_duration': 1110, 'publish_date': '2024-01-10'},
    ],
    '6-minute-english': [
        {'title': 'Learning a Language', 'audio_duration': 360, 'publish_date': '2024-01-15'},
        {'title': 'Food and Health', 'audio_duration': 360, 'publish_date': '2024-01-08'},
    ],
}

podcasts_created = 0
episodes_created = 0
for pdata in podcasts_data:
    cat = categories.get(pdata.pop('category'))
    podcast, created = Podcast.objects.get_or_create(
        slug=pdata['slug'], defaults={**pdata, 'category': cat}
    )
    if created:
        podcasts_created += 1
        # Create episodes
        eps = episodes_data.get(podcast.slug, [])
        ep_count = 0
        for ep_data in eps:
            ep, ep_created = Episode.objects.get_or_create(
                podcast=podcast, title=ep_data['title'], defaults=ep_data
            )
            if ep_created:
                ep_count += 1
        podcast.episode_count = Episode.objects.filter(podcast=podcast).count()
        podcast.save()

print(f'\n🎉 Seed data complete!')
print(f'   Categories: {Category.objects.count()}')
print(f'   Podcasts: {Podcast.objects.count()}')
print(f'   Episodes: {Episode.objects.count()}')
print(f'\n   Admin login: admin / admin123')
print(f'   Test login: testuser / test123')