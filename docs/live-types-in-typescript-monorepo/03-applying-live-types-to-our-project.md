# Live Types — 우리 프로젝트 적용 사례

> 이 문서는 Colin McDonnell의 [Live types in a TypeScript monorepo](https://colinhacks.com/essays/live-types-typescript-monorepo) 글에서 소개된 전략이 **이 프로젝트에 어떻게 적용되어 있는지** 분석합니다.
>
> 전략 비교: [02-live-types-in-monorepo.md](./02-live-types-in-monorepo.md)

## 목차

- [프로젝트 구조 요약](#프로젝트-구조-요약)
- [적용된 전략 분석](#적용된-전략-분석)
  - [전략 5: Custom Export Conditions](#전략-5-custom-export-conditions)
  - [전략 1: Project References](#전략-1-project-references)
  - [전략 3: tsconfig paths (앱 내부용)](#전략-3-tsconfig-paths-앱-내부용)
  - [Source-Level Sharing (shared 패키지)](#source-level-sharing-shared-패키지)
- [패키지별 상세 분석](#패키지별-상세-분석)
- [개발 흐름: 코드 수정이 반영되는 과정](#개발-흐름-코드-수정이-반영되는-과정)
- [주의사항 및 팁](#주의사항-및-팁)

---

## 프로젝트 구조 요약

```
nx-workspace-example/
├── apps/
│   ├── app-a/            # TanStack Start (port 3001)
│   └── app-b/            # TanStack Start (port 3002)
├── packages/
│   ├── shared/           # 간단한 유틸리티 (source-level sharing)
│   └── base-ui/          # UI 컴포넌트 라이브러리 (custom conditions)
├── tsconfig.base.json    # 공통 TS 설정
└── nx.json               # Nx 태스크 러너 (순수 태스크 러너, 플러그인 없음)
```

**의존 관계:**

```
app-a  ──→  @repo/shared
app-a  ──→  @repo/base-ui
app-b  ──→  @repo/shared
```

---

## 적용된 전략 분석

이 프로젝트는 Colin의 글에서 소개한 5가지 전략 중 **3가지를 조합**해서 사용한다.

### 전략 5: Custom Export Conditions

**사용처**: `@repo/base-ui`

`@repo/base-ui`는 Colin이 **가장 권장하는 전략**인 Custom Export Conditions를 사용한다.

#### package.json (base-ui)

```jsonc
// packages/base-ui/package.json
{
  "name": "@repo/base-ui",
  "exports": {
    "./components/*": {
      "@repo/source": "./src/components/*.tsx",  // 커스텀 조건: 소스 직접
      "types": "./dist/components/*.d.ts",               // 일반: 빌드된 타입
      "default": "./dist/components/*.js"                // 일반: 빌드된 JS
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

**핵심 포인트:**
- 커스텀 조건 이름이 `"@repo/source"` — scoped name으로 외부 패키지와 충돌 방지
- subpath exports (`./components/*`, `./lib/*`, `./hooks/*`)를 활용하여 barrel export 없이 tree-shaking 최적화
- CSS는 조건 없이 소스를 직접 참조 (빌드 불필요)

#### tsconfig.base.json (TypeScript 설정)

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "moduleResolution": "Bundler",                    // exports 필드 인식
    "customConditions": ["@repo/source"]       // 커스텀 조건 등록
  }
}
```

`customConditions`를 base tsconfig에 넣었으므로, 이를 상속하는 모든 앱/패키지에서 자동으로 적용된다.

#### vite.config.ts (런타임 설정)

```typescript
// apps/app-a/vite.config.ts
export default defineConfig({
  resolve: {
    conditions: ['@repo/source'],  // Vite에도 같은 조건 등록
  },
  plugins: [tailwindcss(), tsConfigPaths(), tanstackStart(), viteReact()],
})
```

**이것으로 Static-Runtime 완전 일치**: TypeScript(에디터)와 Vite(런타임) 모두 같은 `.ts`/`.tsx` 소스를 바라본다.

---

### 전략 1: Project References

**사용처**: 모든 앱 (`app-a`, `app-b`)

```jsonc
// apps/app-a/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "references": [
    { "path": "../../packages/base-ui" },
    { "path": "../../packages/shared" }
  ]
}
```

Project References는 단독으로 Live Types를 구현하지 못하지만, 이 프로젝트에서는 **Custom Export Conditions와 조합**하여 다음 용도로 사용한다:

| 용도 | 설명 |
|---|---|
| **증분 타입체크** | `tsc -b`로 변경된 패키지만 타입체크 (`packages/shared`의 `composite: true`와 연계) |
| **빌드 순서 보장** | Nx의 `dependsOn: ["^typecheck"]`와 함께, shared → app 순서로 타입체크 실행 |
| **에디터 성능** | 대규모 코드베이스에서 TypeScript Language Server의 메모리 사용량 최적화 |

---

### 전략 3: tsconfig paths (앱 내부용)

**사용처**: 각 앱의 **내부 경로 별칭** (패키지 간 참조가 아님)

```jsonc
// apps/app-a/tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "~/*": ["./src/*"]    // ~/components/Button → ./src/components/Button
    }
  }
}

// packages/base-ui/tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]    // @/lib/utils → ./src/lib/utils
    }
  }
}
```

**주의**: 여기서 `paths`는 **패키지 간 Live Types를 위한 것이 아니다**. 각 패키지/앱 내부의 경로 별칭(alias)을 위한 것이다. Vite에서는 `vite-tsconfig-paths` 플러그인이 이 매핑을 런타임에도 적용한다.

---

### Source-Level Sharing (shared 패키지)

**사용처**: `@repo/shared`

`@repo/shared`는 가장 단순한 방식을 사용한다 — **소스를 직접 export한다**.

```jsonc
// packages/shared/package.json
{
  "name": "@repo/shared",
  "exports": {
    ".": {
      "types": "./src/index.ts",     // 타입도 소스에서
      "default": "./src/index.ts"    // JS도 소스에서
    }
  }
}
```

이 방식은 Colin의 글에서 **전략 2 (publishConfig)** 의 개발 환경과 동일한 효과다. 단, `@repo/shared`는 `"private": true`이므로 npm에 배포하지 않기 때문에 배포 시 깨지는 문제가 없다.

**왜 이것이 가능한가?**
- `"private": true` → npm publish 하지 않으므로 빌드된 파일이 불필요
- Vite가 `.ts` 파일을 직접 트랜스파일할 수 있음
- TypeScript가 `.ts` 파일에서 직접 타입 정보를 추출할 수 있음

**그러면 왜 `composite: true`와 `tsc -b`가 있는가?**

```jsonc
// packages/shared/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist"
  }
}
```

이것은 **Project References 호환성**을 위한 것이다. `app-a`의 `references`에 `shared`가 포함되어 있으므로, `tsc -b`가 `shared`를 빌드할 수 있어야 한다. `composite: true`인 프로젝트는 반드시 선언 파일을 emit해야 한다.

하지만 **에디터에서 Live Types는 이미 작동한다** — `exports`가 소스를 직접 가리키고 있으므로.

---

## 패키지별 상세 분석

| 패키지 | Live Types 전략 | 배포 | 이유 |
|---|---|---|---|
| `@repo/shared` | Source-Level Sharing | private (배포 안 함) | 단순 유틸리티. 빌드 결과물이 필요 없음 |
| `@repo/base-ui` | **Custom Export Conditions** | private (배포 안 함, 하지만 빌드 구조 갖춤) | UI 컴포넌트 라이브러리. subpath exports 활용. 향후 배포 가능한 구조 |

### `@repo/base-ui`가 Custom Conditions를 쓰는 이유

`@repo/shared`와 달리 `@repo/base-ui`는:

1. **subpath exports가 있다** (`./components/*`, `./lib/*`, `./hooks/*`) — 단순 소스 직접 참조로는 subpath별로 다른 확장자(`.tsx` vs `.ts`)를 처리하기 어렵다
2. **빌드 파이프라인이 있다** (`tsc -b` + `tsc-alias`) — 향후 배포를 대비한 구조
3. **외부 의존성이 많다** — 빌드된 `.d.ts`를 제공하면 에디터 성능이 더 좋을 수 있다 (하지만 개발 중에는 커스텀 조건으로 소스 직접 참조)

---

## 개발 흐름: 코드 수정이 반영되는 과정

### 시나리오: base-ui의 Button 컴포넌트 수정

```
1. packages/base-ui/src/components/button.tsx 수정
   └── props에 새로운 variant 추가
       
2. VSCode TypeScript Language Server
   ├── @repo/base-ui의 exports를 확인
   ├── customConditions에 "@repo/source" 있음
   ├── "@repo/source" 조건 매칭
   └── ./src/components/button.tsx를 직접 읽음  ← 빌드 불필요!
       
3. apps/app-a에서 자동 반영
   ├── import { Button } from "@repo/base-ui/components/button"
   ├── TypeScript가 새 variant를 인식
   └── 자동완성, 타입 에러 모두 즉시 업데이트  ← Live Types!

4. Vite dev server (HMR)
   ├── resolve.conditions에 "@repo/source" 있음
   ├── ./src/components/button.tsx를 직접 로드
   └── 브라우저에 즉시 반영  ← Hot Module Replacement!
```

### 시나리오: shared 패키지의 유틸 함수 수정

```
1. packages/shared/src/index.ts 수정
   └── greet 함수의 반환 타입 변경
       
2. VSCode TypeScript Language Server
   ├── @repo/shared의 exports를 확인
   ├── "types": "./src/index.ts" → 소스 직접 참조
   └── 새 반환 타입 즉시 반영  ← Live Types!

3. Vite dev server
   ├── "default": "./src/index.ts" → 소스 직접 참조
   └── 브라우저에 즉시 반영
```

---

## 에디터 기능과 Live Types

Live Types의 실질적인 가치는 **에디터에서 체감**된다. TypeScript Language Server(tsserver)는 모듈 해석 결과를 기반으로 모든 지능형 기능을 제공하는데, 해석이 `.d.ts`를 가리키느냐 `.ts` 소스를 가리키느냐에 따라 경험이 완전히 달라진다.

> 배경지식: [01-typescript-module-resolution-background.md — TypeScript Language Server와 에디터 기능](./01-typescript-module-resolution-background.md#typescript-language-server와-에디터-기능)

### Go to Definition (F12 / Ctrl+Click)

가장 자주 사용하는 기능. import한 심볼의 **정의 위치**로 점프한다.

#### Custom Conditions가 있을 때 (이 프로젝트)

```
app-a/src/routes/index.tsx에서:

import { Button } from "@repo/base-ui/components/button"
         ~~~~~~
         F12 (Go to Definition)

tsserver 내부 처리 과정:
┌─────────────────────────────────────────────────────────────┐
│ 1. "Button"이 import된 모듈 "@repo/base-ui/components/button" │
│    을 해석해야 함                                             │
│                                                             │
│ 2. node_modules/@repo/base-ui → packages/base-ui (symlink)   │
│    의 package.json을 읽음                                    │
│                                                             │
│ 3. exports의 "./components/*" 매칭:                          │
│    {                                                        │
│      "@repo/source": "./src/components/*.tsx",  ← ✅ │
│      "types": "./dist/components/*.d.ts",                   │
│      "default": "./dist/components/*.js"                    │
│    }                                                        │
│                                                             │
│ 4. customConditions에 "@repo/source" 등록되어 있음     │
│    → 첫 번째 조건 매칭!                                       │
│                                                             │
│ 5. ./src/components/button.tsx 파일을 해석 결과로 사용         │
│                                                             │
│ 6. button.tsx에서 "Button" export의 정의 위치를 찾음          │
│    → export function Button(props: ButtonProps) { ... }     │
│                                                             │
│ 7. 해당 위치(파일경로 + 행 + 열)를 VSCode에 반환              │
└─────────────────────────────────────────────────────────────┘

결과: packages/base-ui/src/components/button.tsx 의 구현부로 바로 이동!
```

#### Custom Conditions가 없을 때

```
tsserver 내부 처리 과정:
┌─────────────────────────────────────────────────────────────┐
│ 1. exports에서 "@repo/source" 조건을 모름             │
│    → 스킵                                                   │
│                                                             │
│ 2. "types" 조건 매칭                                         │
│    → ./dist/components/button.d.ts                          │
│                                                             │
│ 3. button.d.ts 내용:                                        │
│    export declare function Button(props: ButtonProps): JSX.Element;│
│                                                             │
│ 4. 타입 시그니처만 있음. 구현부(함수 body) 없음                 │
└─────────────────────────────────────────────────────────────┘

결과: dist/components/button.d.ts 로 이동.
      읽기 전용이고, 구현 코드가 없어 맥락 파악이 어려움.
```

#### declarationMap이 있을 때 (폴백)

```
tsserver 내부 처리 과정:
┌─────────────────────────────────────────────────────────────┐
│ 1. "types" 조건 → ./dist/components/button.d.ts            │
│                                                             │
│ 2. 같은 디렉토리에 button.d.ts.map 파일이 있음               │
│    {                                                        │
│      "sources": ["../../src/components/button.tsx"],         │
│      "mappings": "AAAA;AACA;..."                            │
│    }                                                        │
│                                                             │
│ 3. .d.ts의 "Button" 선언 위치를 소스맵으로 역추적             │
│    → ../../src/components/button.tsx 의 원본 위치            │
│                                                             │
│ 4. 원본 소스로 점프!                                         │
└─────────────────────────────────────────────────────────────┘

결과: 원본 소스로 이동은 하지만...
      ⚠️ dist/가 빌드되어 있어야 함
      ⚠️ 빌드가 오래되면 .d.ts.map의 행 번호가 틀려서 엉뚱한 위치로 점프
```

---

### Go to Reference / Find All References (Shift+F12)

심볼을 **사용하는 모든 위치**를 검색한다. 리팩토링 전에 영향 범위를 파악할 때 필수적이다.

```
packages/base-ui/src/components/button.tsx에서:

export function Button(props: ButtonProps) { ... }
                ~~~~~~
                Shift+F12 (Find All References)

Custom Conditions 설정 시:
┌──────────────────────────────────────────────┐
│ References (3 results in 2 files)            │
│                                              │
│ apps/app-a/src/routes/index.tsx              │
│   L5: import { Button } from "@repo/base-ui/components/button"
│   L42: <Button variant="primary">Submit</Button>
│                                              │
│ apps/app-b/src/components/form.tsx           │
│   L3: import { Button } from "@repo/base-ui/components/button"
│──────────────────────────────────────────────│
│ ✅ 패키지 경계를 넘어 모든 사용처를 정확히 찾음  │
└──────────────────────────────────────────────┘
```

**왜 소스 기반이어야 정확한가?**

tsserver는 모듈 해석으로 찾은 파일을 기준으로 "같은 심볼인가"를 판단한다. Custom Conditions가 있으면 모든 패키지가 **같은 `.ts` 소스 파일**의 `Button`을 참조하므로, 참조 그래프가 하나로 연결된다.

반면 `.d.ts` 기반이면, 빌드 시점에 따라 `.d.ts`의 내용이 소스와 다를 수 있고, tsserver가 "이건 다른 심볼"로 인식하여 일부 참조를 누락할 가능성이 있다.

---

### Rename Symbol (F2)

모노레포에서 가장 강력한 리팩토링 도구. **패키지 경계를 넘어** 심볼 이름을 일괄 변경한다.

```
packages/base-ui/src/components/button.tsx에서:

export function Button(props: ButtonProps) { ... }
                ~~~~~~
                F2 → "BaseButton" 입력

Custom Conditions 설정 시:
┌─────────────────────────────────────────────────────┐
│ Rename Preview                                      │
│                                                     │
│ packages/base-ui/src/components/button.tsx           │
│   - export function Button(...)                     │
│   + export function BaseButton(...)                 │
│                                                     │
│ apps/app-a/src/routes/index.tsx                     │
│   - import { Button } from "@repo/base-ui/..."       │
│   + import { BaseButton } from "@repo/base-ui/..."   │
│   - <Button variant="primary">                      │
│   + <BaseButton variant="primary">                  │
│                                                     │
│ apps/app-b/src/components/form.tsx                  │
│   - import { Button } from "@repo/base-ui/..."       │
│   + import { BaseButton } from "@repo/base-ui/..."   │
│                                                     │
│ ✅ 3개 패키지에 걸친 모든 참조를 한 번에 변경!         │
└─────────────────────────────────────────────────────┘
```

**`.d.ts` 기반일 때의 문제:**
- `.d.ts` 파일은 보통 읽기 전용(빌드 결과물)이므로 rename 대상에서 제외되거나 실패한다
- 소스 파일과 `.d.ts`의 심볼 매핑이 어긋나면 일부 참조만 변경되는 **부분 rename** 이 발생한다
- 최악의 경우, rename 후 빌드하면 `.d.ts`에는 옛 이름이 남아 타입 에러가 발생한다

---

### Auto Import (자동 import 추가)

새 파일에서 심볼을 타이핑하면, tsserver가 워크스페이스의 모든 export를 스캔하여 import 문을 자동 제안한다.

```
apps/app-a/src/routes/new-page.tsx에서:

// 아직 import 없는 상태에서 "Button" 타이핑
const page = () => <Butt|    // Ctrl+Space

Custom Conditions 설정 시:
┌─────────────────────────────────────────────────┐
│ Suggestions                                     │
│                                                 │
│ ● Button  — @repo/base-ui/components/button      │
│   Auto Import: import { Button } from           │
│   "@repo/base-ui/components/button"              │
│                                                 │
│ ✅ 최신 소스 기반이므로 새로 추가한 export도       │
│    빌드 없이 즉시 자동완성 목록에 등장!            │
└─────────────────────────────────────────────────┘
```

**`.d.ts` 기반일 때의 문제:**
- 소스에 새 함수를 추가해도, 빌드하기 전까지 `.d.ts`에 반영되지 않는다
- 따라서 **Auto Import 목록에 새 export가 나타나지 않는다**
- 개발자가 수동으로 import 경로를 타이핑해야 하는 상황이 발생한다

---

### Hover (마우스 올리기)

심볼 위에 마우스를 올리면 타입 시그니처, JSDoc 주석, 파라미터 설명 등이 표시된다.

```
<Button variant="primary" size="lg" />
 ~~~~~~
 마우스 Hover

Custom Conditions → .ts 소스 기반:
┌─────────────────────────────────────────────────────┐
│ (alias) function Button(props: ButtonProps):         │
│   React.JSX.Element                                 │
│                                                     │
│ /**                                                 │
│  * 프로젝트의 기본 버튼 컴포넌트.                      │
│  *                                                  │
│  * @example                                         │
│  * <Button variant="primary" size="lg">Click</Button>│
│  *                                                  │
│  * @param props.variant - 버튼 스타일 변형            │
│  * @param props.size - 버튼 크기 (sm | md | lg)      │
│  */                                                 │
│                                                     │
│ import Button from "@repo/base-ui/components/button"  │
│                                                     │
│ ✅ JSDoc의 @example, @param 등 풍부한 문서 표시       │
└─────────────────────────────────────────────────────┘

.d.ts 기반:
┌─────────────────────────────────────────────────────┐
│ (alias) function Button(props: ButtonProps):         │
│   React.JSX.Element                                 │
│                                                     │
│ ⚠️ JSDoc이 .d.ts 생성 과정에서 일부 누락될 수 있음     │
│ ⚠️ @example 블록이 strip될 수 있음                    │
│ ⚠️ 인라인 주석(// 형태)은 .d.ts에 포함되지 않음         │
└─────────────────────────────────────────────────────┘
```

---

### Autocomplete (자동완성)

```typescript
import { Button } from "@repo/base-ui/components/button"

// props 자동완성
<Button v|    // Ctrl+Space

Custom Conditions 설정 시:
→ variant, onClick, disabled, size, className, ...
→ 각 prop의 타입과 JSDoc 설명까지 표시
→ 소스에서 새 prop을 추가하면 빌드 없이 즉시 목록에 추가됨
```

---

### 에디터 기능 종합 비교

| 기능 | Custom Conditions (`.ts` 소스) | `.d.ts` only | `.d.ts` + declarationMap |
|---|---|---|---|
| **Go to Definition** | ✅ 구현부로 직접 이동 | ❌ 선언만 보임 | ✅ 소스로 역추적 (빌드 필요) |
| **Go to Reference** | ✅ 패키지 간 정확한 추적 | ⚠️ 불완전할 수 있음 | ⚠️ 빌드 시점에 따라 부정확 |
| **Find All References** | ✅ 전체 워크스페이스 정확 | ⚠️ 누락 가능 | ⚠️ 빌드 상태 의존 |
| **Rename Symbol** | ✅ 패키지 간 일괄 변경 | ❌ `.d.ts` 읽기 전용 | ⚠️ 부분 rename 위험 |
| **Auto Import** | ✅ 새 export 즉시 반영 | ❌ 빌드 전까지 미반영 | ❌ 빌드 전까지 미반영 |
| **Hover (JSDoc)** | ✅ 풍부한 문서 표시 | ⚠️ 일부 주석 누락 가능 | ⚠️ 일부 주석 누락 가능 |
| **Autocomplete** | ✅ 최신 props/args 반영 | ❌ 빌드 시점 기준 | ❌ 빌드 시점 기준 |
| **빌드 필요** | **불필요** | 필수 | 필수 |
| **항상 최신** | **예** | 아니오 | 아니오 |

---

### declarationMap 심층 분석 — 폴백 메커니즘

이 프로젝트의 패키지들은 `declarationMap: true`를 설정하고 있다:

```jsonc
// packages/base-ui/tsconfig.json
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true   // .d.ts → .ts 역추적용 소스맵 생성
  }
}
```

#### declarationMap이 생성하는 파일

```
packages/base-ui/
├── src/
│   └── components/
│       └── button.tsx              ← 원본 소스
└── dist/
    └── components/
        ├── button.js               ← 빌드된 JS
        ├── button.d.ts             ← 빌드된 타입 선언
        └── button.d.ts.map         ← 선언 → 소스 역추적 매핑
```

#### `.d.ts.map`의 내용

```jsonc
// dist/components/button.d.ts.map
{
  "version": 3,
  "file": "button.d.ts",
  "sourceRoot": "",
  "sources": ["../../src/components/button.tsx"],   // 원본 소스 경로
  "names": [],
  "mappings": "AAAA,eAAO,..."                       // 행/열 매핑 (Base64 VLQ)
}
```

#### declarationMap의 동작 과정

```
1. Go to Definition 요청: "Button"의 정의 위치는?

2. tsserver가 모듈 해석 → dist/components/button.d.ts

3. button.d.ts 에서 "Button" 선언 위치 확인
   → 예: 3행 15열

4. button.d.ts.map 에서 (3행, 15열)에 대응하는 원본 위치 조회
   → sources[0] = "../../src/components/button.tsx"
   → 원본 위치: 12행 17열

5. VSCode가 원본 소스 파일의 해당 위치를 열어줌
```

#### declarationMap의 한계

| 시나리오 | 결과 |
|---|---|
| 빌드를 한 번도 안 했음 | ❌ `.d.ts`와 `.d.ts.map`이 없으므로 Go to Definition 자체가 실패하거나 모듈을 찾지 못함 |
| 소스에 새 함수를 추가하고 빌드 안 함 | ❌ `.d.ts`에 새 함수가 없으므로 Auto Import, Autocomplete에 나타나지 않음 |
| 소스의 중간에 코드를 추가/삭제함 | ⚠️ `.d.ts.map`의 행 번호 매핑이 틀어져서 Go to Definition이 **엉뚱한 줄**로 점프 |
| 소스에서 함수명을 변경하고 빌드 안 함 | ⚠️ `.d.ts`에는 옛 이름 → 타입 에러 발생. Rename Symbol도 불완전 |
| 빌드가 최신 상태 | ✅ 정상 작동. 하지만 매번 빌드해야 하는 것 자체가 불편 |

#### Custom Conditions vs declarationMap — 최종 비교

| | Custom Conditions | declarationMap |
|---|---|---|
| **접근 방식** | 처음부터 소스를 직접 참조 | 빌드 결과물에서 소스로 역추적 |
| **빌드 의존** | **없음** | 필수 (`.d.ts` + `.d.ts.map`) |
| **정확도** | 항상 100% (소스 그 자체) | 빌드 상태에 따라 가변 |
| **성능** | 소스 파싱 비용 (대규모 프로젝트에서 약간 느릴 수 있음) | `.d.ts` 파싱이 더 빠름 (이미 타입만 추출된 상태) |
| **이 프로젝트에서의 역할** | **주요 메커니즘** | 안전망 / 빌드 환경용 폴백 |

Custom Conditions가 설정되어 있으면 tsserver는 `.d.ts`를 거치지 않고 소스를 직접 읽으므로, `declarationMap`은 사실상 사용되지 않는다. 하지만 다음 상황에서 안전망 역할을 한다:

- `customConditions`를 인식하지 못하는 에디터나 도구를 사용할 때
- CI 환경에서 타입체크를 돌릴 때 (`tsc -b`는 빌드된 `.d.ts`를 참조)
- 패키지를 npm에 배포한 후 소비자가 사용할 때 (소비자는 커스텀 조건을 모름)

---

### 트러블슈팅: 에디터 기능이 기대대로 동작하지 않을 때

#### 증상 1: Go to Definition이 `.d.ts`로 이동한다

```
원인: customConditions가 적용되지 않았음

확인 방법:
1. tsconfig.base.json에 customConditions가 있는지 확인
2. 현재 파일의 tsconfig가 base를 extends하는지 확인
3. VSCode 하단 상태바에서 TypeScript 버전이 5.0+ 인지 확인

해결:
- tsconfig.base.json:
  { "compilerOptions": { "customConditions": ["@repo/source"] } }
- VSCode: Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

#### 증상 2: Auto Import에 새로 추가한 export가 나타나지 않는다

```
원인 1: export가 package.json의 exports 패턴에 매칭되지 않음
  → 예: "./components/*" 패턴인데, 새 파일이 다른 디렉토리에 있음

원인 2: tsserver 캐시가 오래됨
  → "TypeScript: Restart TS Server" 실행

원인 3: 파일이 tsconfig의 include에 포함되지 않음
  → tsconfig.json의 "include" 패턴 확인
```

#### 증상 3: Rename이 일부 파일에서만 적용된다

```
원인: 해당 파일의 tsconfig가 다른 설정을 사용함
  → 모든 tsconfig가 같은 base를 extends하는지 확인
  → 특히 customConditions가 일관되게 적용되는지 확인

확인 방법:
  VSCode에서 해당 파일 열기 → 하단 상태바의 {} 아이콘 클릭
  → 사용 중인 tsconfig 경로 확인
```

#### 증상 4: 외부 패키지(node_modules)도 소스로 이동한다

```
원인: customConditions 이름이 너무 일반적임
  → 예: "source"라는 이름을 쓰면, 외부 패키지도 같은 조건을 가질 수 있음

해결: scoped name 사용
  ❌ "source"
  ✅ "@repo/source"
```

---

## 주의사항 및 팁

### 1. customConditions는 base tsconfig에 한 번만

```jsonc
// tsconfig.base.json — 여기서 한 번만 설정
{
  "compilerOptions": {
    "customConditions": ["@repo/source"]
  }
}
```

모든 앱과 패키지의 tsconfig가 이를 `extends`하므로, 각각 선언할 필요가 없다.

### 2. vite.config.ts의 conditions는 앱마다

```typescript
// 각 앱의 vite.config.ts에 넣어야 함
resolve: {
  conditions: ['@repo/source']
}
```

`vite-tsconfig-paths`는 `paths`만 처리하며, `customConditions`는 Vite의 `resolve.conditions`에 별도로 넣어야 한다.

### 3. 커스텀 조건 이름에 scoped name 사용

```jsonc
// 좋음 — 충돌 없음
"@repo/source": "./src/components/*.tsx"

// 나쁨 — 외부 패키지와 충돌 가능
"source": "./src/components/*.tsx"
```

### 4. private 패키지는 Source-Level Sharing도 충분

npm에 배포하지 않는 패키지(`"private": true`)는 `exports`에서 `.ts` 파일을 직접 가리켜도 문제없다. Custom Conditions의 폴백 구조는 배포를 고려할 때 필요하다.

### 5. exports에서 커스텀 조건은 반드시 첫 번째

```jsonc
// 올바름 — 커스텀 조건이 types보다 앞에
{
  "@repo/source": "./src/components/*.tsx",  // 1순위
  "types": "./dist/components/*.d.ts",               // 2순위
  "default": "./dist/components/*.js"                // 3순위
}

// 잘못됨 — types가 먼저 매칭됨
{
  "types": "./dist/components/*.d.ts",               // TypeScript가 이걸 먼저 봄!
  "@repo/source": "./src/components/*.tsx",   // 무시됨
  "default": "./dist/components/*.js"
}
```

Node.js와 TypeScript 모두 **첫 번째로 매칭되는 조건**을 사용한다. 커스텀 조건이 뒤에 있으면 `"types"`가 먼저 매칭되어 빌드된 `.d.ts`를 바라보게 된다.

---

## 요약

이 프로젝트는 Colin의 권장 전략을 **실전에 맞게 조합**하여 사용한다:

| 레이어 | 전략 | 역할 |
|---|---|---|
| **패키지 간 Live Types** | Custom Export Conditions (base-ui) / Source-Level Sharing (shared) | 빌드 없이 소스 직접 참조 |
| **타입체크 성능** | Project References | 증분 빌드, 빌드 순서 보장 |
| **앱 내부 경로** | tsconfig paths + vite-tsconfig-paths | `~/`, `@/` 별칭 |
| **Static-Runtime 일치** | customConditions + resolve.conditions | 에디터와 런타임이 같은 소스를 봄 |

**결과**: 어떤 패키지의 코드를 수정하든, 빌드 없이 에디터의 타입과 브라우저의 렌더링이 즉시 반영된다.
