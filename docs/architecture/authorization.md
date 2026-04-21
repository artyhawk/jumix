# Authorization — источник истины

> Extracted from CLAUDE.md §4. **Критически важная часть. Любой баг здесь = утечка данных между компаниями.**

## 4.1 Матрица прав

Полная матрица в отдельном документе [authorization-matrix.md](authorization-matrix.md) (создаётся по ходу MVP). Ключевые правила:

- **Superadmin** видит всё на уровне платформы, **НЕ видит финансов компаний** (п.4.1 ТЗ)
- **Owner** видит только свою организацию (scope через `organization_id`)
- **Operator** видит только свои данные (scope через `user_id`)
- **Marketplace** — единственное легальное место межтенантной видимости, с ограниченным DTO

## 4.2 Four-layer defense

**Layer 1: JWT claims + middleware**

```typescript
// В каждом access token:
{
  sub: user_id,
  org: organization_id | null,  // null только для superadmin
  role: 'superadmin' | 'owner' | 'operator',
  iat, exp, jti
}
```

Middleware раскладывает в `request.ctx: AuthContext`.

**Layer 2: Policy functions (чистые функции)**

```typescript
// modules/operator/operator.policy.ts
export const operatorPolicy = {
  canRead: (ctx: AuthContext, op: Operator): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner' && op.organizationId === ctx.organizationId) return true
    if (ctx.role === 'operator' && op.userId === ctx.userId) return true
    return false
  },
  listScope: (ctx: AuthContext): ListScope => {
    if (ctx.role === 'superadmin') return { type: 'all' }
    if (ctx.role === 'owner') return { type: 'by_org', orgId: ctx.organizationId! }
    throw new ForbiddenError()
  },
  // ... canCreate, canUpdate, canApprove, canDelete
}
```

**Layer 3: Repository с обязательным AuthContext**

```typescript
export class OperatorRepository {
  constructor(private db: Database, private ctx: AuthContext) {}

  async findMany(filters: OperatorFilters): Promise<Operator[]> {
    const scope = operatorPolicy.listScope(this.ctx)
    const query = this.db.select().from(operators)
    if (scope.type === 'by_org') {
      query.where(eq(operators.organizationId, scope.orgId))
    }
    return query.where(/* filters */)
  }
}
```

**Правило: никаких "голых" db-запросов из handlers или services.** Только через repository.

**Layer 4: PostgreSQL RLS (опционально, после MVP)**

Row-Level Security как последняя страховка. Настраиваем после стабилизации, не в MVP.

## 4.3 Критичные правила

- **404 вместо 403** для скрытия существования ресурсов (чужая организация, чужой operator)
- **DTO для marketplace** — отдельный тип с усечёнными полями (без контактов)
- **Все чувствительные действия → audit_log** (см. [business-logic.md](business-logic.md) §7.5)
- **Тесты обязательны** на каждый endpoint:
  - Happy path разрешённой роли
  - Запрещённая роль той же организации
  - Запрещённая роль чужой организации
  - Неавторизованный запрос
