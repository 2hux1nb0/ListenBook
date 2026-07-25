"""
Seed data script for ListenBook.
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
from membership.models import MembershipTier, UserMembership

User = get_user_model()

# Create superuser
if not User.objects.filter(username='admin').exists():
    admin = User.objects.create_superuser('admin', 'admin@listenbook.com', 'admin123456')
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

# Each episode may carry a bilingual transcript.
# Lines use the format:  MM:SS text   (one line per cue).
# Lines without a leading timestamp are treated as un-timed notes.
episodes_data = {
    'bbc-news-daily': [
        {'title': 'Global Economy Update - January 2024', 'audio_duration': 1112, 'publish_date': '2024-01-15',
         'subtitle_en': "00:00 Welcome to the Global Economy Update for January 2024.\n00:12 Markets opened higher across Asia this morning.\n00:28 Investors remain cautious about inflation data due next week.\n00:55 Central banks signal a slower pace of rate changes.\n01:20 Energy prices eased after a mild winter in Europe.\n01:48 We will keep watching the numbers closely.",
         'subtitle_zh': "00:00 欢迎收听2024年1月的全球经济简报。\n00:12 今晨亚洲股市普遍高开。\n00:28 投资者对下周公布的通胀数据仍保持谨慎。\n00:55 各国央行暗示将放缓加息节奏。\n01:20 欧洲暖冬过后，能源价格回落。\n01:48 我们将持续密切关注相关数据。"},
        {'title': 'Climate Summit: Key Takeaways', 'audio_duration': 945, 'publish_date': '2024-01-14'},
        {'title': 'Tech Industry Layoffs Continue', 'audio_duration': 740, 'publish_date': '2024-01-13'},
    ],
    'npr-news-now': [
        {'title': 'Breaking: Major Policy Changes Announced', 'audio_duration': 615, 'publish_date': '2024-01-15'},
        {'title': 'Community Stories: Local Heroes', 'audio_duration': 510, 'publish_date': '2024-01-14'},
    ],
    'ted-talks-daily': [
        {'title': 'The Power of Vulnerability', 'audio_duration': 1215, 'publish_date': '2024-01-15',
         'subtitle_en': "00:00 Vulnerability is not weakness; it is our most accurate measure of courage.\n00:22 We pretend that everything is okay when it is not.\n00:48 The people who have a sense of worthiness simply believe they are enough.\n01:20 Let yourself be seen, deeply seen.\n01:55 Love with your whole heart, even though there is no guarantee.",
         'subtitle_zh': "00:00 脆弱不是软弱，它恰恰是勇气最真实的度量。\n00:22 我们假装一切安好，即便事实并非如此。\n00:48 那些拥有自我价值感的人，只是打心底里相信自己已经足够好。\n01:20 让自己被看见，被深深地看见。\n01:55 用整颗心去爱，哪怕没有任何保证。"},
        {'title': 'How Great Leaders Inspire Action', 'audio_duration': 1110, 'publish_date': '2024-01-10'},
    ],
    '6-minute-english': [
        {'title': 'Learning a Language', 'audio_duration': 360, 'publish_date': '2024-01-15',
         'subtitle_en': "00:00 In this programme we discuss how to learn a new language.\n00:18 Research shows that consistency matters more than talent.\n00:42 Listening to podcasts every day can improve your ear.\n01:05 Try shadowing: repeat what you hear, out loud, immediately.\n01:30 Mistakes are proof that you are trying. Keep going!",
         'subtitle_zh': "00:00 本期节目我们聊聊如何学习一门新语言。\n00:18 研究表明，坚持比天赋更重要。\n00:42 每天听播客能提升你的听力敏感度。\n01:05 试试影子跟读：听到什么，立刻大声复述。\n01:30 犯错说明你在努力，继续加油！"},
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
print(f'\n   Admin login: admin / admin123456')
print(f'   Test login: testuser / test123')

# ---------------------------------------------------------------------------
# Membership tiers
# ---------------------------------------------------------------------------
tiers_data = [
    {
        'slug': 'free', 'name': '免费版', 'name_en': 'Free',
        'price_monthly': 0, 'price_yearly': 0,
        'description': '基础功能免费体验',
        'features': ['basic_player', 'transcript', 'translation', 'notes',
                     'favorites', 'history', 'vocabulary'],
        'badge_color': '#95a5a6', 'sort_order': 0,
    },
    {
        'slug': 'pro', 'name': '会员 Pro', 'name_en': 'Pro',
        'price_monthly': 39, 'price_yearly': 390,
        'description': '解锁 AI 智能讲解、AI 跟读评分等核心学习功能',
        'features': ['basic_player', 'transcript', 'translation', 'notes',
                     'favorites', 'history', 'vocabulary', 'ai_explain',
                     'shadowing', 'hd_audio', 'all_content', 'no_ads'],
        'badge_color': '#5858f5', 'sort_order': 1,
    },
    {
        'slug': 'premium', 'name': '尊享 Premium', 'name_en': 'Premium',
        'price_monthly': 69, 'price_yearly': 690,
        'description': 'Pro 全部功能 + 离线下载与优先支持',
        'features': ['basic_player', 'transcript', 'translation', 'notes',
                     'favorites', 'history', 'vocabulary', 'ai_explain',
                     'shadowing', 'hd_audio', 'all_content', 'no_ads',
                     'offline', 'priority_support'],
        'badge_color': '#f39c12', 'sort_order': 2,
    },
]
for tdata in tiers_data:
    tier, created = MembershipTier.objects.get_or_create(slug=tdata['slug'], defaults=tdata)
    if created:
        print(f'✅ Membership tier created: {tier.name}')

# Make the admin account a Pro member (so member features are testable)
admin = User.objects.filter(username='admin').first()
if admin:
    from datetime import timedelta
    from django.utils import timezone
    pro_tier = MembershipTier.objects.get(slug='pro')
    um, _ = UserMembership.objects.get_or_create(user=admin)
    um.tier = pro_tier
    um.status = 'active'
    um.expires_at = timezone.now() + timedelta(days=365)
    um.auto_renew = True
    um.payment_method = 'mock_card'
    um.order_id = 'MOCK-SEED-ADMIN'
    um.save()
    print('✅ Admin granted Pro membership (expires in 365 days)')