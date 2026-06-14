# Security Audit Report — StudyCod Platform
**Дата:** 2026-06-14  
**Baseline commit:** `f9d23266` (HEAD, гілка `design-nova`)  
**Scope:** статичний аналіз усього репо (Хвилі 1–5 планового аудиту)  
**Стандарти:** OWASP Top 10 2021 · OWASP API Top 10 · ASVS · GDPR (PII дітей)

---

## Зведена таблиця знахідок

| ID | Severity | Зона | Коротка назва |
|----|----------|------|---------------|
| SEC-01 | **Critical** | B | Відсутній rate-limit на `/auth/login` — brute-force паролів |
| SEC-02 | **High** | F | CSS injection у шаблоні сертифікату → SSRF через Playwright |
| SEC-03 | **High** | B/K | Розкриття required-ролей у відповіді `403 rolesGuard` |
| SEC-04 | **High** | B | `CLOUDFLARE_AI_INTERNAL_SECRET` — опціональний → Worker = відкритий AI-проксі |
| SEC-05 | **High** | B | Google temp-token `jwt.sign({...user})` — spread усього passport-об'єкта |
| SEC-06 | **Medium** | A | Необмежений `maxSteps` у `/playground/trace` → CPU DoS |
| SEC-07 | **Medium** | B | Слабший поріг паролю при reset (6) vs register (8 символів) |
| SEC-08 | **Medium** | B | Username timing side-channel у `/auth/login` |
| SEC-09 | **Medium** | K | Відсутній rate-limit на `/auth/resend-verification` і `/auth/forgot-password` → email bombing |
| SEC-10 | **Medium** | J | LiveKit token TTL = 240 хв (4 год) — надто довгий |
| SEC-11 | **Medium** | M | `tmp-index.js` (172KB) tracked in git — build artifact у репо |
| SEC-12 | **Low** | O | `TRANSLATE_ALLOW_PUBLIC_FALLBACK` може витікати контент учнів на публічні сервіси |
| SEC-13 | **Low** | B | JWT_SECRET може бути `""` якщо `NODE_ENV ≠ "production"` |
| SEC-14 | **Info** | M | Deploy pipeline: `known_hosts` генерується через `ssh-keyscan` без верифікації fingerprint |
| SEC-15 | **Info** | E | Prompt injection regex: відсутні вектори base64/URL-encoding та непрямий injection |

---

## Remediation Backlog (порядок виконання)

```
Priority 1 (≤24 год):  SEC-01, SEC-02, SEC-04
Priority 2 (≤7 днів):  SEC-03, SEC-05, SEC-06, SEC-09
Priority 3 (≤30 днів): SEC-07, SEC-08, SEC-10, SEC-11
Priority 4 (беклог):   SEC-12, SEC-13, SEC-14, SEC-15
```

---

## Детальні знахідки

---

### [CRITICAL] SEC-01 — Відсутній rate-limit на `/auth/login` · Зона B

- **Файл:** `backend/src/routes/auth.ts:480`
- **CVSS 3.1:** `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N` → **9.1 Critical**
- **SSVC:** Act (широко експлуатабельний вектор, критичний актив)

**Опис і першопричина:**  
Ендпоінт `POST /api/auth/login` не має жодного route-level rate limiter. Глобальний ліміт — 300 req/хв на IP:principal — легко дозволяє 5 спроб пароля за секунду перед спрацюванням. Cloudflare Turnstile відключений за замовчуванням (`TURNSTILE_ENFORCE_AUTH=0`). На практиці атакуючий може робити ~18 000 спроб паролів за хвилину з одного IP.

```
# PoC: burst проти конкретного username
for i in $(seq 1 100); do
  curl -s -X POST https://studycod.space/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"target","password":"guess'$i'"}' &
done
```

**Виправлення:**  
1. `backend/src/middleware/routeRateLimit.ts` — вже є `createRouteLimiter`. Додати:
```typescript
// backend/src/routes/auth.ts (після імпортів)
import { createRouteLimiter } from "../middleware/routeRateLimit";
const loginLimiter = createRouteLimiter({
  windowMs: 15 * 60 * 1000, // 15 хв
  limit: 10,                  // 10 спроб з одного IP
  message: "TOO_MANY_LOGIN_ATTEMPTS"
});

// Прив'язати до роута
authRouter.post("/login", loginLimiter, async (req, res) => { ... });
authRouter.post("/contest-login", loginLimiter, async (req, res) => { ... });
```
2. Увімкнути Turnstile в prod: `TURNSTILE_ENFORCE_AUTH=1` в `.env` прода.

**Регрес-тест:**  
Додати до `backend/src/routes/auth.ts` тест (за патерном `submissionRateLimit.test.ts`): 11 POST-запитів за 15 хв з однієї IP → 11-й має повернути 429.

---

### [HIGH] SEC-02 — CSS Injection у шаблоні сертифікату → SSRF via Playwright · Зона F

- **Файл:** `backend/src/services/certificates/CertificateTemplateEngine.ts:76,124`
- **CVSS 3.1:** `AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:L/A:N` → **8.4 High**
- **SSVC:** Attend (потребує привілейованого доступу, але SSRF = pivot до internal services)

**Опис і першопричина:**  
`extraCss` (з `params.cssTemplate`) та `css` вставляється **несанітизовано** у `<style>` блок HTML. Playwright рендерить цей HTML у PDF. Через CSS можна:

```css
/* В cssTemplate від admin/teacher → SSRF */
@font-face {
  font-family: x;
  src: url('http://169.254.169.254/latest/meta-data/');  /* AWS metadata */
}
body { background: url('http://internal-redis:6379/'); }
```

Навіть якщо Playwright блокує мережеві запити під час рендеру (залежить від конфігурації), `url()` в CSS тригерить HTTP-запити. Крім того, через `@import` або `url()` можна exfiltrate дані (CSS injection для крадіжки content).

```typescript
// CertificateTemplateEngine.ts:76 — UNSAFE
${extraCss}  // ← raw interpolation в <style>

// CertificateTemplateEngine.ts:124 — UNSAFE  
${css}       // ← raw interpolation в <style>
```

**Виправлення:**  
Санітизувати CSS: дозволити лише безпечне підмножество або повністю заборонити `url()`, `@import`, `expression()`:

```typescript
// backend/src/services/certificates/CertificateTemplateEngine.ts

function sanitizeCss(raw: string): string {
  const s = String(raw ?? "").trim();
  // Block network-fetching constructs
  if (/url\s*\(/i.test(s) || /@import\b/i.test(s) || /expression\s*\(/i.test(s)) {
    throw new Error("CERTIFICATE_CSS_FORBIDDEN_CONSTRUCT");
  }
  // Length cap
  if (s.length > 4000) throw new Error("CERTIFICATE_CSS_TOO_LONG");
  return s;
}

// У renderStudyCodTemplate:
const extraCss = sanitizeCss(params.cssTemplate ?? "");

// У renderCustomTemplate:
const css = sanitizeCss(params.cssTemplate ?? "");
```

Додатково: запустити Playwright з `--no-sandbox` і `offline` network mode для рендеру сертифікатів, щоб унеможливити вихід у мережу.

**Регрес-тест:**  
Unit тест: `CertificateTemplateEngine.renderStudyCodTemplate({ cssTemplate: 'body { background: url("http://evil.com") }' })` → має кидати `CERTIFICATE_CSS_FORBIDDEN_CONSTRUCT`.

---

### [HIGH] SEC-03 — Розкриття required-ролей у відповіді 403 · Зона B/K

- **Файл:** `backend/src/middleware/rolesGuard.ts:12-14`
- **CVSS 3.1:** `AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N` → **4.3 Medium** (але дозволяє mapping attack surface)
- **SSVC:** Track

**Опис і першопричина:**  
```typescript
return res.status(403).json({
  message: 'Forbidden: Insufficient permissions',
  requiredRoles: allowedRoles,  // ← РОЗКРИВАЄ ролі для endpoint
  userRole: userRole || null     // ← РОЗКРИВАЄ роль поточного користувача
});
```

Атакуючий з будь-яким токеном може систематично пройтися по всіх ендпоінтах і отримати повну карту авторизаційних вимог без документації.

**Виправлення:**  
```typescript
// rolesGuard.ts
return res.status(403).json({
  message: 'Forbidden'
  // видалити requiredRoles та userRole
});
```

**Регрес-тест:** Перевірити, що 403-відповідь не містить полів `requiredRoles` чи `userRole`.

---

### [HIGH] SEC-04 — Відсутній `CLOUDFLARE_AI_INTERNAL_SECRET` → Worker = відкритий AI-проксі · Зона E/M

- **Файл:** `backend/src/env.ts:112` + `ai-service/cloudflare-ai-worker/src/index.ts`
- **CVSS 3.1:** `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:L` → **6.5 Medium** (якщо URL Worker відомий)
- **SSVC:** Act (фінансовий ризик, можливий зловживання платним AI)

**Опис і першопричина:**  
Коментар у коді прямо визнає: "Without it the worker is an open, unauthenticated proxy to paid Workers AI inference." Якщо `CLOUDFLARE_AI_INTERNAL_SECRET` не встановлений, будь-хто, хто знає URL Cloudflare Worker, може безкоштовно використовувати AI-інфраструктуру проєкту за рахунок власника.

**Виправлення:**  
1. Переконатися, що `CLOUDFLARE_AI_INTERNAL_SECRET` встановлений у production.
2. У Worker: перевірити наявність хедера `x-internal-secret` та повернути `401` якщо він відсутній або невірний.
3. Додати до `env.ts` обов'язкову перевірку в production:
```typescript
if (env.__cloudflareAiInternalSecret.length === 0 && isProduction && cfBase) {
  throw new Error("CLOUDFLARE_AI_INTERNAL_SECRET must be set in production when CLOUDFLARE_AI_URL is configured");
}
```

---

### [HIGH] SEC-05 — Google temp-token `jwt.sign({...user})` — spread пасспорт-об'єкта · Зона B

- **Файл:** `backend/src/routes/auth.ts:690-695`
- **CVSS 3.1:** `AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:N/A:N` → **4.3 Medium** (залежить від полів об'єкта)
- **SSVC:** Attend

**Опис і першопричина:**  
```typescript
const tempToken = jwt.sign({
  ...user,         // ← spread ПОВНОГО passport req.user об'єкта
  temp: true,
  jti: generateJti()
}, JWT_SECRET, { expiresIn: "10m" });
```

`user = req.user` — це об'єкт від `passport-google-oauth20`. Він може містити довільні поля з Google profile, внутрішні TypeORM метадані, тимчасові поля, `__proto__`. Якщо об'єкт містить чутливі внутрішні поля, вони потраплять у JWT payload (base64-декодується будь-ким). Крім того, prototype pollution через `...user` може перезаписати поля `temp` або `jti`.

**Виправлення:**  
```typescript
// auth.ts:690 — явно вибрати лише потрібні поля
const tempToken = jwt.sign({
  googleId:  String(user.googleId ?? ""),
  email:     String(user.email ?? ""),
  avatarUrl: String(user.avatarUrl ?? "") || null,
  temp:      true,
  jti:       generateJti()
}, JWT_SECRET, { expiresIn: "10m" });
```

---

### [MEDIUM] SEC-06 — Unbounded `maxSteps` у `/playground/trace` → CPU DoS · Зона A

- **Файл:** `backend/src/routes/playground.ts:58`
- **CVSS 3.1:** `AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L` → **4.3 Medium**
- **SSVC:** Track

**Опис і першопричина:**  
```typescript
const maxSteps = Number.isFinite(Number(b.maxSteps)) ? Number(b.maxSteps) : DEFAULT_MAX_STEPS;
```
Відсутня верхня межа. `maxSteps=99999999` → tracer намагається виконати мільйони кроків. Хоч timeout 10s обмежує виконання, judge-воркер все одно витрачає ресурси на кожен такий запит, що дозволяє DoS через конкурентні запити в межах rate-limit.

**Виправлення:**  
```typescript
// playground.ts:58
const DEFAULT_MAX_STEPS = 500;
const MAX_ALLOWED_STEPS = 2000;
const maxSteps = Math.min(
  MAX_ALLOWED_STEPS,
  Number.isFinite(Number(b.maxSteps)) ? Math.max(1, Number(b.maxSteps)) : DEFAULT_MAX_STEPS
);
```

---

### [MEDIUM] SEC-07 — Слабший мінімальний пароль при reset (6 vs 8 символів) · Зона B

- **Файл:** `backend/src/routes/auth.ts:401-403`
- **CVSS 3.1:** `AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:L/A:N` → **3.7 Low** (але принцип найменшого привілею)
- **SSVC:** Track

**Опис і першопричина:**  
```typescript
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6)  // ← 6 символів
});
const registerSchema = z.object({
  ...
  password: z.string().min(8),    // ← 8 символів при реєстрації
  ...
});
```

Після скидання пароля користувач може встановити 6-символьний пароль, обходячи первинну вимогу реєстрації.

**Виправлення:**  
```typescript
// auth.ts:401
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8)  // ← уніфікувати з register
});
// Те саме для googleCompleteSchema (зараз min(6))
```

---

### [MEDIUM] SEC-08 — Username timing side-channel у `/auth/login` · Зона B

- **Файл:** `backend/src/routes/auth.ts:501-510`
- **CVSS 3.1:** `AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N` → **3.7 Low**
- **SSVC:** Track (ризик зростає за відсутності SEC-01)

**Опис і першопричина:**  
```typescript
const user = await userRepo().findOne({ where: { username } });
if (!user || !(await bcrypt.compare(password, user.password))) {
  return res.status(400).json({ message: "INVALID_CREDENTIALS" });
}
```

Коли `user === null` (username не існує) — відповідь миттєва (~5ms, лише DB запит). Коли user існує але пароль неправильний — відповідь повільна (~100ms, bcrypt). Це дозволяє enumerate valid usernames: якщо відповідь швидка → username не існує.

**Виправлення:**  
```typescript
// auth.ts:501
const user = await userRepo().findOne({ where: { username } });
// Завжди виконувати bcrypt незалежно від того, чи знайдено user
const DUMMY_HASH = "$2b$10$wEfTuHIRbHxJKkx/REPLACE_WITH_ACTUAL_DUMMY_HASH";
const passwordMatch = user 
  ? await bcrypt.compare(password, user.password)
  : await bcrypt.compare(password, DUMMY_HASH); // постійний час
if (!user || !passwordMatch) {
  return res.status(400).json({ message: "INVALID_CREDENTIALS" });
}
```

Ініціалізувати `DUMMY_HASH` один раз при старті сервісу через `bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10)`.

---

### [MEDIUM] SEC-09 — Email bombing через `/auth/resend-verification` і `/auth/forgot-password` · Зона K

- **Файл:** `backend/src/routes/auth.ts:981`, `backend/src/routes/auth.ts:1024`
- **CVSS 3.1:** `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L` → **5.3 Medium**
- **SSVC:** Attend

**Опис і першопричина:**  
Обидва ендпоінти не мають rate limiter. Атакуючий може:
1. Надіслати тисячі листів на email жертви через `/resend-verification` з чужим email (якщо email є в БД).
2. Спамити `/forgot-password` для масового навантаження на SMTP-сервер.

**Виправлення:**  
```typescript
// auth.ts — додати після існуючих імпортів
const emailActionLimiter = createRouteLimiter({
  windowMs: 60 * 60 * 1000, // 1 год
  limit: 5,
  message: "TOO_MANY_EMAIL_REQUESTS"
});

authRouter.post("/resend-verification", emailActionLimiter, async (req, res) => { ... });
authRouter.post("/forgot-password", emailActionLimiter, async (req, res) => { ... });
```

---

### [MEDIUM] SEC-10 — LiveKit token TTL = 240 хв (4 год) · Зона J

- **Файл:** `backend/src/env.ts:452-457`
- **CVSS 3.1:** `AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N` → **4.2 Medium**
- **SSVC:** Track

**Опис і першопричина:**  
```typescript
__liveKitTokenTtlMinutes: ... return 240; // 4 години за замовчуванням
```

Вкрадений або витіклий LiveKit токен (наприклад, через логи, URL-репліку, скріншот) залишається валідним 4 години. Стандартна практика — 30–60 хвилин для інтерактивних сесій.

**Виправлення:**  
```typescript
// env.ts:452
return Number.isFinite(n) && n >= 5 ? Math.min(n, 720) : 60; // змінити з 240 → 60
```

Додати `LIVEKIT_TOKEN_TTL_MINUTES=60` до `.env.example` та production `.env`.

---

### [MEDIUM] SEC-11 — `tmp-index.js` і `tmp-index.map` (172KB build artifacts) у git · Зона M

- **Файл:** `tmp-index.js`, `tmp-index.map` (корінь репо)
- **CVSS 3.1:** `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N` → **5.3 Medium**
- **SSVC:** Track

**Опис і першопричина:**  
У корені репо є два трековані файли `tmp-index.js` (172KB) і `tmp-index.map` (6KB) — minified build artifacts (Vite bundle). Вміст: `__vite__mapDeps` — bundled frontend код. Source map дозволяє розгорнути вихідний код фронтенду включно з маршрутами, API URL, логікою.

**Виправлення:**  
```bash
# Видалити з репо і додати до .gitignore
git rm tmp-index.js tmp-index.map
echo "tmp-index.js" >> .gitignore
echo "tmp-index.map" >> .gitignore
git commit -m "chore: remove build artifacts from root"
```

---

### [LOW] SEC-12 — `TRANSLATE_ALLOW_PUBLIC_FALLBACK` витікає контент учнів · Зона O

- **Файл:** `backend/src/env.ts:121`
- **CVSS 3.1:** `AV:N/AC:L/PR:H/UI:N/S:C/C:L/I:N/A:N` → **3.8 Low**
- **SSVC:** Track

**Опис і першопричина:**  
```
// "it exfiltrates course/student content to an uncontrolled host"
TRANSLATE_ALLOW_PUBLIC_FALLBACK: z.string().optional()
```

Якщо увімкнути, теоретичні блоки та контент курсу надсилаються на `libretranslate.de` / `api.mymemory.translated.net`. Для освітньої платформи з неповнолітніми це порушення GDPR (передача даних третім особам без consent).

**Виправлення:**  
Додати явну перевірку в production:
```typescript
// env.ts
if (env.__isProduction && env.__translateAllowPublicFallback) {
  throw new Error("TRANSLATE_ALLOW_PUBLIC_FALLBACK must be disabled in production (GDPR violation)");
}
```

---

### [LOW] SEC-13 — Порожній `JWT_SECRET=""` при `NODE_ENV ≠ "production"` · Зона B

- **Файл:** `backend/src/env.ts:73`
- **CVSS 3.1:** `AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N` → **7.4 High** (якщо staging без `NODE_ENV=production`)
- **SSVC:** Attend (залежить від конфігурації staging)

**Опис і першопричина:**  
```typescript
JWT_SECRET: requiredInProduction("JWT_SECRET").optional()
  .transform(v => (v ?? "").trim())
```

Якщо `NODE_ENV` не дорівнює `"production"`, `JWT_SECRET` може бути `""`. `jsonwebtoken.sign("", "")` та `jsonwebtoken.verify(token, "")` — валідна операція. Тобто на staging без `NODE_ENV=production` будь-хто може підробити токен з будь-яким `userId`/`role`.

**Виправлення:**  
```typescript
// env.ts — у .superRefine() або після parse
if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
  if (env.__isProduction) {
    // вже перевіряється — добре
  } else {
    logger.warn("[security] JWT_SECRET is empty or weak — tokens are TRIVIALLY FORGEABLE");
    // Або зробити harder fail навіть в dev:
    // throw new Error("JWT_SECRET must be set even in dev");
  }
}
```

Додати до staging CI: `NODE_ENV=staging` + `JWT_SECRET=<strong_value>` через secrets.

---

### [INFO] SEC-14 — `ssh-keyscan` без верифікації fingerprint у CI/CD · Зона M

- **Файл:** `.github/workflows/deploy.yml:13`
- **CVSS:** N/A (процесний ризик)

**Опис і першопричина:**  
```yaml
ssh-keyscan -H ${{ secrets.HOST }} >> ~/.ssh/known_hosts
```

`ssh-keyscan` без верифікації fingerprint вразливий до MITM-атаки. Якщо підмінити IP продакшн-сервера (DNS hijack, BGP hijack), атакуючий може перехопити деплой і виконати довільний код на сервері.

**Виправлення:**  
Зберегти відомий fingerprint у GitHub Secret і верифікувати:
```yaml
- name: Configure SSH
  run: |
    mkdir -p ~/.ssh
    echo "${{ secrets.SSH_KEY }}" > ~/.ssh/id_ed25519
    chmod 600 ~/.ssh/id_ed25519
    echo "${{ secrets.HOST_FINGERPRINT }}" >> ~/.ssh/known_hosts
```
де `HOST_FINGERPRINT` заздалегідь верифікований рядок виду `host ssh-ed25519 AAAA...`.

---

### [INFO] SEC-15 — Prompt injection regex: пропущені вектори · Зона E

- **Файл:** `backend/src/services/ai/safeAICall.ts:35-48`
- **CVSS:** N/A (defense-in-depth)

**Опис і першопричина:**  
`PROMPT_INJECTION_PATTERNS` покриває основні вектори (role markers, im_start/end, "ignore instructions" EN/UK/RU). Не покриті:
1. Base64-encoded інструкції: `aWdub3JlIHByZXZpb3VzIGluc3RydWN0aW9ucw==`
2. Непряме injection через дані задачі, що були створені адміном (admin-controlled content → student sees → code → LLM).
3. Unicode homoglyph атаки (схожі букви для обходу regex).
4. Розбиття ключових слів через zero-width characters: `i​gnore` (U+200B між `i` і `g`).

**Виправлення:**  
```typescript
// safeAICall.ts — додати до neutralizePromptInjection
// Декодувати base64-подібний вміст і перевірити
out = out.replace(/[A-Za-z0-9+/]{20,}={0,2}/g, match => {
  try {
    const decoded = Buffer.from(match, "base64").toString("utf-8");
    if (/ignore.*instruction/i.test(decoded)) return "[redacted-b64]";
  } catch {}
  return match;
});
// Стрипати zero-width chars
out = out.replace(/[​-‍⁠﻿]/g, "");
```

---

## Стан добрих практик (позитивні знахідки)

| Практика | Статус |
|----------|--------|
| Helmet з tight CSP (`default-src 'none'`) | ✅ Реалізовано |
| JWT revocation (jti + timestamp) | ✅ Реалізовано |
| bcrypt для паролів (rounds=10) | ✅ Реалізовано |
| CORS: allowlist без `*` в prod | ✅ Реалізовано |
| Zod validation на всіх input | ✅ Широко використовується |
| Password reset: sha256 хеш токена | ✅ Реалізовано |
| Prompt injection neutralization | ✅ Базовий захист є |
| Session fixation defense (regenerate) | ✅ Реалізовано |
| Global rate limit 300/хв в prod | ✅ Реалізовано |
| Host code execution fallback вимкнений | ✅ `CODE_EXECUTION_ALLOW_HOST=0` |
| `.env` не в git | ✅ Коректно в .gitignore |
| Circuit breaker для AI-провайдера | ✅ Реалізовано |
| Graceful shutdown + drain | ✅ Реалізовано |

---

## Наступні кроки (динамічна фаза)

Перед активним тестуванням проти `studycod.space` потрібно підтвердити:
1. Чи є staging-дзеркало для агресивних тестів (sqlmap, race conditions, sandbox PoC)?
2. Вікно тестування і бекап БД (якщо тест виконується проти прода).
3. Пріоритет: SEC-01 → перевірити чи справді в проді Turnstile off і rate-limit відсутній; SEC-04 → перевірити чи `CLOUDFLARE_AI_INTERNAL_SECRET` встановлений в prod.

---

*Звіт згенеровано Claude Code. Версія для фіксу: наступним промптом взяти будь-який `### [SEV] SEC-XX` блок — усі необхідні дані для виправлення в ньому.*
