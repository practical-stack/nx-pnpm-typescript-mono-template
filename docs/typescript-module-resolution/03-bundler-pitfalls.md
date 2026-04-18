# Bundler 모드에서 실패하는 패턴들

## 개요

`moduleResolution: "Bundler"`는 관대한 편이지만, 여전히 실패하는 패턴들이 존재한다. 대부분은 `exports` 필드의 설정 문제이거나, TypeScript와 번들러 사이의 해석 차이에서 비롯된다.

이 문서에서는 실무에서 자주 마주치는 실패 패턴들을 **증상 → 원인 → 해결** 순서로 정리한다.

---

## Pitfall 1: exports에 "." 없이 패키지 루트 import

### 증상

```typescript
import { something } from '@repo/base-ui'
//                         ~~~~~~~~~~~~
// TS2307: Cannot find module '@repo/base-ui' or its corresponding type declarations.
```

### 원인

`@repo/base-ui`의 `package.json`에 `"."` export가 없다:

```jsonc
{
  "exports": {
    // "." 이 없음!
    "./components/*": { ... },
    "./lib/*": { ... }
  }
}
```

`exports` 필드가 존재하면 TypeScript는 **오직 `exports`에 선언된 경로만** 허용한다. `"."` 이 없으면 패키지 루트 import가 불가능하다.

### 해결

**의도적 설계인 경우** (이 프로젝트의 `@repo/base-ui`):
- 이것은 올바른 동작이다. granular import를 강제하는 패턴.
- `import { Button } from '@repo/base-ui/components/button'`으로 사용.

**루트 import가 필요한 경우**:
```jsonc
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./components/*": { ... }
  }
}
```

---

## Pitfall 2: exports 와일드카드에서 디렉토리 import 시도

### 증상

```typescript
import { Button } from '@repo/base-ui/components'
//                      ~~~~~~~~~~~~~~~~~~~~~~~~
// TS2307: Cannot find module '@repo/base-ui/components'
```

### 원인

와일드카드 export `"./components/*"`는 **파일 레벨** 매칭이다. `*`에 빈 문자열은 매칭되지 않는다:

```jsonc
{
  "exports": {
    "./components/*": { ... }   // ← * 에 최소 1글자 필요
  }
}
```

- `@repo/base-ui/components/button` → `*` = `button` ✅
- `@repo/base-ui/components` → `*` = (빈 문자열) ❌

### 해결

디렉토리 레벨 import를 지원하려면 별도로 선언해야 한다:

```jsonc
{
  "exports": {
    "./components": {           // 디렉토리 import (barrel)
      "types": "./src/components/index.ts",
      "default": "./src/components/index.ts"
    },
    "./components/*": { ... }   // 개별 파일 import
  }
}
```

**하지만** 이것은 barrel file(`components/index.ts`)이 필요하므로, barrel file을 피하려면 이 패턴을 사용하지 않는 것이 좋다. → [04. Barrel File 없이 살아남기](./04-avoiding-barrel-files.md) 참조.

---

## Pitfall 3: 와일드카드가 중첩 디렉토리를 커버하지 못함

### 증상

```typescript
import { DataTable } from '@repo/base-ui/components/data-table/data-table'
//                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// TS2307: Cannot find module
```

### 원인

Node.js의 exports 와일드카드 `*`는 **단일 레벨만** 매칭한다. `/`를 포함하는 경로는 매칭되지 않는다:

```jsonc
{
  "exports": {
    "./components/*": {
      "default": "./src/components/*.tsx"
    }
  }
}
```

- `components/button` → `*` = `button` ✅
- `components/data-table/data-table` → `*` = `data-table/data-table` ❌ (`/` 포함)

> **주의**: Node.js 문서에는 `*`가 `/`를 포함할 수 있다고 명시하지만, 실제 동작은 구현체마다 다르다. TypeScript는 `*`가 `/`를 포함하는 매칭을 **지원한다**. 그러나 일부 번들러나 런타임에서는 지원하지 않을 수 있으므로 주의가 필요하다.

### 해결

**방법 1**: 플랫한 파일 구조 유지

```
src/components/
  button.tsx        ← @repo/base-ui/components/button
  data-table.tsx    ← @repo/base-ui/components/data-table
  dialog.tsx        ← @repo/base-ui/components/dialog
```

**방법 2**: 중첩 경로를 exports에 명시적으로 선언

```jsonc
{
  "exports": {
    "./components/*": { ... },
    "./components/data-table/*": {
      "default": "./src/components/data-table/*.tsx"
    }
  }
}
```

---

## Pitfall 4: types condition 누락 또는 순서 오류

### 증상

```typescript
import { Button } from '@repo/base-ui/components/button'
// 런타임은 동작하지만, 에디터에서 타입을 못 찾음
// Button의 타입이 `any`로 추론됨
```

### 원인

`exports`에서 `types` condition이 누락되었거나, 다른 condition 뒤에 위치했다:

```jsonc
// ❌ types 누락
{
  "./components/*": {
    "default": "./dist/components/*.js"
  }
}

// ❌ types가 뒤에 있음
{
  "./components/*": {
    "default": "./dist/components/*.js",
    "types": "./dist/components/*.d.ts"    // 너무 늦음
  }
}
```

### 해결

`types`를 **항상 첫 번째** (또는 커스텀 condition 바로 다음)에 배치:

```jsonc
{
  "./components/*": {
    "@repo/source": "./src/components/*.tsx",  // 커스텀 condition
    "types": "./dist/components/*.d.ts",              // types 두 번째
    "default": "./dist/components/*.js"               // default 마지막
  }
}
```

---

## Pitfall 5: package.json에 "type": "module" 누락

### 증상

```
ERR_REQUIRE_ESM: require() of ES module not supported
```

또는 TypeScript가 `.ts` 파일을 CJS로 해석하여 예상치 못한 동작 발생.

### 원인

`"type": "module"`이 없으면 Node.js와 일부 도구가 `.js` 파일을 CJS로 간주한다. Bundler 모드 자체는 이 필드를 크게 신경 쓰지 않지만, **Vite나 다른 번들러가 패키지의 모듈 형식을 판단할 때** 이 필드를 참조한다.

### 해결

ESM 패키지에는 반드시 명시:

```jsonc
{
  "type": "module"
}
```

---

## Pitfall 6: tsconfig.json의 paths와 exports의 충돌

### 증상

```typescript
// 에디터에서는 동작하지만 빌드 시 실패
// 또는 그 반대
import { utils } from '@repo/shared/utils'
```

### 원인

`tsconfig.json`의 `paths`와 `package.json`의 `exports`가 서로 다른 해석을 제공:

```jsonc
// tsconfig.json
{
  "paths": {
    "@repo/shared/*": ["../../packages/shared/src/*"]   // TypeScript가 이걸 봄
  }
}

// packages/shared/package.json
{
  "exports": {
    ".": { ... }                                        // exports에는 ./utils 없음
  }
}
```

TypeScript의 `paths`는 `exports`보다 **먼저** 평가된다. 따라서 TypeScript는 찾지만 번들러는 못 찾는(또는 그 반대) 상황이 발생한다.

### 해결

**원칙**: `paths`와 `exports`를 **동시에 같은 패키지에** 사용하지 않는다.

- **Bundler 모드에서는 `exports`가 정석**. `paths`는 앱 내부의 alias(`~/*` → `./src/*`)에만 사용.
- workspace 패키지 간 참조는 `exports`로 통일.

```jsonc
// ✅ 올바른 사용: paths는 앱 내부 alias만
{
  "paths": {
    "~/*": ["./src/*"]      // 앱 내부 alias
  }
  // @repo/shared, @repo/base-ui는 exports로 해석
}

// ❌ 잘못된 사용: paths로 workspace 패키지 참조
{
  "paths": {
    "@repo/shared/*": ["../../packages/shared/src/*"]
  }
}
```

---

## Pitfall 7: customConditions 미설정으로 인한 잘못된 경로 해석

### 증상

```typescript
import { Button } from '@repo/base-ui/components/button'
// TypeScript가 dist/components/button.d.ts를 참조
// 하지만 dist가 아직 빌드되지 않아서 에러
```

### 원인

`tsconfig.base.json`에 `customConditions`를 설정하지 않으면, TypeScript는 커스텀 condition을 무시하고 `types` → `default` 순서로 해석한다:

```jsonc
// exports
"./components/*": {
  "@repo/source": "./src/components/*.tsx",  // ← 무시됨
  "types": "./dist/components/*.d.ts",              // ← 이걸 봄 (파일 없음!)
  "default": "./dist/components/*.js"
}
```

### 해결

TypeScript와 Vite **양쪽 모두**에 커스텀 condition을 설정:

```jsonc
// tsconfig.base.json
{
  "customConditions": ["@repo/source"]
}
```

```typescript
// vite.config.ts
export default defineConfig({
  resolve: {
    conditions: ['@repo/source'],
  },
})
```

---

## Pitfall 8: composite 프로젝트에서 noEmit과 declaration 충돌

### 증상

```
error TS6304: Composite projects may not disable declaration emit.
```

### 원인

`composite: true`인 프로젝트는 반드시 `declaration: true`여야 한다. 하지만 base config에서 `noEmit: true`를 상속받으면 충돌한다:

```jsonc
// tsconfig.base.json
{
  "noEmit": true              // ← 이걸 상속받으면...
}

// packages/shared/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,         // ← 충돌!
    "declaration": true
  }
}
```

### 해결

composite 패키지에서 `noEmit`을 명시적으로 override:

```jsonc
// packages/shared/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "noEmit": false,           // ← 명시적 override
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

---

## Pitfall 9: exports의 확장자와 실제 파일 확장자 불일치

### 증상

```typescript
import { Button } from '@repo/base-ui/components/button'
// TS가 ./src/components/button.tsx를 기대하지만
// 실제 파일은 ./src/components/Button.tsx (대문자)
```

### 원인

macOS의 파일 시스템은 기본적으로 대소문자를 구분하지 않으므로 로컬에서는 동작하지만, Linux CI에서는 실패한다. 또한 exports의 와일드카드 매칭은 **정확한 파일명**을 요구한다.

### 해결

1. `forceConsistentCasingInFileNames: true` 설정 (이 프로젝트에 이미 적용됨)
2. 파일명과 import 경로의 대소문자 통일
3. 파일명 컨벤션 확립: `kebab-case` 권장 (`button.tsx`, `use-mobile.ts`)

---

## Pitfall 10: 와일드카드 exports에서 `.ts`와 `.tsx` 확장자가 섞여 있는 경우

### 증상

```typescript
import { cn } from '@repo/base-ui/lib/utils'
// ✅ 동작 — utils.ts 존재

import { Button } from '@repo/base-ui/lib/button'
// ❌ TS2307: Cannot find module '@repo/base-ui/lib/button'
// 실제 파일은 button.tsx인데 exports는 *.ts만 가리킴
```

### 원인

와일드카드 exports에서 확장자를 **하나만** 지정하면, 다른 확장자의 파일은 매칭되지 않는다:

```jsonc
{
  "exports": {
    "./lib/*": {
      "types": "./src/lib/*.d.ts",
      "default": "./src/lib/*.ts"        // ← .ts만 매칭
    }
  }
}
```

이 설정에서:
- `@repo/pkg/lib/utils` → `./src/lib/utils.ts` ✅ (파일 존재)
- `@repo/pkg/lib/button` → `./src/lib/button.ts` ❌ (실제 파일은 `button.tsx`)

**와일드카드 `*`는 파일 이름만 치환**할 뿐, 확장자를 자동으로 탐색하지 않는다. `*.ts`라고 쓰면 정확히 `.ts`로 끝나는 파일만 대상이 된다.

### 왜 이런 상황이 발생하는가

한 디렉토리 안에 `.ts`와 `.tsx`가 섞이는 것은 의도적인 설계인 경우가 많다. **응집도(cohesion)** 때문이다.

예를 들어 "데이터 테이블" 기능을 만든다고 하자:

```
src/data-table/
  data-table.tsx         ← 메인 컴포넌트 (JSX)
  columns.tsx            ← 컬럼 정의 컴포넌트 (JSX)
  use-sorting.ts         ← 정렬 로직 hook (JSX 없음)
  use-pagination.ts      ← 페이지네이션 hook (JSX 없음)
  types.ts               ← 타입 정의 (JSX 없음)
  format-cell.ts         ← 셀 포맷 유틸 (JSX 없음)
```

이 파일들은 **하나의 기능에 속하는 응집된 단위**다. "확장자가 다르니 다른 폴더로 분리하자"고 하면 기능의 응집도가 깨진다:

```
// ❌ 확장자 기준으로 분리하면 응집도가 무너짐
src/components/data-table.tsx        ← 여기에 컴포넌트
src/components/columns.tsx
src/hooks/use-sorting.ts             ← 여기에 hook
src/hooks/use-pagination.ts
src/lib/types.ts                     ← 여기에 타입
src/lib/format-cell.ts               ← 여기에 유틸
```

관련 코드가 4개 폴더에 흩어지면 변경할 때마다 여러 디렉토리를 돌아다녀야 한다. 기능 삭제 시에도 어느 파일이 이 기능에 속하는지 추적하기 어렵다.

exports를 `"./data-table/*": { "default": "./src/data-table/*.ts" }`로 설정하면 `.tsx` 파일은 모두 누락된다.

### 해결

**방법 1 (권장): 폴더별 barrel file로 확장자를 추상화**

`.ts`와 `.tsx`가 응집도를 위해 같은 폴더에 있어야 한다면, **해당 폴더에 barrel file(`index.ts`)을 두어 확장자 차이를 추상화**하는 것이 가장 자연스럽다:

```
src/data-table/
  data-table.tsx
  columns.tsx
  use-sorting.ts
  use-pagination.ts
  types.ts
  format-cell.ts
  index.ts               ← barrel: 이 폴더의 공개 API만 re-export
```

```typescript
// src/data-table/index.ts
export { DataTable } from './data-table'
export { createColumns } from './columns'
export { useSorting } from './use-sorting'
export { usePagination } from './use-pagination'
export type { DataTableConfig, ColumnDef } from './types'
// format-cell.ts는 내부 구현이므로 export 안 함
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

```typescript
// 소비 측
import { DataTable, useSorting } from '@repo/base-ui/data-table'
```

이 접근법의 핵심:
- barrel이 `.ts`와 `.tsx`의 차이를 **내부에서 흡수** — 소비자는 확장자를 신경 쓸 필요 없음
- barrel file이 **폴더의 공개 API 경계** 역할 — 내부 파일(`format-cell.ts`)은 숨길 수 있음
- 기능의 응집도가 유지됨 — 관련 파일이 한 폴더에 모여 있음
- 패키지 전체를 하나로 모으는 monolithic barrel과 달리, **스코프가 기능 단위로 제한**됨

> **이 패턴은 04 문서에서 자세히 다룬다.** → [04. Barrel File 없이 살아남기 — 전략 7: 폴더별 barrel](./04-avoiding-barrel-files.md)

**방법 2: 확장자별로 디렉토리를 분리**

응집도보다 와일드카드 exports의 단순함을 우선하는 경우:

```jsonc
{
  "exports": {
    "./components/*": {
      "@repo/base-ui/source": "./src/components/*.tsx",
      "types": "./dist/components/*.d.ts",
      "default": "./dist/components/*.js"
    },
    "./lib/*": {
      "@repo/base-ui/source": "./src/lib/*.ts",
      "types": "./dist/lib/*.d.ts",
      "default": "./dist/lib/*.js"
    },
    "./hooks/*": {
      "@repo/base-ui/source": "./src/hooks/*.ts",
      "types": "./dist/hooks/*.d.ts",
      "default": "./dist/hooks/*.js"
    }
  }
}
```

**디렉토리 수준에서 확장자를 통일**하는 것이 핵심이다. 단, 기능별 응집도가 중요한 패키지에서는 관련 코드가 분산되는 단점이 있다.

**방법 3: 서브패스를 명시적으로 나열**

와일드카드를 포기하고 각 파일을 수동으로 선언한다:

```jsonc
{
  "exports": {
    "./data-table/data-table": { "default": "./src/data-table/data-table.tsx" },
    "./data-table/columns":    { "default": "./src/data-table/columns.tsx" },
    "./data-table/use-sorting": { "default": "./src/data-table/use-sorting.ts" }
  }
}
```

파일 수가 적고 변경이 드문 경우에 유효하지만, 확장자를 소비자에게 노출하는 결과가 된다.

**방법 4: 빌드된 산출물을 참조 (확장자 문제 우회)**

빌드 도구(tsc, esbuild)가 `.ts`와 `.tsx` 모두 `.js`로 컴파일하므로, 빌드 산출물 경로를 사용하면 확장자 문제가 사라진다:

```jsonc
{
  "exports": {
    "./data-table/*": {
      "types": "./dist/data-table/*.d.ts",
      "default": "./dist/data-table/*.js"
    }
  }
}
```

단, source-level 공유(`@repo/base-ui/source` 같은 커스텀 condition)에서는 사용 불가 — 소스를 직접 가리키려면 확장자를 알아야 하므로.

### 어떤 방법을 선택할 것인가

| 조건 | 권장 방법 |
|------|-----------|
| 기능별 응집도가 중요 (.ts/.tsx 혼재 폴더) | **방법 1: 폴더별 barrel** |
| 단일 파일 = 단일 기능 (UI 컴포넌트 라이브러리) | **방법 2: 디렉토리 = 확장자 경계** |
| 파일 수 적고 변경 빈도 낮음 | **방법 3: 명시적 나열** |
| source-level 공유가 불필요한 패키지 | **방법 4: 빌드 산출물 참조** |
| 위 조건이 혼합됨 | **혼합 전략** → [04 문서 참조](./04-avoiding-barrel-files.md) |

---

## Pitfall 11: npm 배포 라이브러리에서 `typesVersions` 누락

### 증상

```typescript
// 소비자가 moduleResolution: "Node" (TS 4.6 이하) 사용 시
import { cors } from 'my-lib/cors'
//                    ~~~~~~~~~~~~~
// TS2307: Cannot find module 'my-lib/cors'
```

에디터에서 타입을 전혀 못 찾지만, 런타임에서는 정상 동작.

### 원인

`exports`의 `types` condition은 **TypeScript 4.7+** (`Node16`/`NodeNext`)과 **5.0+** (`Bundler`)에서만 인식된다. 구버전 TypeScript(`moduleResolution: "Node"`)는 `exports` 필드를 **아예 무시**하고 `main`/`types` 필드만 본다.

서브패스 import(`my-lib/cors`)의 경우, 구버전 TS는 해석할 방법이 없다.

### 해결

npm 배포 라이브러리가 구버전 TypeScript를 지원해야 한다면 `typesVersions` fallback을 추가:

```jsonc
{
  "exports": {
    "./cors": {
      "types": "./dist/types/middleware/cors/index.d.ts",
      "import": "./dist/middleware/cors/index.js",
      "require": "./dist/cjs/middleware/cors/index.js"
    }
  },
  // ↓ TS 4.6 이하를 위한 fallback
  "typesVersions": {
    "*": {
      "cors": ["./dist/types/middleware/cors"]
    }
  }
}
```

> **모노레포 내부 패키지에서는 불필요**: workspace 내에서 TypeScript 버전이 통일되어 있고 Bundler 모드를 사용한다면 생략 가능. → [02. pnpm Workspace와 package.json exports](./02-pnpm-workspace-package-json.md#typesversions--구버전-typescript를-위한-fallback) 참조.

---

## Pitfall 12: exports와 실제 파일 사이의 불일치 (빌드 후 누락)

### 증상

```
Error: Cannot find module './dist/middleware/new-feature/index.js'
```

빌드는 성공하지만 런타임에서 파일을 못 찾거나, `npm publish` 후 소비자가 import 실패.

### 원인

새 모듈을 추가하면서 소스 코드와 테스트는 작성했지만, `package.json`의 `exports`에 해당 서브패스를 추가하는 것을 잊었다. 또는 `files` 필드에서 빌드 산출물이 누락되었다.

명시적 나열 방식에서 특히 빈번하다 (와일드카드는 자동으로 커버).

### 해결

빌드 파이프라인에 **exports 검증 스크립트**를 포함:

```typescript
// build/validate-exports.ts
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))

for (const [subpath, conditions] of Object.entries(pkg.exports)) {
  for (const [, filepath] of Object.entries(conditions as Record<string, string>)) {
    if (filepath.includes('*')) continue   // 와일드카드 건너뜀
    if (!fs.existsSync(filepath)) {
      throw new Error(`exports["${subpath}"] → "${filepath}" 파일 없음`)
    }
  }
}
```

또는 기존 도구 활용:

```bash
# publint — exports 설정 검증
npx publint

# arethetypeswrong — 타입 해석 검증
npx @arethetypeswrong/cli --pack .
```

---

## 빠른 진단 체크리스트

문제가 발생했을 때 순서대로 확인:

```
□ package.json에 "exports" 필드가 있는가?
□ import 경로가 exports에 선언된 패턴과 일치하는가?
□ "types" condition이 각 export 블록의 첫 번째에 있는가?
□ types가 가리키는 파일이 실제로 존재하는가?
□ customConditions가 tsconfig와 vite.config 양쪽에 설정되었는가?
□ "type": "module"이 설정되었는가?
□ paths와 exports가 충돌하지 않는가?
□ composite 패키지에서 noEmit: false가 설정되었는가?
□ 파일명 대소문자가 일치하는가?
□ 와일드카드 exports의 확장자가 디렉토리 내 파일과 일치하는가? (.ts/.tsx 혼재 여부)
□ (npm 배포 시) typesVersions fallback이 필요한가?
□ (npm 배포 시) exports가 가리키는 파일이 실제로 빌드/패키징되는가?
```

---

## 다음 문서

→ [04. Barrel File 없이 살아남기](./04-avoiding-barrel-files.md)
