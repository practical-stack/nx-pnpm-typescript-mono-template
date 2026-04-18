# 02. TypeScript 모듈 해석

`import { greet } from "@repo/sample"`라고 썼을 때, TypeScript와 런타임(Vite, Next.js)이 각각 어떤 알고리즘으로 실제 파일을 찾는지 정리한다.

## 이 템플릿의 설정

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "customConditions": ["@repo/source"],
    "noEmit": true,
    // …
  }
}
```

세 가지가 핵심이다.

- `module: "ESNext"` — 컴파일러가 ES 모듈 문법(import/export)을 그대로 출력. 번들러 환경의 표준값.
- `moduleResolution: "Bundler"` — 번들러(Vite, Next.js, esbuild 등)의 해석 규칙을 그대로 따라간다. TypeScript 5.0에서 도입.
- `customConditions: ["@repo/source"]` — `package.json#exports`의 커스텀 조건을 인식하게 한다. 본격적인 사용 사례는 [03 문서](./03-live-types.md)에서 다룬다.

## 왜 `moduleResolution: "Bundler"`인가

이 템플릿의 두 앱은 모두 번들러를 거친다.

- `apps/tanstack-sample` — Vite (dev 서버, 빌드, 프로덕션 SSR 모두 Vite)
- `apps/next-sample` — Next.js (내부적으로 Turbopack/webpack)

번들러는 Node.js의 ESM보다 훨씬 관대하게 모듈을 해석한다.

| 동작 | Node16 / NodeNext | Bundler |
|------|-------------------|---------|
| 확장자 없는 상대 import | ❌ `ERR_MODULE_NOT_FOUND` | ✅ `.ts`, `.tsx`, `index.ts` 자동 탐색 |
| `package.json#exports` 인식 | ✅ | ✅ |
| `main` / `types` fallback | ❌ (`exports`가 있으면 무시) | ✅ |
| `customConditions` | ✅ | ✅ |

**판단 기준**: "런타임에 번들러를 거치는가?" 가 yes면 Bundler. 이 템플릿의 답은 yes다. (Node.js 서버를 번들러 없이 직접 실행하는 패키지가 추가된다면 그 패키지만 별도로 `Node16`을 쓰면 된다.)

`Node16`을 쓰지 않는 부수 효과로, **소스에 `.js` 확장자를 적지 않아도 된다**.

```typescript
// Bundler 모드 — 이 템플릿
import { greet } from './utils'      // ✅

// Node16 모드라면
import { greet } from './utils.js'   // 소스에는 .ts지만 .js로 적어야 함
```

## `package.json#exports` 한 줄 요약

`exports`는 패키지의 **공개 API 경계**를 선언하는 필드다. 이 필드가 있으면 외부에서 import할 수 있는 경로가 거기에 적힌 것으로 한정된다.

```jsonc
// packages/sample/package.json
{
  "name": "@repo/sample",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

해석되는 모습:

| import 문 | 해석 결과 |
|-----------|-----------|
| `import { greet } from "@repo/sample"` | `./packages/sample/src/index.ts` |
| `import { greet } from "@repo/sample/src/index"` | ❌ `exports`에 없음 |

`type: "module"`은 이 패키지가 ESM이라는 선언이다. `.js` 산출물이 생기는 시점에 Node.js와 번들러가 그 파일을 ESM으로 해석하게 한다.

## 조건(condition)의 우선순위

`exports` 안의 객체 키는 **위에서 아래로 순회하며 첫 매칭을 사용**한다. Bundler 모드의 TypeScript가 인식하는 기본 조건은 다음과 같다.

| 조건 | 의미 |
|------|------|
| `types` | TypeScript가 타입 해석할 때 — 항상 첫 번째에 둬야 한다 |
| `import` | ESM `import` 문 |
| `require` | CJS `require()` |
| `default` | 매칭되는 것이 없을 때의 폴백 |

여기에 `customConditions`로 사용자가 정의한 키를 추가할 수 있다. 이 템플릿은 `@repo/source` 한 가지를 추가했다 ([03 문서](./03-live-types.md)).

### 순서 규칙: types를 가장 위에

```jsonc
// ✅ 올바른 순서
{
  "types": "./dist/index.d.ts",
  "import": "./dist/index.mjs",
  "default": "./dist/index.js"
}

// ❌ types가 뒤에 있으면 import가 먼저 매칭되어 .d.ts를 못 찾을 수 있음
{
  "import": "./dist/index.mjs",
  "types": "./dist/index.d.ts"
}
```

커스텀 조건을 추가할 때는 그 조건을 **`types`보다도 위**에 둔다. 그래야 로컬 환경에서 커스텀 조건이 가장 먼저 매칭된다.

```jsonc
// 03 문서에서 다룰 패턴
{
  "@repo/source": "./src/index.ts",   // 1순위
  "types": "./dist/index.d.ts",       // 2순위
  "default": "./dist/index.js"        // 3순위
}
```

## `tsconfig.json#paths` — 이 템플릿에서의 위치

`paths`는 TypeScript 6에서 `baseUrl`이 deprecated된 이후로 **각 워크스페이스 내부의 별칭** 용도에만 쓰는 것이 권장 패턴이다. 이 템플릿도 그렇게 쓴다.

```jsonc
// apps/tanstack-sample/tsconfig.json
{
  "compilerOptions": {
    "paths": { "~/*": ["./src/*"] }
  }
}

// apps/next-sample/tsconfig.json
{
  "compilerOptions": {
    "paths": { "~/*": ["./src/*"], "@/*": ["./src/*"] }
  }
}

// packages/sample/tsconfig.json
{
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  }
}
```

**이 템플릿은 `baseUrl`을 쓰지 않는다.** TypeScript 6 기준 `paths`는 `baseUrl` 없이 동작하므로, `paths` 값에 직접 `./src/*`처럼 적으면 된다.

워크스페이스 **간** 경로(`@repo/sample` 등)는 절대로 `paths`로 매핑하지 않는다. 그건 `pnpm`의 `workspace:*`와 `package.json#exports`가 표현하는 영역이다 — `paths`로 끌어오면 TypeScript는 통과하지만 런타임이 못 찾는 불일치가 생긴다.

런타임 측 매핑은 다음 두 곳이 처리한다.

- Vite: `apps/tanstack-sample/vite.config.ts`의 `vite-tsconfig-paths` 플러그인이 `tsconfig`의 `paths`를 그대로 읽는다.
- Next.js: 내장 webpack/Turbopack이 `tsconfig`의 `paths`를 자동으로 인식한다.

그래서 `~/components/Header`처럼 쓴 import가 TypeScript와 런타임 모두에서 같은 파일로 해석된다.

## 정리

| 결정 | 이 템플릿의 선택 |
|------|------------------|
| `moduleResolution` | `"Bundler"` — 두 앱이 모두 번들러 기반 |
| `module` | `"ESNext"` |
| 워크스페이스 간 import 표현 | `package.json#exports` (커스텀 조건은 03에서) |
| 워크스페이스 내부 별칭 | `tsconfig#paths` + `vite-tsconfig-paths` (Vite) / Next.js 자동 인식 |
| `baseUrl` | 사용하지 않음 |

다음: [03. Live Types — 소스 직접 참조와 빌드 산출물의 분기](./03-live-types.md)
