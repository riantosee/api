# ⚡ AnimeGateway — Streaming Content API Platform

Unified API gateway for **anime, manga, manhua & donghua** with real-time health monitoring, smart caching, rate limiting, and a built-in Postman-style API tester.

Built with **Next.js 14 App Router** (JavaScript, no TypeScript).

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env.local

# 3. Start development server
npm run dev

# 4. Open browser
open http://localhost:3000
```

---

## 📁 Project Structure

```
anime-api-gateway/
├── app/
│   ├── layout.js              # Root layout + fonts
│   ├── globals.css            # Neon glassmorphism theme
│   ├── page.js                # Landing page
│   ├── dashboard/page.js      # Admin dashboard
│   ├── status/page.js         # Public status page
│   ├── tester/page.js         # API Tester (Postman-style)
│   ├── docs/page.js           # API documentation
│   └── api/
│       ├── status/route.js    # GET /api/status
│       ├── health/route.js    # GET /api/health
│       ├── anime/
│       │   ├── search/route.js
│       │   └── trending/route.js
│       ├── manga/search/route.js
│       ├── manhua/search/route.js
│       ├── donghua/search/route.js
│       └── admin/
│           ├── toggle/route.js
│           └── restart/route.js
├── lib/
│   ├── api-registry.js        # ← Add new providers here
│   ├── cache.js               # Redis + in-memory fallback
│   ├── health-checker.js      # Auto health check + uptime
│   ├── proxy-fetch.js         # Retry + fallback logic
│   ├── rate-limiter.js        # Sliding window rate limit
│   └── response-utils.js      # Standardized responses
├── components/
│   ├── layout/Navbar.js
│   └── ui/
│       ├── StatusBadge.js
│       └── ApiCard.js
├── hooks/
│   └── useStatus.js           # React polling hook
└── middleware.js              # CORS + rate limit enforcement
```

---

## ➕ How to Add a New API Provider

Edit `lib/api-registry.js` and push a new entry:

```js
{
  id: 'my-new-provider',        // unique snake_case id
  category: 'anime',            // anime | manga | manhua | donghua
  provider: 'my-provider',      // short name
  label: 'My New Provider',     // display label
  baseUrl: 'https://api.myprovider.com',
  endpoints: {
    search:   '/search?q={query}',  // {placeholders} auto-replaced
    trending: '/trending',
    info:     '/info/{id}',
  },
  rateLimit: { requests: 60, window: 60 },
  timeout: 8000,
  enabled: true,
  tags: ['sub', 'dub', 'hd'],
},
```

Done! The health checker, dashboard, status page, docs, and tester pick it up automatically.

---

## 🗺️ Pages

| URL            | Description                          |
|----------------|--------------------------------------|
| `/`            | Landing page with endpoint reference |
| `/dashboard`   | Admin: toggle APIs, view errors      |
| `/status`      | Public status page with uptime bars  |
| `/tester`      | Built-in API tester (Postman-style)  |
| `/docs`        | Full API documentation               |

---

## 📡 API Endpoints

### Content

| Method | Endpoint                  | Description          |
|--------|---------------------------|----------------------|
| GET    | `/api/anime/search`       | Search anime         |
| GET    | `/api/anime/trending`     | Trending anime       |
| GET    | `/api/manga/search`       | Search manga         |
| GET    | `/api/manhua/search`      | Search manhua        |
| GET    | `/api/donghua/search`     | Search donghua       |

### System

| Method | Endpoint                  | Description                     |
|--------|---------------------------|---------------------------------|
| GET    | `/api/status`             | All API health statuses         |
| GET    | `/api/status?refresh=true`| Force live re-check             |
| GET    | `/api/health?mode=errors` | Error log                       |
| GET    | `/api/health?mode=history&id=X` | Uptime history for API X |

### Admin

| Method | Endpoint                  | Body                     |
|--------|---------------------------|--------------------------|
| POST   | `/api/admin/toggle`       | `{ id, enabled }`        |
| POST   | `/api/admin/restart`      | `{ id }`                 |

---

## 📦 Response Format

**Success:**
```json
{
  "status": "success",
  "source": "jikan-anime",
  "data": [...],
  "metadata": {
    "total": 25,
    "page": 1,
    "from_cache": false,
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

**Error:**
```json
{
  "status": "error",
  "code": 429,
  "message": "Rate limit exceeded",
  "details": { "retry_after": 42 },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## ⚙️ Environment Variables

| Variable       | Required | Description                              |
|----------------|----------|------------------------------------------|
| `REDIS_URL`    | No       | Redis URL. Falls back to in-memory cache |

---

## 🏗️ Production Deployment

```bash
npm run build
npm start
```

Or deploy to Vercel:

```bash
npx vercel --prod
```

---

## 🔑 Rate Limits

| Tier        | Limit          |
|-------------|----------------|
| IP-based    | 60 req/min     |
| API Key     | 200 req/min    |

Pass `X-API-Key: your-key` header to use the API key tier.
