# TypeScript 모듈 해석(Module Resolution) 배경지식

> 이 문서는 [Live types in a TypeScript monorepo](https://colinhacks.com/essays/live-types-typescript-monorepo) 글을 이해하기 위한 TypeScript 배경지식을 다룹니다.

## 목차

- [왜 모듈 해석이 중요한가](#왜-모듈-해석이-중요한가)
- [Node.js의 모듈 해석](#nodejs의-모듈-해석)
- [TypeScript의 모듈 해석](#typescript의-모듈-해석)
- [moduleResolution 옵션의 변천사](#moduleresolution-옵션의-변천사)
- [package.json exports 필드](#packagejson-exports-필드)
- [Static vs Runtime — 두 세계의 괴리](#static-vs-runtime--두-세계의-괴리)

---

## 왜 모듈 해석이 중요한가

TypeScript 모노레포에서 가장 흔한 불만은 이것이다:

> "shared 패키지를 수정했는데, 앱에서 타입이 바뀌지 않는다. 빌드를 다시 해야 한다."

이 문제의 근본 원인은 **모듈 해석(Module Resolution)** 에 있다. `import { something } from "@repo/shared"` 라고 쓸 때, TypeScript와 Node.js는 각각 다른 알고리즘으로 `@repo/shared`가 가리키는 실제 파일을 찾는다. 이 "찾는 방법"을 이해해야 문제를 풀 수 있다.

---

## Node.js의 모듈 해석

### Bare Specifier란?

```typescript
// Relative specifier — 상대 경로로 직접 파일을 가리킴
import { foo } from './utils/foo'

// Bare specifier — 패키지 이름만 씀
import { bar } from 'lodash'
import { baz } from '@repo/shared'
```

`'lodash'`나 `'@repo/shared'`처럼 **경로가 아닌 패키지 이름**으로 import하는 것을 bare specifier라 한다.

### Node.js의 해석 순서

Node.js가 bare specifier를 만나면:

1. 현재 디렉토리의 `node_modules/` 에서 해당 패키지 폴더를 찾는다
2. 없으면 상위 디렉토리의 `node_modules/`를 재귀적으로 올라가며 찾는다
3. 패키지 폴더를 찾으면 그 안의 `package.json`을 읽는다
4. `package.json`의 `exports` → `main` 필드 순으로 진입점(entry point)을 결정한다

```
프로젝트/
├── node_modules/
│   └── @repo/shared/
│       ├── package.json    ← exports/main 필드를 읽음
│       ├── dist/index.js   ← main이 가리키는 실제 파일
│       └── src/index.ts    ← 소스 (Node.js는 보통 이걸 무시)
```

### pnpm workspace에서의 심볼릭 링크

pnpm workspace에서 `"@repo/shared": "workspace:*"` 로 의존성을 선언하면, `node_modules/@repo/shared`는 실제 `packages/shared` 디렉토리를 가리키는 **심볼릭 링크**가 된다.

```
apps/app-a/node_modules/@repo/shared → ../../packages/shared
```

이 덕분에 Node.js는 `packages/shared/package.json`의 `exports`/`main` 필드를 직접 읽게 된다.

---

## TypeScript의 모듈 해석

TypeScript는 Node.js와 **거의 같은** 알고리즘을 쓰되, 목적이 다르다:

| | Node.js | TypeScript |
|---|---|---|
| **목적** | 런타임에 실행할 `.js` 파일 찾기 | 편집 시 타입 정보를 가진 파일 찾기 |
| **읽는 필드** | `exports` → `main` | `exports.types` → `types` → `main` |
| **원하는 파일** | `.js`, `.mjs`, `.cjs` | `.d.ts`, `.ts`, `.tsx` |

핵심 차이: TypeScript는 **`types`** 필드(또는 `exports` 안의 `"types"` 조건)를 먼저 찾아서 선언 파일(`.d.ts`)을 로드한다.

### TypeScript가 타입을 찾는 순서

```jsonc
// packages/shared/package.json
{
  "name": "@repo/shared",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",   // 1순위: exports의 types 조건
      "import": "./dist/index.js"
    }
  },
  "types": "./dist/index.d.ts",       // 2순위: 최상위 types 필드
  "main": "./dist/index.js"           // 3순위: main에서 .d.ts 유추
}
```

1. `exports` 안의 `"types"` 조건이 있으면 그 파일을 사용
2. 없으면 최상위 `"types"` 필드
3. 그것도 없으면 `"main"` 필드에서 `.js` → `.d.ts`로 확장자를 바꿔서 시도

---

## moduleResolution 옵션의 변천사

`tsconfig.json`의 `moduleResolution` 옵션은 TypeScript가 어떤 알고리즘으로 모듈을 해석할지 결정한다.

### 타임라인

| 옵션 | 도입 시기 | 설명 |
|---|---|---|
| `"Classic"` | TS 1.0 | AMD/System 모듈용. 현재는 사용하지 않음 |
| `"Node"` (= `"Node10"`) | TS 2.0 | Node.js CJS 방식. `node_modules` 탐색, `main` 필드 사용 |
| `"Node16"` / `"NodeNext"` | TS 4.7 | Node.js ESM 지원. `exports` 필드 인식, `.js` 확장자 필수 |
| **`"Bundler"`** | **TS 5.0** | **번들러(Vite, webpack 등) 환경 최적화**. `exports` 인식, 확장자 생략 허용 |

### `"Bundler"` — 현대 모노레포의 표준

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler"  // ← 이 프로젝트의 설정
  }
}
```

`"Bundler"` 모드의 특징:

- **`package.json#exports` 필드를 인식한다** — 조건부 export(`"import"`, `"types"`, 커스텀 조건) 지원
- **확장자 없이 import 가능** — `import './foo'`를 `./foo.ts`로 해석
- **`customConditions` 지원** — 커스텀 export 조건을 추가로 인식하게 할 수 있다

이 마지막 특성이 "Live Types" 전략의 핵심이다.

---

## package.json exports 필드

`exports`는 Node.js 12.7+에서 도입된 필드로, 패키지의 진입점을 **조건부**로 지정할 수 있다.

### 기본 구조

```jsonc
{
  "name": "@repo/shared",
  "exports": {
    ".": {                          // "." = 패키지의 메인 진입점
      "types": "./dist/index.d.ts", // TypeScript용
      "import": "./dist/index.js",  // ESM import용
      "require": "./dist/index.cjs" // CJS require용
    },
    "./utils": {                    // subpath export
      "import": "./dist/utils.js"
    }
  }
}
```

### 조건(Condition)의 종류

| 조건 | 사용처 |
|---|---|
| `"types"` | TypeScript가 타입 선언 파일을 찾을 때 |
| `"import"` | ESM `import` 문을 사용할 때 |
| `"require"` | CJS `require()` 를 사용할 때 |
| `"default"` | 위 조건 중 매칭되는 것이 없을 때 폴백 |
| `"node"` | Node.js 환경일 때 |
| `"browser"` | 브라우저 환경일 때 |
| **커스텀 조건** | 사용자가 자유롭게 정의 (예: `"@repo/source"`) |

### 커스텀 조건 — Live Types의 핵심 메커니즘

```jsonc
{
  "exports": {
    ".": {
      "@repo/source": "./src/index.ts",  // 커스텀 조건: 소스 직접 참조
      "types": "./dist/index.d.ts",     // 일반: 빌드된 선언 파일
      "default": "./dist/index.js"      // 일반: 빌드된 JS
    }
  }
}
```

커스텀 조건은 **아무도 자동으로 인식하지 않는다**. 명시적으로 "이 조건을 인식하라"고 알려줘야 한다:

```jsonc
// tsconfig.json — TypeScript에게 알려주기
{
  "compilerOptions": {
    "customConditions": ["@repo/source"]
  }
}
```

```typescript
// vite.config.ts — Vite에게 알려주기
export default {
  resolve: {
    conditions: ['@repo/source']
  }
}
```

이렇게 하면 개발 환경에서는 `.ts` 소스를 직접 참조하고, npm publish 시에는 빌드된 `.js`/`.d.ts`를 사용하게 된다.

---

## TypeScript Language Server와 에디터 기능

모듈 해석은 단순히 "import가 어디를 가리키는가"를 넘어, **에디터의 거의 모든 지능형 기능**의 기반이 된다.

### Language Server Protocol (LSP)

VSCode의 TypeScript 지원은 **TypeScript Language Server** (tsserver)가 담당한다. 이 서버는 에디터와 별도 프로세스로 실행되며, LSP(Language Server Protocol)를 통해 통신한다.

```
┌──────────────┐         LSP          ┌──────────────────────┐
│   VSCode     │  ◄──── JSON-RPC ───► │  tsserver             │
│   (에디터)   │                       │  (TS Language Server) │
│              │  "Go to Definition"   │                       │
│              │  ──────────────────►  │  1. 모듈 해석          │
│              │                       │  2. 심볼 위치 찾기      │
│              │  파일 위치 + 행/열     │  3. 결과 반환          │
│              │  ◄──────────────────  │                       │
└──────────────┘                       └──────────────────────┘
```

### 모듈 해석이 영향을 미치는 에디터 기능

tsserver가 `import { Button } from "@repo/base-ui/components/button"` 을 만나면, **모듈 해석**을 통해 `Button`이 정의된 실제 파일을 찾는다. 이 해석 결과가 다음 기능들의 품질을 결정한다:

| 에디터 기능 | 키바인딩 (VSCode) | 모듈 해석의 영향 |
|---|---|---|
| **Go to Definition** | `F12` / `Ctrl+Click` | 해석된 파일의 심볼 정의 위치로 점프 |
| **Go to Type Definition** | — | 심볼의 타입이 정의된 위치로 점프 |
| **Go to Reference** | `Shift+F12` | 해석된 심볼을 참조하는 모든 위치 표시 |
| **Find All References** | `Shift+Alt+F12` | 워크스페이스 전체에서 참조 검색 |
| **Rename Symbol** | `F2` | 심볼 이름을 모든 참조 위치에서 일괄 변경 |
| **Auto Import** | 자동 제안 | 사용 가능한 export 목록을 스캔하여 제안 |
| **Hover** | 마우스 올리기 | 심볼의 타입 시그니처와 JSDoc 표시 |
| **Autocomplete** | `Ctrl+Space` | 해석된 모듈의 export 목록에서 자동완성 |
| **Quick Fix** | `Ctrl+.` | 빠진 import 자동 추가 등 |
| **Call Hierarchy** | — | 함수의 호출자/피호출자 트리 표시 |

### 해석 결과에 따른 체감 차이

모듈 해석이 **`.d.ts` 선언 파일**을 가리킬 때와 **`.ts` 소스 파일**을 가리킬 때, 에디터 경험이 크게 달라진다:

| 기능 | `.d.ts` (빌드 결과) | `.ts` (원본 소스) |
|---|---|---|
| **Go to Definition** | 타입 시그니처만 보임. 구현부 없음 | **구현부 코드로 바로 이동** |
| **Hover** | 타입 정보만 표시 | 타입 + JSDoc + 인라인 주석 모두 표시 |
| **Rename Symbol** | `.d.ts`는 읽기 전용 → 실패하거나 소스와 동기화 안 됨 | **소스에서 직접 rename → 모든 참조 일괄 변경** |
| **Find All References** | `.d.ts` 기준 참조만 표시 | **소스 기준으로 정확한 참조 추적** |
| **Auto Import** | 빌드된 export 기준 (오래된 것일 수 있음) | **최신 소스의 export 기준** |
| **빌드 필요 여부** | `.d.ts`가 없거나 오래되면 작동 안 함 | **빌드 불필요, 항상 최신** |

이것이 Live Types가 단순한 "편의"가 아닌, **개발 생산성의 핵심 인프라**인 이유다.

### declarationMap — `.d.ts`에서 소스로의 역추적

TypeScript는 `declarationMap: true` 옵션으로 `.d.ts.map` 파일을 생성할 수 있다. 이 소스맵은 `.d.ts`의 각 선언이 원본 `.ts`의 어디에서 왔는지 매핑한다.

```
packages/base-ui/dist/
├── components/
│   ├── button.d.ts        ← TypeScript가 참조하는 선언 파일
│   └── button.d.ts.map    ← 선언 → 소스 역추적 매핑
```

```jsonc
// button.d.ts.map (간략화)
{
  "version": 3,
  "file": "button.d.ts",
  "sourceRoot": "",
  "sources": ["../../src/components/button.tsx"],  // 원본 소스 경로
  "mappings": "AAAA;AACA;..."
}
```

이 매핑 덕분에 `.d.ts`에서 Go to Definition을 해도 VSCode가 원본 `.ts` 파일로 점프할 수 있다. 하지만 이는 **빌드 결과물(`.d.ts` + `.d.ts.map`)이 존재해야만** 작동하므로, Live Types의 근본적 해결책이 되지는 못한다.

---

## Static vs Runtime — 두 세계의 괴리

모노레포에서 "Live Types"가 어려운 근본적인 이유:

```
┌─────────────────────────────────────────────────┐
│                    에디터 (VSCode)                │
│  TypeScript Language Server                      │
│  → package.json의 "types" 조건으로 .d.ts를 찾음     │
│  → 빌드된 선언 파일을 봄 (오래된 타입!)              │
└─────────────────────────────────────────────────┘
                       ≠
┌─────────────────────────────────────────────────┐
│                   런타임 (Node.js)               │
│  → package.json의 "import" 조건으로 .js를 찾음      │
│  → 빌드된 JS를 실행                               │
└─────────────────────────────────────────────────┘
```

**문제**: 둘 다 빌드된 파일을 보고 있다. 소스를 수정해도 빌드하기 전까지는 변화가 반영되지 않는다.

**목표**: 두 세계 모두 빌드 없이 `.ts` 소스를 직접 보게 만드는 것. 이것이 **"Live Types"** 다.

```
┌─────────────────────────────────────────────────┐
│               에디터 (VSCode) — Live!            │
│  TypeScript Language Server                      │
│  → customConditions로 .ts 소스를 직접 참조          │
│  → 수정 즉시 타입 변화 반영!                        │
└─────────────────────────────────────────────────┘
                       =
┌─────────────────────────────────────────────────┐
│              런타임 (Vite) — Live!               │
│  → resolve.conditions로 .ts 소스를 직접 참조        │
│  → 수정 즉시 HMR 반영!                            │
└─────────────────────────────────────────────────┘
```

### Static-Runtime Disagreement (정적-런타임 불일치)

TypeScript가 보는 타입과 실제 런타임 동작이 다른 상태를 **Static-Runtime Disagreement** 라 한다. 예를 들어:

- TypeScript는 `.ts` 소스의 새 함수 시그니처를 봄
- Node.js는 오래된 `.js` 빌드 결과의 이전 시그니처를 실행함

이 불일치가 발생하면 TypeScript가 에러를 잡지 못하거나, 없는 에러를 표시하게 된다. Live Types 전략의 핵심은 이 불일치를 **원천적으로 제거**하는 것이다.

---

## 다음 문서

- [02-live-types-in-monorepo.md](./02-live-types-in-monorepo.md) — Live Types 전략 5가지 비교
- [03-applying-live-types-to-our-project.md](./03-applying-live-types-to-our-project.md) — 우리 프로젝트에의 적용
