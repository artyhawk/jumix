# CI/CD — GitHub Actions

> Extracted from CLAUDE.md §11. Pipelines, DB migrations, rolling deploy strategy.

## 11.1 Пайплайн

**На PR / push в feature branch:**
```
lint (Biome) → typecheck (tsc --noEmit) → unit tests →
integration tests (с Testcontainers) → security scan (gitleaks, npm audit) →
CodeRabbit автоматические комментарии
```

**На merge в main:**
```
все проверки выше →
build Docker images (api, worker, web) →
push в GHCR с тегами `latest` и `sha-<commit>` →
auto-deploy на staging →
smoke tests на staging URL →
уведомление в Telegram
```

**На Git tag `v*.*.*`:**
```
все проверки выше →
manual approval (GitHub Environment: production) →
deploy на production →
health check (2 минуты) →
auto-rollback при failure →
уведомление в Telegram с changelog
```

## 11.2 Миграции БД

**Применяются ДО старта новой версии API.** Отдельный шаг в pipeline:
```
ssh prod "cd /opt/jumix && docker compose run --rm api pnpm db:migrate"
```

Только после успеха — `docker compose up -d api worker`.

**Правило:** миграции **обратно совместимы**. Новая версия API должна работать со старой схемой хотя бы 1 релиз (для rollback). Никаких `DROP COLUMN` в том же релизе что код перестаёт использовать колонку.

## 11.3 Rolling deploy

MVP: допустим даунтайм 30-60 секунд при деплое. Post-MVP: zero-downtime через blue-green или канари.
