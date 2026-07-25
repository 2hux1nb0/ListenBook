# ListenBook 全栈架构设计文档

## 1. 技术栈概览

| 层级 | 技术选择 | 说明 |
|------|---------|------|
| **前端** | Vue 3 + Vite + Element Plus | 响应式SPA，支持多语言 |
| **后端** | Django 4 + Django REST Framework | RESTful API，JWT认证 |
| **数据库** | PostgreSQL | 支持JSON字段、全文搜索、性能优秀 |
| **缓存** | Redis | 会话管理、数据缓存 |
| **文件存储** | 本地/Nginx静态文件 | 播客封面、音频文件（可扩展到OSS） |
| **Web服务器** | Nginx | 反向代理、静态文件服务 |
| **进程管理** | Gunicorn | Django WSGI服务器 |
| **搜索引擎** | PostgreSQL Full Text Search | 播客搜索（可升级到Elasticsearch） |

## 2. 项目结构

```
listenleap/
├── backend/                    # Django 后端
│   ├── config/                 # Django 项目配置
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── apps/
│   │   ├── accounts/           # 用户认证
│   │   ├── podcasts/           # 播客管理
│   │   ├── categories/         # 分类管理
│   │   ├── episodes/           # 单集管理
│   │   ├── playback/           # 播放记录
│   │   ├── favorites/          # 收藏/关注
│   │   ├── notes/              # 笔记
│   │   └── admin_panel/        # 后台管理
│   ├── media/                  # 上传的媒体文件
│   ├── static/                 # Django 静态文件
│   ├── manage.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   # Vue 3 前端
│   ├── src/
│   │   ├── views/              # 页面组件
│   │   ├── components/         # 公共组件
│   │   ├── stores/             # Pinia 状态管理
│   │   ├── api/                # API 接口
│   │   ├── router/             # 路由配置
│   │   ├── assets/             # 静态资源
│   │   ├── i18n/               # 多语言
│   │   └── utils/              # 工具函数
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── admin/                      # Vue 后台管理系统
│   └── ...
├── nginx/                      # Nginx 配置
│   └── default.conf
├── docker-compose.yml          # Docker 编排
├── DEPLOY.md                   # 部署指南
└── ARCHITECTURE.md             # 本文档
```

## 3. 数据库设计

### 3.1 核心表结构

```sql
-- 用户表（扩展Django内置User）
CREATE TABLE accounts_userprofile (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES auth_user(id),
    nickname VARCHAR(100),
    avatar VARCHAR(500),
    bio TEXT,
    preferred_language VARCHAR(10) DEFAULT 'zh-CN',
    learning_level VARCHAR(20),  -- beginner/intermediate/advanced
    daily_goal_minutes INTEGER DEFAULT 30,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 分类表
CREATE TABLE categories_category (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE,
    icon VARCHAR(50),
    color VARCHAR(7),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 播客表
CREATE TABLE podcasts_podcast (
    id SERIAL PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    slug VARCHAR(300) UNIQUE,
    author VARCHAR(200),
    description TEXT,
    cover_image VARCHAR(500),
    category_id INTEGER REFERENCES categories_category(id),
    difficulty VARCHAR(20) NOT NULL,  -- beginner/intermediate/advanced
    language VARCHAR(10) DEFAULT 'en',
    website_url VARCHAR(500),
    feed_url VARCHAR(500),          -- RSS 订阅源
    is_featured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    episode_count INTEGER DEFAULT 0,
    subscriber_count INTEGER DEFAULT 0,
    avg_rating DECIMAL(3,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 单集表
CREATE TABLE episodes_episode (
    id SERIAL PRIMARY KEY,
    podcast_id INTEGER REFERENCES podcasts_podcast(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    audio_url VARCHAR(500),
    audio_duration INTEGER,          -- 秒数
    audio_size BIGINT,               -- 字节数
    subtitle_en TEXT,                -- 英文字幕
    subtitle_zh TEXT,                -- 中文字幕
    episode_number INTEGER,
    season_number INTEGER DEFAULT 1,
    publish_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    play_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 用户播放记录
CREATE TABLE playback_playhistory (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES auth_user(id),
    episode_id INTEGER REFERENCES episodes_episode(id),
    current_position INTEGER DEFAULT 0,  -- 播放位置（秒）
    duration INTEGER,                      -- 总时长（秒）
    is_completed BOOLEAN DEFAULT FALSE,
    last_played TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 用户收藏/关注
CREATE TABLE favorites_favorite (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES auth_user(id),
    podcast_id INTEGER REFERENCES podcasts_podcast(id),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, podcast_id)
);

-- 用户笔记
CREATE TABLE notes_note (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES auth_user(id),
    episode_id INTEGER REFERENCES episodes_episode(id),
    content TEXT NOT NULL,
    timestamp_seconds INTEGER,        -- 笔记对应的时间点
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 用户学习统计
CREATE TABLE playback_learningstats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES auth_user(id) UNIQUE,
    total_listen_minutes INTEGER DEFAULT 0,
    total_episodes_played INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    last_active_date DATE,
    weekly_goal_minutes INTEGER DEFAULT 210,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## 4. API 设计

### 4.1 认证 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register/` | 用户注册 |
| POST | `/api/auth/login/` | 用户登录（JWT） |
| POST | `/api/auth/logout/` | 用户登出 |
| GET | `/api/auth/user/profile/` | 获取用户信息 |
| PUT | `/api/auth/user/profile/` | 更新用户信息 |
| POST | `/api/auth/refresh/` | 刷新Token |

### 4.2 播客 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/podcasts/` | 播客列表（支持筛选、分页） |
| GET | `/api/podcasts/{id}/` | 播客详情 |
| GET | `/api/podcasts/featured/` | 热门/精选播客 |
| GET | `/api/podcasts/{id}/episodes/` | 播客的单集列表 |
| GET | `/api/podcasts/search/?q=xxx` | 搜索播客 |

### 4.3 分类 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/categories/` | 所有分类 |

### 4.4 用户交互 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/favorites/` | 收藏列表/添加收藏 |
| DELETE | `/api/favorites/{id}/` | 取消收藏 |
| GET/POST | `/api/notes/` | 笔记列表/创建笔记 |
| PUT/DELETE | `/api/notes/{id}/` | 编辑/删除笔记 |
| GET/POST | `/api/playback/history/` | 播放历史 |
| PUT | `/api/playback/update/` | 更新播放进度 |
| GET | `/api/playback/stats/` | 学习统计 |

### 4.5 管理后台 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/admin/podcasts/` | 管理播客 |
| PUT/DELETE | `/api/admin/podcasts/{id}/` | 编辑/删除播客 |
| PATCH | `/api/admin/podcasts/{id}/toggle/` | 上下架播客 |
| GET/POST | `/api/admin/episodes/` | 管理单集 |
| PUT/DELETE | `/api/admin/episodes/{id}/` | 编辑/删除单集 |
| GET/POST | `/api/admin/categories/` | 管理分类 |
| GET | `/api/admin/dashboard/` | 后台数据统计 |

## 5. 前端路由设计

```
/                           -> 首页
/:lang/                     -> 首页（带语言）
/:lang/home                 -> 首页
/login                      -> 登录页
/register                   -> 注册页
/user/profile               -> 个人中心
/user/favorites             -> 我的收藏
/user/notes                 -> 我的笔记
/user/history               -> 学习记录
/podcasts                   -> 播客列表
/podcasts/:id               -> 播客详情
/podcasts/:id/episodes/:eid -> 单集播放页
/admin                      -> 后台管理
/admin/podcasts             -> 播客管理
/admin/episodes             -> 单集管理
/admin/categories           -> 分类管理
/admin/users                -> 用户管理
/admin/dashboard            -> 数据看板
```

## 6. 安全设计

- JWT Token 认证（Access + Refresh Token）
- CORS 跨域限制
- API Rate Limiting（限流）
- 文件上传类型/大小限制
- SQL 注入防护（Django ORM）
- XSS 防护（Vue 自动转义）
- CSRF 防护
- 密码 bcrypt 加密存储

## 7. 性能优化

- Redis 缓存热门播客数据
- 数据库索引优化
- 前端懒加载（路由懒加载 + 图片懒加载）
- CDN 加速静态资源
- Gzip 压缩
- Nginx 缓存策略