# pnpm Workspace와 package.json exports의 관계

## pnpm Workspace가 모듈 해석에 미치는 영향

### symlink 기반 의존성 연결

pnpm workspace에서 `workspace:*`로 선언된 내부 패키지는 **symlink**로 연결된다:

```
apps/app-a/node_modules/@repo/shared → ../../../../packages/shared
```

이 symlink 덕분에 TypeScript와 번들러 모두 `@repo/shared`를 일반 npm 패키지처럼 취급할 수 있다. `node_modules` 안에 실제 디렉토리(심볼릭 링크)가 존재하므로, 모듈 해석기는 `node_modules/@repo/shared/package.json`을 찾아서 `exports` 필드를 읽는다.

### hoist: false의 영향

이 프로젝트는 pnpm의 `hoist=false` 설정을 사용한다. 이는 각 앱이 **자신만의 `node_modules`**를 가진다는 뜻이다:

```
apps/app-a/node_modules/
  @repo/shared → symlink
  @repo/base-ui → symlink
  react → 실제 패키지
  
apps/app-b/node_modules/
  @repo/shared → symlink
  @repo/base-ui → symlink  
  react → 실제 패키지 (별도 복사본)
```

**왜 중요한가**: hoisting이 없으므로 각 패키지의 `package.json`이 모듈 해석의 **유일한 진실 공급원(single source of truth)**이 된다. 상위 디렉토리의 `node_modules`에 우연히 존재하는 패키지에 의존하는 phantom dependency 문제가 원천 차단된다.

---

## package.json의 `exports` 필드 심층 해부

`exports` 필드는 **패키지의 공개 API를 선언**하는 필드다. Node.js 12.7+에서 도입되었고, TypeScript 4.7+(`Node16`), 5.0+(`Bundler`)에서 지원한다.

### 기본 구조

```jsonc
{
  "exports": {
    ".": {                              // 패키지 루트 import
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./utils": {                        // 서브패스 import
      "types": "./dist/utils.d.ts",
      "default": "./dist/utils.js"
    }
  }
}
```

이렇게 설정하면:

```typescript
import { foo } from '@repo/pkg'         // → exports["."] 해석
import { bar } from '@repo/pkg/utils'   // → exports["./utils"] 해석
import { baz } from '@repo/pkg/internal' // ❌ exports에 없으므로 에러
```

### exports가 없을 때 vs 있을 때

| 상황 | import 가능 범위 |
|------|-----------------|
| `exports` 필드 없음 | 패키지 내 모든 파일 import 가능 (`@repo/pkg/src/deep/file`) |
| `exports` 필드 있음 | **exports에 선언된 경로만** import 가능 (캡슐화) |

> `exports`가 존재하는 순간 그 패키지의 **공개 API 경계**가 확정된다. 선언되지 않은 경로는 접근 불가.

---

## 이 프로젝트의 두 가지 패턴

### 패턴 1: 단일 진입점 — @repo/shared

```jsonc
// packages/shared/package.json
{
  "name": "@repo/shared",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

**특징**:
- 진입점이 하나(`"."`)
- `.ts` 소스를 직접 가리킴 (빌드 산출물이 아님)
- `types`와 `default`가 동일한 파일

**사용법**:

```typescript
// apps/app-a에서
import { greet } from '@repo/shared'    // ✅ OK
import { greet } from '@repo/shared/src/index' // ❌ exports에 없음
```

**왜 이렇게 설정하는가**:
- Vite가 `.ts` 파일을 직접 트랜스파일할 수 있으므로 빌드 단계가 불필요
- 개발 시 즉시 반영 (HMR이 소스 파일을 직접 감시)
- 단, `tsc -b`로 `.d.ts` 선언 파일은 별도 생성 (다른 패키지의 타입 체크를 위해)

### 패턴 2: Granular Exports + Custom Condition — @repo/base-ui

```jsonc
// packages/base-ui/package.json
{
  "name": "@repo/base-ui",
  "type": "module",
  "exports": {
    "./components/*": {
      "@repo/source": "./src/components/*.tsx",
      "types": "./dist/components/*.d.ts",
      "default": "./dist/components/*.js"
    },
    "./lib/*": {
      "@repo/source": "./src/lib/*.ts",
      "types": "./dist/lib/*.d.ts",
      "default": "./dist/lib/*.js"
    },
    "./hooks/*": {
      "@repo/source": "./src/hooks/*.ts",
      "types": "./dist/hooks/*.d.ts",
      "default": "./dist/hooks/*.js"
    },
    "./styles/*.css": "./src/styles/*.css"
  }
}
```

**특징**:
- 진입점이 없음 (`"."` 없음) — barrel file 불필요
- 와일드카드 패턴(`*`)으로 granular export
- 커스텀 condition(`@repo/source`)으로 개발/배포 경로 분기

**사용법**:

```typescript
// apps/app-a에서
import { Button } from '@repo/base-ui/components/button'   // ✅
import { cn } from '@repo/base-ui/lib/utils'               // ✅
import { useMobile } from '@repo/base-ui/hooks/use-mobile' // ✅

import { Button } from '@repo/base-ui'                      // ❌ "." export 없음
import { Button } from '@repo/base-ui/components'           // ❌ 정확한 파일명 필요
```

---

## Custom Conditions 메커니즘

### 문제: 개발 시에는 소스, 배포 시에는 빌드 산출물

UI 라이브러리인 `@repo/base-ui`는 두 가지 시나리오를 동시에 지원해야 한다:

| 시나리오 | 필요한 파일 | 이유 |
|----------|-------------|------|
| 개발 (vite dev) | `./src/components/*.tsx` | HMR, 빠른 반영 |
| 배포 / 외부 소비 | `./dist/components/*.js` | 빌드된 결과물 |

### 해결: 커스텀 condition

```jsonc
// package.json의 exports
"./components/*": {
  "@repo/source": "./src/components/*.tsx",  // ← 커스텀 condition
  "types": "./dist/components/*.d.ts",
  "default": "./dist/components/*.js"
}
```

TypeScript 측 (`tsconfig.base.json`):

```jsonc
{
  "customConditions": ["@repo/source"]
}
```

Vite 측 (`vite.config.ts`):

```typescript
export default defineConfig({
  resolve: {
    conditions: ['@repo/source'],
  },
})
```

**해석 흐름**:

```
import { Button } from '@repo/base-ui/components/button'

→ TypeScript: customConditions에 "@repo/source" 있음
  → exports["./components/*"]에서 "@repo/source" condition 매칭
  → ./src/components/button.tsx 로 해석 ✅

→ Vite: resolve.conditions에 "@repo/source" 있음
  → 동일하게 ./src/components/button.tsx 로 해석 ✅

→ 외부 소비자 (condition 미설정):
  → "@repo/source" 매칭 안 됨, "types"/"default" 로 fallback
  → ./dist/components/button.js 로 해석 ✅
```

---

## exports 필드와 TypeScript 타입 해석의 관계

### 규칙 1: `types` condition은 항상 첫 번째

```jsonc
// ✅ 올바른 순서
{
  "types": "./dist/index.d.ts",
  "import": "./dist/index.mjs",
  "default": "./dist/index.js"
}

// ❌ 잘못된 순서 — TypeScript가 types를 못 찾을 수 있음
{
  "import": "./dist/index.mjs",
  "default": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

### 규칙 2: 중첩 condition에서의 types

condition이 중첩될 때는 각 분기 안에 `types`를 넣어야 한다:

```jsonc
// ✅ 올바름
{
  "import": {
    "types": "./dist/index.d.mts",
    "default": "./dist/index.mjs"
  },
  "require": {
    "types": "./dist/index.d.cts",
    "default": "./dist/index.cjs"
  }
}

// ❌ 잘못됨 — types가 최상위에 있으면 import/require 분기 무시
{
  "types": "./dist/index.d.ts",
  "import": "./dist/index.mjs",
  "require": "./dist/index.cjs"
}
```

### 규칙 3: 와일드카드 패턴에서의 타입

와일드카드(`*`) 패턴은 TypeScript 5.0+ Bundler 모드에서 지원된다:

```jsonc
{
  "./components/*": {
    "types": "./dist/components/*.d.ts",    // * 가 실제 파일명으로 치환
    "default": "./dist/components/*.js"
  }
}
```

`import { Button } from '@repo/base-ui/components/button'`에서:
- `*` → `button`
- `types` → `./dist/components/button.d.ts`
- `default` → `./dist/components/button.js`

---

## 명시적 서브패스 나열 vs 와일드카드 패턴

exports를 선언하는 방식은 크게 두 가지다:

### 방식 A: 서브패스 명시적 나열

```jsonc
{
  "exports": {
    ".":          { "types": "...", "import": "...", "require": "..." },
    "./cors":     { "types": "...", "import": "...", "require": "..." },
    "./jwt":      { "types": "...", "import": "...", "require": "..." },
    "./logger":   { "types": "...", "import": "...", "require": "..." },
    // ... 수십 개를 하나하나 나열
  }
}
```

실제로 Hono 같은 대형 라이브러리는 **60개 이상의 서브패스를 수동으로 나열**한다.

**장점**:
- 공개 API가 `package.json`만 보면 즉시 파악됨
- 각 서브패스마다 다른 디렉토리 구조를 가리킬 수 있음 (예: `./cors` → `middleware/cors/`, `./cookie` → `helper/cookie/`)
- 실수로 내부 파일이 노출될 위험 없음
- `typesVersions`와의 매핑이 직관적

**단점**:
- 새 모듈을 추가할 때마다 exports를 수동 업데이트해야 함
- 파일이 많으면 `package.json`이 비대해짐

### 방식 B: 와일드카드 패턴

```jsonc
{
  "exports": {
    "./components/*": {
      "types": "./dist/components/*.d.ts",
      "default": "./dist/components/*.js"
    }
  }
}
```

**장점**:
- 새 파일 추가 시 exports 수정 불필요
- `package.json`이 간결함

**단점**:
- 디렉토리 내 모든 파일이 공개 API가 됨 (캡슐화 약화)
- 소스 구조와 export 경로의 1:1 매핑 강제
- `typesVersions` 매핑도 와일드카드로 해야 함

### 판단 기준

| 조건 | 권장 방식 |
|------|-----------|
| npm 배포 라이브러리 (공개 API 경계 중요) | **명시적 나열** |
| 서브패스가 다양한 디렉토리를 가리킴 | **명시적 나열** |
| 모노레포 내부 UI 패키지 (동일 구조) | **와일드카드** |
| 파일 수가 빠르게 증가하는 패키지 | **와일드카드** |
| 두 가지 혼합 | 대부분 명시 + 일부 와일드카드 (예: `./utils/*`만 와일드카드) |

---

## `typesVersions` — 구버전 TypeScript를 위한 fallback

`exports`의 `types` condition은 **TypeScript 4.7+ (`Node16`)과 5.0+ (`Bundler`)**에서만 인식된다. 그 이전 버전(특히 `moduleResolution: "Node"` 사용자)은 `exports`를 아예 무시한다.

npm에 배포하는 라이브러리가 구버전 TypeScript 사용자를 지원해야 한다면, `typesVersions` 필드가 필요하다:

```jsonc
{
  "exports": {
    "./cors": {
      "types": "./dist/types/middleware/cors/index.d.ts",
      "import": "./dist/middleware/cors/index.js",
      "require": "./dist/cjs/middleware/cors/index.js"
    }
  },
  // ↓ moduleResolution: "Node" (Node10) 사용자를 위한 fallback
  "typesVersions": {
    "*": {
      "cors": ["./dist/types/middleware/cors"]
    }
  }
}
```

**동작 방식**:

| TypeScript 버전 | moduleResolution | 타입 해석 경로 |
|----------------|------------------|----------------|
| 5.0+ | Bundler | `exports` → `types` condition |
| 4.7+ | Node16 | `exports` → `types` condition |
| 4.6 이하 | Node | `typesVersions` → fallback 경로 |

**내부 전용 패키지에서는 불필요**: 모노레포 내에서 TypeScript 버전이 통일되어 있고 `Bundler` 모드를 사용한다면 `typesVersions`는 생략해도 된다.

---

## exports 검증 자동화

서브패스가 많아지면 exports 선언과 실제 파일 사이의 불일치가 발생하기 쉽다. 빌드 시점에 자동 검증하는 패턴이 유용하다:

```typescript
// build/validate-exports.ts
import fs from 'fs'

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))

for (const [subpath, conditions] of Object.entries(pkg.exports)) {
  for (const [condition, filepath] of Object.entries(conditions as Record<string, string>)) {
    // 와일드카드 패턴은 건너뜀
    if (filepath.includes('*')) continue
    
    if (!fs.existsSync(filepath)) {
      throw new Error(
        `exports["${subpath}"]["${condition}"] → "${filepath}" 파일이 존재하지 않습니다`
      )
    }
  }
}
console.log('✅ All exports validated')
```

빌드 스크립트에 통합:

```jsonc
{
  "scripts": {
    "build": "tsc -b && node build/validate-exports.js",
    "postbuild": "publint"   // publint도 exports 검증에 유용
  }
}
```

> **팁**: [`publint`](https://publint.dev/)와 [`arethetypeswrong`](https://arethetypeswrong.github.io/)은 npm 배포 전 exports 설정을 자동 검증하는 도구다.

---

## pnpm catalog과의 조합

이 프로젝트는 `pnpm-workspace.yaml`에서 **catalog**을 사용한다:

```yaml
# pnpm-workspace.yaml
catalog:
  typescript: ~5.9.2
  react: ^19.0.0
  vite: ^7.3.1
```

```jsonc
// 각 패키지의 package.json
{
  "devDependencies": {
    "typescript": "catalog:",    // → ~5.9.2로 치환
    "vite": "catalog:"           // → ^7.3.1로 치환
  }
}
```

catalog은 **버전 관리의 편의 기능**이지 모듈 해석에 직접 영향을 주지 않는다. 하지만 workspace 내 모든 패키지가 동일 버전의 TypeScript를 사용하도록 보장하므로, `moduleResolution` 동작의 일관성에 간접적으로 기여한다.

---

## 정리: exports 설정 판단 플로우차트

```
패키지가 빌드 산출물을 생성하는가?
├── No (source-level 공유)
│   └── exports에서 .ts/.tsx 직접 참조
│       예: "types": "./src/index.ts", "default": "./src/index.ts"
│
└── Yes (빌드된 결과물 배포)
    ├── 개발 시 소스 직접 참조 필요?
    │   ├── Yes → 커스텀 condition 사용
    │   │   예: "@repo/source": "./src/*.tsx"
    │   │       "types": "./dist/*.d.ts"
    │   │       "default": "./dist/*.js"
    │   │
    │   └── No → 표준 exports
    │       예: "types": "./dist/index.d.ts"
    │           "default": "./dist/index.js"
    │
    └── Granular export 필요?
        ├── Yes → 와일드카드 패턴
        │   예: "./components/*": { ... }
        │
        └── No → 단일 "." export
            예: ".": { ... }
```

---

## 다음 문서

→ [03. Bundler 모드에서 실패하는 패턴들](./03-bundler-pitfalls.md)
