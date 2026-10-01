# لایه Cloudflare برای ONEX

این پوشه از الگوی مفید پروژه Nahan برای **Wrangler + D1 + Worker** استفاده می‌کند، اما هسته ONEX را به Worker تبدیل نمی‌کند.

## معماری

```text
Client
  ↓
Cloudflare Worker (onex-edge)
  ├── /__onex/status
  ├── /__onex/init
  └── همه مسیرهای دیگر → ONEX Python origin
                               └── FastAPI / main.py
```

### چرا ONEX مستقیماً داخل Worker اجرا نمی‌شود؟

نسخه فعلی ONEX یک برنامه Python/FastAPI است و به filesystem، subprocess، اجرای هسته‌های محلی و سرور TCP/HTTP طولانی‌مدت وابسته است. Cloudflare Workers محیط اجرای Python معمولی یا `subprocess`/`pip install` مانند یک VM را فراهم نمی‌کند.

بنابراین این لایه، Cloudflare را به‌عنوان Edge جلوی ONEX قرار می‌دهد. اگر بعداً بخواهیم هسته‌ای مخصوص Workers بسازیم، باید آن بخش جداگانه با APIهای Workers طراحی و تست شود.

## Deploy

1. یک D1 Database بسازید:

```bash
npx wrangler d1 create onex-edge-db
```

2. `database_id` برگشتی را داخل `wrangler.toml` قرار دهید.

3. schema را اعمال کنید:

```bash
npx wrangler d1 execute onex-edge-db --remote --file=./schema.sql
```

4. آدرس سرویس Python فعلی ONEX را به‌عنوان secret تنظیم کنید:

```bash
npx wrangler secret put ONEX_ORIGIN
```

مقدار نمونه:

```text
https://your-onex-origin.example.com
```

5. Deploy:

```bash
npx wrangler deploy
```

6. بعد از Deploy برای تست:

```text
https://YOUR-WORKER-DOMAIN/__onex/status
```

و یک بار:

```text
POST https://YOUR-WORKER-DOMAIN/__onex/init
```

## چه چیزهایی از Nahan به ONEX اضافه شده؟

- ساختار استاندارد `wrangler.toml`
- Binding برای Cloudflare D1
- الگوی ساده و مقاوم KV روی D1
- Worker entrypoint مستقل
- health/status برای Edge و origin
- نگهداری metadata استقرار در D1

## چه چیزهایی عمداً کپی نشده؟

منطق پروکسی/تونل Nahan، relay engine و کدهای اختصاصی `cloudflare:sockets` وارد ONEX نشده‌اند؛ این‌ها یک هسته پروکسی مستقل هستند و جایگزین مستقیم هسته Python ONEX نیستند.
