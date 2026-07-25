# ListenBook 部署指南（Ubuntu 服务器）

## 一、服务器要求

| 项目 | 最低要求 | 推荐配置 |
|------|---------|---------|
| 操作系统 | Ubuntu 20.04+ | Ubuntu 22.04 LTS |
| CPU | 1核 | 2核 |
| 内存 | 1GB | 2GB |
| 硬盘 | 10GB | 20GB |
| 网络 | 公网IP + 域名 | 开启HTTPS |

## 二、环境安装

```bash
# 1. 更新系统
sudo apt update && sudo apt upgrade -y

# 2. 安装 Python 3.10+
sudo apt install python3 python3-pip python3-venv -y

# 3. 安装 Nginx
sudo apt install nginx -y

# 4. 安装 PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# 5. 安装 Redis（可选，用于缓存）
sudo apt install redis-server -y

# 6. 创建部署用户
sudo adduser listenleap
sudo usermod -aG sudo listenleap
su - listenleap
```

## 三、数据库配置

```bash
# 切换到 postgres 用户
sudo -u postgres psql

# 创建数据库和用户
CREATE USER listenleap WITH PASSWORD 'your_password_here';
CREATE DATABASE listenleap_db OWNER listenleap;
GRANT ALL PRIVILEGES ON DATABASE listenleap_db TO listenleap;
\q
```

## 四、部署后端

```bash
# 1. 克隆项目
cd /home/listenleap
git clone <your-repo-url> listenleap
cd listenleap/backend

# 2. 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 配置环境变量
cat > .env << EOF
DJANGO_SECRET_KEY=$(python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
DB_ENGINE=django.db.backends.postgresql
DB_NAME=listenleap_db
DB_USER=listenleap
DB_PASSWORD=your_password_here
DB_HOST=localhost
DB_PORT=5432
CORS_ALLOWED_ORIGINS=https://yourdomain.com
EOF

# 5. 运行迁移
python manage.py migrate
python manage.py collectstatic --noinput

# 6. 创建管理员
python manage.py createsuperuser

# 7. 导入种子数据（可选）
python seed_data.py

# 8. 创建 Gunicorn systemd 服务
sudo cat > /etc/systemd/system/listenleap.service << 'EOF'
[Unit]
Description=ListenBook Django Backend
After=network.target postgresql.service

[Service]
User=listenleap
Group=www-data
WorkingDirectory=/home/listenleap/listenleap/backend
ExecStart=/home/listenleap/listenleap/backend/venv/bin/gunicorn config.wsgi:application \
    --workers 3 \
    --bind unix:/home/listenleap/listenleap/backend/listenleap.sock \
    --access-logfile /home/listenleap/listenleap/backend/logs/access.log \
    --error-logfile /home/listenleap/listenleap/backend/logs/error.log
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# 9. 创建日志目录
mkdir -p /home/listenleap/listenleap/backend/logs

# 10. 启动服务
sudo systemctl daemon-reload
sudo systemctl enable listenleap
sudo systemctl start listenleap
```

## 五、配置 Nginx

```bash
# 创建 Nginx 配置
sudo cat > /etc/nginx/sites-available/listenleap << 'EOF'
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # 前端静态文件
    location / {
        root /home/listenleap/listenleap/frontend/dist;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    # 后端 API
    location /api/ {
        include proxy_params;
        proxy_pass http://unix:/home/listenleap/listenleap/backend/listenleap.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Django Admin
    location /admin/ {
        include proxy_params;
        proxy_pass http://unix:/home/listenleap/listenleap/backend/listenleap.sock;
    }

    # 媒体文件
    location /media/ {
        alias /home/listenleap/listenleap/backend/media/;
    }

    # 静态文件
    location /static/ {
        alias /home/listenleap/listenleap/backend/staticfiles/;
    }

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    client_max_body_size 50M;
}
EOF

# 启用站点
sudo ln -s /etc/nginx/sites-available/listenleap /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## 六、配置 HTTPS（Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取证书
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# 自动续期
sudo crontab -e
# 添加：0 12 * * * /usr/bin/certbot renew --quiet
```

## 七、前端构建

```bash
cd /home/listenleap/listenleap/frontend

# 安装 Node.js（如尚未安装）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# 安装依赖并构建
npm install
npm run build

# 构建产物在 dist/ 目录
```

## 八、常用管理命令

```bash
# 重启后端
sudo systemctl restart listenleap

# 查看日志
sudo journalctl -u listenleap -f

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/error.log

# 进入 Django Shell
cd /home/listenleap/listenleap/backend
source venv/bin/activate
python manage.py shell

# 创建新的超级用户
python manage.py createsuperuser

# 数据库备份
pg_dump -U listenleap listenleap_db > backup_$(date +%Y%m%d).sql

# 恢复数据库
psql -U listenleap listenleap_db < backup_20240101.sql
```

## 九、Docker 部署（可选）

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: listenleap_db
      POSTGRES_USER: listenleap
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  backend:
    build: ./backend
    command: gunicorn config.wsgi:application --bind 0.0.0.0:8000
    volumes:
      - ./backend:/app
      - static_files:/app/staticfiles
      - media_files:/app/media
    environment:
      - DB_ENGINE=django.db.backends.postgresql
      - DB_NAME=listenleap_db
      - DB_USER=listenleap
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_HOST=db
      - DB_PORT=5432
    depends_on:
      - db
      - redis

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf
      - ./frontend/dist:/usr/share/nginx/html
      - static_files:/app/staticfiles
      - media_files:/app/media
    depends_on:
      - backend

volumes:
  postgres_data:
  static_files:
  media_files:
```

```bash
# Docker 部署命令
docker-compose up -d
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py createsuperuser
```

## 十、性能优化建议

1. **启用 Redis 缓存**：将 `CACHES` 配置为 Redis 后端
2. **配置 CDN**：使用 CloudFlare 或阿里云 CDN 加速静态资源
3. **数据库索引**：为高频查询字段添加索引
4. **启用 HTTP/2**：Nginx 配置中添加 `listen 443 http2`
5. **配置 Keep-Alive**：Nginx 和 Gunicorn 都启用连接复用
6. **使用 OPcache**：PHP/Python 启用字节码缓存

## 十一、监控

```bash
# 安装 htop 监控
sudo apt install htop -y

# 查看系统资源
htop

# 查看端口占用
sudo netstat -tlnp

# 查看磁盘使用
df -h

# 查看内存使用
free -h
```

部署完成后，访问 https://yourdomain.com 即可使用。
Django Admin 后台地址：https://yourdomain.com/admin/