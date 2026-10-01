# گزارش بررسی Nahan → ONEX

## نتیجه بررسی

### ONEX
- Python 3.10+ / FastAPI / Uvicorn
- state روی فایل JSON در `DATA_DIR`
- استفاده از `aiofiles`
- اجرای subprocess و restart برای self-update
- ارتباط TCP با `asyncio.open_connection`
- هسته‌های Xray/sing-box و relay/XHTTP
- WebSocket/HTTP Upgrade و چندین پروتکل تونلی

### Nahan
- Cloudflare Worker با JavaScript module
- Wrangler deployment config
- Cloudflare D1 برای persistence
- KV abstraction روی یک جدول `kv_store`
- routing داخل `fetch(request, env, ctx)`
- قابلیت‌های Worker/Edge و `cloudflare:sockets`
- dashboard و subscription UI مخصوص معماری خودش

## بخش‌هایی که برای ONEX واقعاً قابل استفاده بودند

1. **Wrangler configuration** → به `cloudflare/wrangler.toml` تبدیل شد.
2. **D1 KV persistence** → به `cloudflare/worker.js` و `cloudflare/schema.sql` منتقل شد.
3. **Edge status/health pattern** → برای بررسی Worker و origin اضافه شد.
4. **جدا کردن Edge از core** → ONEX Python دست‌نخورده می‌ماند و Cloudflare جلوی آن قرار می‌گیرد.

## بخش‌هایی که قابل انتقال مستقیم نیستند

- `cloudflare:sockets` و relay/tunnel implementation نهان
- اجرای هسته‌های proxy داخل Worker
- منطق اختصاصی subscription/protocol که به معماری Nahan وابسته است
- فایل‌های dashboard نهان به‌عنوان جایگزین پنل ONEX

این تفاوت مهم است: **Cloudflare Worker نمی‌تواند `main.py` فعلی ONEX را مثل یک VM اجرا کند.**
