# Barrel File 없이 살아남기

## Barrel File이란

Barrel file은 여러 모듈의 export를 하나의 진입점(`index.ts`)으로 모아서 re-export하는 패턴이다:

```typescript
// components/index.ts — "barrel file"
export { Button } from './button'
export { Dialog } from './dialog'
export { Input } from './input'
export { Card } from './card'
```

```typescript
// 사용 측
import { Button, Dialog, Input } from '@repo/ui/components'
```

겉보기에는 깔끔하다. 하지만 대가가 크다.

---

## Barrel File의 문제점

### 1. Tree-shaking 방해

```typescript
// 이 import는 Button만 필요하지만...
import { Button } from '@repo/ui/components'

// barrel file이 모든 컴포넌트를 import하므로
// 번들러는 Dialog, Input, Card도 로드해야 함
// (실제로 사용하지 않더라도 side-effect 분석 필요)
```

이론적으로 번들러가 tree-shaking으로 제거할 수 있지만:
- side-effect가 있는 모듈은 제거 불가
- CSS import가 포함된 컴포넌트는 항상 번들에 포함
- 번들러의 분석 한계로 인해 완벽한 tree-shaking은 불가능

### 2. 개발 서버 성능 저하

Vite의 개발 서버는 **요청 기반 로딩**을 사용한다. barrel file이 있으면:

```
브라우저: "Button만 필요해"
  → import '@repo/ui/components'
    → Vite: index.ts를 파싱
    → 50개 컴포넌트의 import 발견
    → 50개 파일 모두 트랜스파일
    → 실제로 사용되는 건 Button 1개
```

HMR도 느려진다. barrel file이 수정되면 이를 import하는 **모든 모듈**이 다시 로드된다.

### 3. 순환 의존성 유발

```typescript
// components/index.ts (barrel)
export { Button } from './button'
export { Dialog } from './dialog'

// components/dialog.tsx
import { Button } from './index'  // barrel을 통해 import
// → dialog가 barrel을 import
// → barrel이 dialog를 import
// → 순환!
```

barrel file은 패키지 내부에서도 사용되는 경향이 있어 순환 의존성의 주요 원인이 된다.

### 4. TypeScript 타입 체크 성능 저하

```typescript
import { Button } from '@repo/ui/components'
```

TypeScript는 이 import를 해석하기 위해:
1. `components/index.ts`를 파싱
2. 모든 re-export의 타입을 로드
3. `Button`의 출처를 추적

패키지가 클수록 이 비용이 기하급수적으로 증가한다.

### 5. import 자동완성의 혼란

barrel file이 있으면 에디터의 auto-import가 두 가지 경로를 제안한다:

```typescript
// auto-import 제안:
import { Button } from '@repo/ui/components'        // barrel 경로
import { Button } from '@repo/ui/components/button'  // 직접 경로
```

팀원마다 다른 경로를 사용하게 되어 코드 일관성이 깨진다.

---

## 전략 1: Granular exports (이 프로젝트의 접근법)

### 핵심 아이디어

barrel file 대신 `package.json`의 `exports` 와일드카드로 **각 파일을 독립적인 진입점**으로 노출한다.

### 설정

```jsonc
// packages/base-ui/package.json
{
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
    }
  }
}
```

### 사용법

```typescript
// ✅ 각 컴포넌트를 직접 import
import { Button } from '@repo/base-ui/components/button'
import { Dialog } from '@repo/base-ui/components/dialog'
import { cn } from '@repo/base-ui/lib/utils'
import { useMobile } from '@repo/base-ui/hooks/use-mobile'
```

### 장점

| 항목 | barrel file | granular exports |
|------|-------------|-----------------|
| Tree-shaking | 번들러에 의존 | 구조적으로 보장 |
| 개발 서버 | 불필요한 모듈 로드 | 필요한 파일만 로드 |
| 순환 의존성 | 유발 가능 | 구조적으로 방지 |
| 타입 체크 | 전체 barrel 파싱 | 개별 파일만 파싱 |
| auto-import | 경로 혼란 | 단일 경로 |

### 단점

- import 문이 길어짐 (하지만 에디터 auto-import가 해결)
- `package.json`의 `exports` 설정이 필요
- 새 파일 추가 시 별도 작업 불필요 (와일드카드 덕분)

---

## 전략 2: Source-level 직접 공유

### 핵심 아이디어

빌드를 아예 하지 않고, 소스 `.ts` 파일을 직접 참조한다. 번들러(Vite)가 트랜스파일을 담당한다.

### 설정

```jsonc
// packages/shared/package.json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

### 사용법

```typescript
import { greet } from '@repo/shared'
```

### 적합한 경우

- 유틸리티 함수, 상수, 타입 정의 등 **작은 패키지**
- 외부에 배포하지 않는 **내부 전용** 패키지
- 빌드 파이프라인을 최소화하고 싶을 때

### 주의점

- `tsc -b`로 `.d.ts`는 별도 생성해야 함 (프로젝트 참조를 위해)
- 소스를 직접 참조하므로 소비자의 TypeScript 설정과 호환되어야 함
- 패키지가 커지면 granular exports로 전환 고려

---

## 전략 3: Custom Condition으로 개발/배포 분기

### 핵심 아이디어

개발 시에는 소스 파일을, 배포 시에는 빌드된 파일을 제공한다. barrel file 없이 두 시나리오를 모두 커버한다.

### 설정 (이 프로젝트의 @repo/base-ui)

**package.json**:
```jsonc
{
  "exports": {
    "./components/*": {
      "@repo/source": "./src/components/*.tsx",
      "types": "./dist/components/*.d.ts",
      "default": "./dist/components/*.js"
    }
  }
}
```

**tsconfig.base.json**:
```jsonc
{
  "customConditions": ["@repo/source"]
}
```

**vite.config.ts**:
```typescript
export default defineConfig({
  resolve: {
    conditions: ['@repo/source'],
  },
})
```

### 해석 흐름

| 소비자 | condition 설정 | 해석 결과 |
|--------|---------------|-----------|
| 모노레포 내 앱 (개발) | `@repo/source` 있음 | `src/components/button.tsx` |
| 모노레포 내 앱 (빌드) | `@repo/source` 있음 | `src/components/button.tsx` |
| 외부 소비자 | condition 없음 | `dist/components/button.js` |

---

## 전략 4: 파일 구조 컨벤션으로 barrel file 불필요하게 만들기

### 플랫 구조 채택

```
// ❌ 중첩 구조 — barrel file이 필요해짐
src/components/
  button/
    Button.tsx
    Button.styles.ts
    Button.types.ts
    index.ts          ← barrel!
  dialog/
    Dialog.tsx
    Dialog.styles.ts
    index.ts          ← barrel!

// ✅ 플랫 구조 — 각 파일이 독립적
src/components/
  button.tsx          ← @repo/base-ui/components/button
  dialog.tsx          ← @repo/base-ui/components/dialog
  input.tsx           ← @repo/base-ui/components/input
```

### 단일 파일 컴포넌트 원칙

하나의 파일에 컴포넌트의 모든 것을 담는다:

```typescript
// src/components/button.tsx
import { type ComponentProps } from 'react'

// 타입
type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
}

// 구현
export function Button({ variant = 'primary', ...props }: ButtonProps) {
  return <button data-variant={variant} {...props} />
}
```

파일이 너무 커지면? 분리하되 barrel 없이:

```
src/components/
  button.tsx           ← 메인 컴포넌트 (export)
  button-variants.ts   ← 내부 유틸 (components/button에서만 import)
```

이때 `button-variants.ts`는 `exports`에 노출하지 않는다. **패키지의 공개 API가 아니기 때문**이다.

---

## 전략 5: 기능별 서브패스 진입점 (Scoped Entry Points)

### 핵심 아이디어

모든 것을 하나의 `index.ts`로 모으는 대신, **기능 단위로 독립적인 서브패스**를 만든다. barrel file처럼 보이지만 본질이 다르다:

- **Barrel file**: 패키지 전체를 하나의 진입점으로 통합 → `import { 모든것 } from 'pkg'`
- **Scoped entry point**: 기능별로 분리된 독립 진입점 → `import { cors } from 'pkg/cors'`

### 구조

```
src/
  index.ts                      ← 코어 API만 (Hono class 등)
  middleware/
    cors/index.ts               ← cors 미들웨어 진입점
    jwt/index.ts                ← jwt 미들웨어 진입점
  helper/
    cookie/index.ts             ← cookie 헬퍼 진입점
  adapter/
    cloudflare-workers/index.ts ← CF Workers 어댑터 진입점
```

```jsonc
// package.json
{
  "exports": {
    ".":                    { "types": "...", "import": "..." },
    "./cors":               { "types": "...", "import": "..." },
    "./jwt":                { "types": "...", "import": "..." },
    "./cookie":             { "types": "...", "import": "..." },
    "./cloudflare-workers": { "types": "...", "import": "..." }
  }
}
```

### 사용법

```typescript
import { Hono } from 'hono'                         // 코어만
import { cors } from 'hono/cors'                     // 미들웨어는 서브패스
import { jwt } from 'hono/jwt'

// ❌ 이건 안 됨 — 코어 진입점에 미들웨어가 없음
import { Hono, cors, jwt } from 'hono'
```

### Barrel file과의 차이

| 관점 | Barrel (monolithic) | Scoped entry points |
|------|--------------------|--------------------|
| 진입점 수 | 1개 (`index.ts`) | N개 (기능별) |
| `import` 시 로드 범위 | 전체 | 해당 기능만 |
| Tree-shaking 부담 | 크다 | 없다 |
| 순환 의존성 위험 | 높다 | 낮다 |
| 새 기능 추가 | barrel에 한 줄 추가 | exports에 서브패스 추가 |

### 이 패턴이 적합한 경우

- 기능이 명확히 분리되는 라이브러리 (미들웨어, 어댑터, 플러그인 등)
- npm에 배포하는 라이브러리 (공개 API 경계가 중요)
- 소비자가 필요한 기능만 선택적으로 import해야 할 때

### 주의점

- 각 서브패스의 `index.ts`는 **해당 기능의 공개 API만 export**해야 한다 (다른 기능을 re-export하면 안 됨)
- exports에 서브패스를 명시적으로 나열해야 하므로, 서브패스 수가 많아지면 `package.json` 관리 비용 증가 → 빌드 시 [exports 검증 자동화](./02-pnpm-workspace-package-json.md#exports-검증-자동화) 권장

---

## 전략 6: 폴더별 barrel (Scoped Barrel per Feature)

### 핵심 아이디어

이 문서의 제목은 "Barrel File 없이 살아남기"이지만, **모든 barrel이 나쁜 것은 아니다**. 문제는 패키지 전체를 하나의 `index.ts`로 모으는 **monolithic barrel**이다. 반면, **기능 단위 폴더마다 barrel을 두는 것**은 다른 이야기다.

응집도를 위해 `.ts`와 `.tsx`가 같은 폴더에 공존해야 하는 경우, 폴더별 barrel은 **확장자 차이를 추상화하면서 기능의 캡슐화를 강화**하는 효과적인 패턴이다.

### 왜 필요한가: 응집도와 확장자의 충돌

하나의 기능을 구성하는 파일들은 본래 같은 폴더에 있어야 한다. 하지만 React 프로젝트에서는 기능 하나에 다양한 확장자가 필요하다:

```
src/data-table/
  data-table.tsx         ← 메인 컴포넌트 (JSX)
  columns.tsx            ← 컬럼 렌더러 (JSX)
  use-sorting.ts         ← 정렬 hook (JSX 없음)
  use-pagination.ts      ← 페이지네이션 hook (JSX 없음)
  types.ts               ← 타입 정의 (JSX 없음)
  format-cell.ts         ← 셀 포맷 유틸 (JSX 없음)
```

이 폴더에 와일드카드 exports(`"./data-table/*"`)를 적용하면 `.ts`와 `.tsx` 중 **하나만 지정할 수 있어서** 반드시 누락이 발생한다. → [03. Pitfall 10](./03-bundler-pitfalls.md) 참조

### 설정

```
src/data-table/
  data-table.tsx
  columns.tsx
  use-sorting.ts
  use-pagination.ts
  types.ts
  format-cell.ts         ← 내부 구현
  index.ts               ← 폴더 barrel
```

```typescript
// src/data-table/index.ts
export { DataTable } from './data-table'
export { createColumns } from './columns'
export { useSorting } from './use-sorting'
export { usePagination } from './use-pagination'
export type { DataTableConfig, ColumnDef } from './types'
// format-cell은 내부 구현 → export하지 않음
```

```jsonc
// package.json
{
  "exports": {
    "./data-table": {
      "types": "./src/data-table/index.ts",
      "default": "./src/data-table/index.ts"
    }
  }
}
```

### 사용법

```typescript
import { DataTable, useSorting, type ColumnDef } from '@repo/base-ui/data-table'
```

### Monolithic barrel vs 폴더별 barrel

| 관점 | Monolithic barrel | 폴더별 barrel |
|------|-------------------|---------------|
| 스코프 | 패키지 전체 | **기능 하나** |
| import 시 로드 범위 | 패키지의 모든 모듈 | **해당 기능의 파일만** |
| Tree-shaking 부담 | 매우 크다 | **제한적** (폴더 내 파일 수만큼) |
| 순환 의존성 | 높은 위험 | **낮음** (폴더 내부에 한정) |
| `.ts`/`.tsx` 혼재 처리 | 동일한 문제 발생 | **해결** — barrel이 흡수 |
| 캡슐화 | 없음 (전부 노출) | **있음** — 내부 파일 은닉 가능 |

### 폴더별 barrel의 강점: 캡슐화

barrel file이 없으면 폴더 내 모든 파일이 공개 API가 된다. barrel이 있으면 **무엇을 노출하고 무엇을 숨길지** 명시적으로 제어할 수 있다:

```typescript
// ✅ 소비자가 접근 가능
import { DataTable } from '@repo/base-ui/data-table'

// ❌ format-cell은 barrel에서 export하지 않았으므로
// exports 설정에 따라 직접 접근 차단
import { formatCell } from '@repo/base-ui/data-table/format-cell'
```

이것은 와일드카드 exports(`./data-table/*`)에서는 불가능한 수준의 캡슐화다. 와일드카드는 폴더 내 모든 파일을 무차별적으로 공개한다.

### 주의할 점

**1. 폴더 내부에서 barrel을 통해 import하지 않는다**

```typescript
// ❌ 순환 위험 — 같은 폴더 안에서 barrel 경유
// src/data-table/data-table.tsx
import { useSorting } from './index'

// ✅ 직접 import
// src/data-table/data-table.tsx
import { useSorting } from './use-sorting'
```

폴더별 barrel은 **외부 소비자 전용 인터페이스**다. 폴더 내부 파일끼리는 항상 직접 import한다.

**2. 폴더 내 파일 수가 과도하게 많으면 재검토**

한 폴더에 20개 이상의 파일이 있다면 기능을 더 잘게 분리하거나, 하위 폴더를 도입하는 것을 고려한다.

**3. HMR 영향**

barrel 파일이 수정되면 이를 import하는 모든 파일이 HMR으로 갱신된다. 하지만 폴더별 barrel은 스코프가 제한되므로 monolithic barrel에 비해 영향 범위가 훨씬 작다.

### 이 패턴이 적합한 경우

- 기능별로 `.ts`와 `.tsx`가 혼재하는 폴더 구조
- 내부 구현을 숨기고 공개 API를 명확히 하고 싶을 때
- 소비자에게 `@repo/pkg/data-table` 같은 간결한 import 경로를 제공하고 싶을 때

---

## 전략 7: 혼합 전략 — granular + 폴더별 barrel

### 핵심 아이디어

하나의 패키지 안에서 **모든 디렉토리가 같은 구조를 가질 필요는 없다**. 디렉토리의 성격에 따라 최적의 방식을 선택한다:

- 확장자가 통일된 디렉토리 → **와일드카드 granular exports**
- `.ts`/`.tsx`가 혼재하는 기능 디렉토리 → **폴더별 barrel**

### 설정 예시

```
src/
  components/              ← 전부 .tsx → 와일드카드
    button.tsx
    dialog.tsx
    input.tsx
  hooks/                   ← 전부 .ts → 와일드카드
    use-mobile.ts
    use-theme.ts
  lib/                     ← 전부 .ts → 와일드카드
    utils.ts
    format.ts
  data-table/              ← .ts + .tsx 혼재 → 폴더별 barrel
    data-table.tsx
    columns.tsx
    use-sorting.ts
    types.ts
    index.ts
  chart/                   ← .ts + .tsx 혼재 → 폴더별 barrel
    chart.tsx
    use-chart-data.ts
    format-axis.ts
    index.ts
```

```jsonc
// package.json
{
  "exports": {
    // 와일드카드: 확장자 통일 디렉토리
    "./components/*": {
      "@repo/base-ui/source": "./src/components/*.tsx",
      "types": "./dist/components/*.d.ts",
      "default": "./dist/components/*.js"
    },
    "./hooks/*": {
      "@repo/base-ui/source": "./src/hooks/*.ts",
      "types": "./dist/hooks/*.d.ts",
      "default": "./dist/hooks/*.js"
    },
    "./lib/*": {
      "@repo/base-ui/source": "./src/lib/*.ts",
      "types": "./dist/lib/*.d.ts",
      "default": "./dist/lib/*.js"
    },

    // 폴더별 barrel: .ts/.tsx 혼재 디렉토리
    "./data-table": {
      "@repo/base-ui/source": "./src/data-table/index.ts",
      "types": "./dist/data-table/index.d.ts",
      "default": "./dist/data-table/index.js"
    },
    "./chart": {
      "@repo/base-ui/source": "./src/chart/index.ts",
      "types": "./dist/chart/index.d.ts",
      "default": "./dist/chart/index.js"
    },

    // CSS 등 기타
    "./styles/*.css": "./src/styles/*.css"
  }
}
```

### 소비자 입장

```typescript
// 와일드카드 경로 — 개별 파일 직접 import
import { Button } from '@repo/base-ui/components/button'
import { cn } from '@repo/base-ui/lib/utils'
import { useMobile } from '@repo/base-ui/hooks/use-mobile'

// 폴더 barrel 경로 — 기능 단위 import
import { DataTable, useSorting } from '@repo/base-ui/data-table'
import { Chart, useChartData } from '@repo/base-ui/chart'
```

두 방식이 자연스럽게 공존한다. **단순한 단일 파일은 granular, 복합 기능은 barrel**.

### 판단 기준: 어떤 디렉토리에 어떤 방식을?

```
이 디렉토리의 파일들이 .ts와 .tsx 모두 포함하는가?
├── No → 와일드카드 granular exports
│       예: "./components/*": { "default": "*.tsx" }
│
└── Yes → 이 파일들이 하나의 응집된 기능인가?
    ├── Yes → 폴더별 barrel
    │       예: "./data-table": { "default": "./index.ts" }
    │
    └── No (우연히 섞인 것) → 디렉토리를 분리하거나 명시적 나열
```

---

## 전략 8: lint 규칙으로 barrel file 방지

### oxlint / ESLint 규칙

barrel file 생성을 감지하고 경고하는 lint 규칙을 설정할 수 있다:

```jsonc
// .oxlintrc.json (또는 ESLint 설정)
{
  "rules": {
    // index.ts에서의 re-export를 감지
    "import/no-cycle": "error",              // 순환 의존성 방지
    "import/no-self-import": "error"         // 자기 참조 방지
  }
}
```

### 커스텀 스크립트로 검증

```bash
#!/bin/bash
# CI에서 barrel file 감지
find packages/ -name 'index.ts' -exec grep -l 'export.*from' {} \; | while read f; do
  echo "WARNING: Potential barrel file detected: $f"
done
```

---

## 마이그레이션 가이드: barrel file → granular exports

### Step 1: 현재 barrel file 파악

```bash
# re-export만 하는 index.ts 파일 찾기
grep -rl "export.*from" packages/*/src/**/index.ts
```

### Step 2: 소비자 코드에서 import 경로 변경

```typescript
// Before: barrel file 경유
import { Button, Dialog, Input } from '@repo/ui/components'

// After: granular import
import { Button } from '@repo/ui/components/button'
import { Dialog } from '@repo/ui/components/dialog'
import { Input } from '@repo/ui/components/input'
```

### Step 3: package.json의 exports 설정

```jsonc
{
  "exports": {
    // barrel export 제거
    // "./components": { ... },    ← 삭제

    // granular export 추가
    "./components/*": {
      "types": "./src/components/*.tsx",
      "default": "./src/components/*.tsx"
    }
  }
}
```

### Step 4: barrel file 삭제

```bash
# barrel file 역할만 하던 index.ts 삭제
rm packages/base-ui/src/components/index.ts
rm packages/base-ui/src/hooks/index.ts
```

### Step 5: 빌드 및 타입 체크 확인

```bash
pnpm typecheck    # 타입 에러 확인
pnpm build        # 빌드 확인
pnpm test         # 테스트 통과 확인
```

---

## 정리

| 전략 | 복잡도 | 적합한 상황 |
|------|--------|------------|
| 1. Granular exports (와일드카드) | 중간 | UI 라이브러리, 컴포넌트 패키지 |
| 2. Source-level 공유 | 낮음 | 작은 유틸리티 패키지 |
| 3. Custom condition | 높음 | 개발/배포 분기가 필요한 패키지 |
| 4. 플랫 파일 구조 | 낮음 | 모든 패키지에 적용 가능 |
| 5. 기능별 서브패스 (명시적 나열) | 중간 | npm 배포 라이브러리, 미들웨어/플러그인 구조 |
| 6. 폴더별 barrel (Scoped Barrel) | 낮음 | `.ts`/`.tsx` 혼합 폴더, 기능 응집도가 높은 디렉토리 |
| 7. 혼합 전략 (granular + 폴더별 barrel) | 중간 | 확장자 통일 폴더와 혼합 폴더가 공존하는 패키지 |
| 8. Lint 규칙 | 낮음 | 예방적 조치, CI에서 강제 |

**이 프로젝트의 선택**:
- `@repo/shared` — 전략 2 (Source-level 직접 공유)
- `@repo/base-ui` — 전략 1 + 3 (Granular exports + Custom condition)

두 패키지 모두 **barrel file이 존재하지 않는다**. 모든 import는 개별 파일을 직접 참조하거나, 단일 진입점(`.`)만 사용한다.

---

## 참고 자료

- [TypeScript 5.0 Release Notes — moduleResolution: "bundler"](https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/#moduleresolution-bundler)
- [Node.js Packages — Subpath exports](https://nodejs.org/api/packages.html#subpath-exports)
- [Node.js Packages — Subpath patterns](https://nodejs.org/api/packages.html#subpath-patterns)
- [Vite — Dep Pre-Bundling](https://vite.dev/guide/dep-pre-bundling)
- [Are the types wrong? — arethetypeswrong.github.io](https://arethetypeswrong.github.io/)
