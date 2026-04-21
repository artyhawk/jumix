# Authentication

> Extracted from CLAUDE.md §5. Token strategy, rotation, rate limits, DB schema for auth.

## 5.1 Токены

**Access token:** JWT RS256, TTL 15 минут
**Refresh token:** opaque (случайные 64 байта base64url), TTL 30 дней (веб) / 90 дней (мобилка), хэшируется SHA-256, хранится в БД.

**Refresh token rotation:**
- При каждом use → старый revoked, replaced_by=new_id
- При reuse revoked токена → отозвать всю цепочку + alert

## 5.2 Хранение токенов

**Мобилка** (реализовано):
- Access: в памяти (Zustand), не пишется на диск
- Refresh: `expo-secure-store` с `requireAuthentication: true` (biometric guard)
- `/auth/refresh` и `/auth/logout` принимают refresh в JSON-body

**Веб** (pending — появится с `apps/web`; полная спецификация в [backlog.md](backlog.md)):
- Access: httpOnly, Secure, SameSite=Lax cookie
- Refresh: httpOnly, Secure, SameSite=Strict, path=/api/auth/refresh
- CSRF: double-submit pattern или `@fastify/csrf-protection`

## 5.3 Логин

**Два способа:**
1. SMS-код через Mobizon (phone → 6-digit code → verify)
2. Phone + password (argon2id, min 10 chars, zxcvbn check)

**Rate limiting (обязательно):**
- SMS: 1 запрос/60 сек/phone, 5/час/phone, 20/час/IP
- Password: после 5 неудач — экспоненциальный backoff, после 10 — lock 15 мин
- Капча (Cloudflare Turnstile) после превышения лимитов

## 5.4 Схема БД auth

```sql
-- users (базовая)
users { id, phone, password_hash, role, organization_id, token_version, ... }

-- refresh_tokens (с ротацией)
refresh_tokens {
  id, user_id, token_hash (SHA-256),
  device_id, ip_address, user_agent,
  created_at, last_used_at, expires_at,
  revoked_at, revoked_reason, replaced_by
}

-- auth_events (audit)
auth_events {
  id, user_id, event_type, phone, ip, user_agent,
  success, failure_reason, metadata, created_at
}

-- password_reset_tokens
password_reset_tokens { id, user_id, token_hash, expires_at, used_at }
```

## 5.5 Logout

- `POST /auth/logout` — revoke текущего refresh
- `POST /auth/logout-all` — revoke всех refresh + инкремент `users.token_version` (отклоняет старые access)
