# moduleResolution: "Bundler" 이해하기

## 왜 "Bundler" 모드가 생겨났는가

TypeScript의 `moduleResolution` 옵션은 `import` 문을 만났을 때 **실제 파일을 어떻게 찾을지** 결정한다. 역사적으로 두 가지 모드가 있었다:

| 모드 | 동작 | 시대 |
|------|------|------|
| `Classic` | TypeScript 초기, 거의 안 씀 | ~2015 |
| `Node` (= `Node10`) | Node.js의 `require()` 해석 규칙 모방 | ~2015–2022 |
| `Node16` / `NodeNext` | Node.js ESM + CJS 듀얼 시스템 반영 | 2022~ |
| **`Bundler`** | 번들러(Vite, webpack, esbuild)의 해석 규칙 반영 | **2023~ (TS 5.0)** |

### 핵심 문제: Node의 규칙 ≠ 번들러의 규칙

Node.js의 ESM(`Node16`/`NodeNext`)은 엄격하다:

```typescript
// Node ESM에서는 확장자 필수
import { greet } from './utils.js'     // ✅ OK
import { greet } from './utils'        // ❌ ERR_MODULE_NOT_FOUND
```

하지만 실제 프론트엔드 프로젝트에서는 Vite, webpack, esbuild 같은 **번들러**가 모듈을 해석한다. 번들러는 훨씬 관대하다:

```typescript
// 번들러에서는 확장자 없어도 됨
import { greet } from './utils'        // ✅ Vite가 알아서 찾음
import { Button } from './Button'      // ✅ .tsx도 찾음
```

`Bundler` 모드는 이 현실을 TypeScript의 타입 체커에 반영한다. **"런타임에서 실제로 모듈을 해석하는 것은 번들러이니, 번들러의 규칙을 따르자"**는 것이다.

---

## Bundler 모드의 해석 규칙

### 1. 상대 경로 import

```typescript
import { foo } from './utils'
```

Bundler 모드에서 TypeScript는 다음 순서로 파일을 찾는다:

1. `./utils.ts`
2. `./utils.tsx`
3. `./utils.d.ts`
4. `./utils/index.ts`
5. `./utils/index.tsx`
6. `./utils/index.d.ts`

> **포인트**: 확장자 없이 import해도 `.ts`, `.tsx` 파일을 직접 찾는다. `Node16`에서는 이게 에러다.

### 2. 패키지 import (bare specifier)

```typescript
import { greet } from '@repo/shared'
```

패키지를 import할 때의 해석 순서:

1. **`package.json`의 `exports` 필드** — 최우선
2. **`package.json`의 `main` / `types` 필드** — fallback
3. **`index.ts` / `index.d.ts`** — 최후의 fallback

이것이 `Node16`과의 가장 큰 차이점이다:

| 동작 | Node16/NodeNext | Bundler |
|------|-----------------|---------|
| `exports` 필드 지원 | ✅ | ✅ |
| `main`/`types` fallback | ❌ (`exports`가 있으면 무시) | ✅ |
| 확장자 없는 상대 import | ❌ 에러 | ✅ 허용 |
| `index.ts` 자동 해석 | ❌ | ✅ |
| `#imports` (imports map) | ✅ | ✅ |
| `customConditions` 지원 | ✅ | ✅ |

### 3. Condition 해석

`exports` 필드에서 condition을 해석할 때, Bundler 모드는 다음 기본 condition들을 인식한다:

```jsonc
// 기본 인식되는 conditions
"import"      // ESM import일 때
"require"     // CJS require일 때 (Bundler에서는 보통 안 씀)
"default"     // fallback
"types"       // TypeScript 전용 — 타입 선언 위치
```

추가 condition은 `customConditions`로 설정한다:

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "customConditions": ["@repo/source"]
  }
}
```

이렇게 하면 TypeScript가 `exports` 필드에서 `@repo/source` condition도 인식한다.

---

## Bundler 모드에서 "types" condition의 특별한 위치

TypeScript는 `exports` 필드를 해석할 때 **`types` condition을 항상 가장 먼저 확인**한다. 이것은 어떤 다른 condition보다 우선한다:

```jsonc
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",    // ← TS가 먼저 봄 (타입 해석)
      "import": "./dist/index.mjs",    // ← 번들러가 봄 (런타임)
      "default": "./dist/index.js"
    }
  }
}
```

**규칙**: `types` condition은 항상 각 condition 블록의 **첫 번째**에 위치시켜야 한다. TypeScript의 해석기는 위에서 아래로 순회하며 첫 번째 매칭을 사용하기 때문이다.

### 주의: types가 반드시 .d.ts일 필요는 없다

source-level 공유(빌드 없이 소스를 직접 참조)에서는 `.ts` 파일을 직접 가리킬 수 있다:

```jsonc
// packages/shared/package.json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",     // ← .ts 파일 직접 참조
      "default": "./src/index.ts"
    }
  }
}
```

이것은 **Bundler 모드에서만** 유효하다. `Node16`에서는 `.ts` 파일을 직접 참조하면 에러가 발생한다.

---

## 이 프로젝트에서의 적용

### tsconfig.base.json

```jsonc
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "customConditions": ["@repo/source"]
  }
}
```

- `module: "ESNext"` — Bundler 모드는 `ES2015` 이상의 module 설정을 요구한다
- `customConditions` — `@repo/base-ui`의 소스 파일을 직접 참조하기 위한 커스텀 condition

### 왜 Bundler를 선택했는가

1. **Vite가 런타임 번들러** — 실제 모듈 해석은 Vite가 하므로, TypeScript는 Vite의 규칙에 맞추는 것이 합리적
2. **source-level 공유** — `.ts` 파일을 직접 import하는 패턴은 `Node16`에서는 불가능
3. **확장자 생략** — 프론트엔드 생태계의 관행에 맞춤
4. **DX 향상** — 불필요한 `.js` 확장자 강제 없음

---

## Bundler vs Node16: 언제 무엇을 쓸까

| 상황 | 권장 모드 |
|------|-----------|
| Vite / webpack / esbuild로 빌드하는 앱 | **Bundler** |
| Next.js 앱 | **Bundler** |
| Node.js 서버 (번들러 없이 직접 실행) | **Node16** or **NodeNext** |
| 모노레포 내부 패키지 (source-level 공유) | **Bundler** |
| npm에 배포하는 라이브러리 | **아래 별도 설명** |

> **핵심 판단 기준**: "이 코드를 실행할 때 번들러를 거치는가?" → Yes면 Bundler, No면 Node16.

### npm 라이브러리에서의 moduleResolution 선택

전통적으로 npm에 배포하는 라이브러리는 `Node16`/`NodeNext`를 권장해왔다. 소비자가 어떤 환경에서 사용할지 모르니, 가장 엄격한 규칙을 따르는 것이 안전하다는 논리다.

하지만 `Node16`에는 **실질적인 DX 비용**이 따른다:

```typescript
// Node16에서는 소스코드에서도 .js 확장자를 써야 한다
import { parse } from './parser.js'       // ← 실제 파일은 parser.ts
import { validate } from './utils/validate.js'
import type { Config } from './types.js'
```

TypeScript 소스(`.ts`)를 작성하면서 import 경로에 `.js` 확장자를 붙여야 하는 이유는, `Node16` 모드가 **"TypeScript는 import 경로를 변환하지 않는다"**는 원칙을 따르기 때문이다. 컴파일된 결과물(`.js`)이 Node.js에서 직접 실행되므로, 소스 단계에서부터 최종 실행 환경의 확장자를 써야 한다.

이 제약이 불편하기 때문에 현실적으로 두 가지 흐름이 존재한다:

**흐름 1: Node16 + 확장자 명시 (정통파)**

```typescript
// 소스 코드에 .js 확장자 명시
import { foo } from './utils.js'
```

- Node.js에서 빌드 산출물을 직접 실행할 수 있다는 보장
- 에디터에서 `.ts` 파일을 편집하면서 `.js`를 쓰는 인지 부조화
- 팀 온보딩 비용 증가

**흐름 2: Bundler + 빌드 도구(tsup, unbuild, esbuild 등)**

```typescript
// 소스 코드에 확장자 생략
import { foo } from './utils'
```

```bash
# tsup이 빌드 시 올바른 CJS/ESM 산출물 생성
tsup src/index.ts --format cjs,esm --dts
```

- 소스 코드의 DX가 좋다
- 빌드 도구가 `exports` 필드와 확장자 매핑을 대신 처리
- 단, 빌드 도구에 대한 의존성이 추가된다
- **현재 대부분의 모던 라이브러리(Hono, tRPC 등)가 이 방식**을 채택하는 추세

#### 빌드 도구가 확장자 문제를 해결하는 원리

핵심은 **소스에서는 확장자 없이 쓰고, 빌드 시점에 `.js`를 자동 부여**하는 것이다. esbuild 플러그인으로 구현하는 전형적인 패턴:

```typescript
// esbuild 플러그인: 빌드 시 import 경로에 .js 확장자 자동 추가
const addExtension = (extension = '.js', srcExt = '.ts'): Plugin => ({
  name: 'add-extension',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (!args.importer) return              // entry point는 무시
      const resolved = path.join(args.resolveDir, args.path)

      if (fs.existsSync(`${resolved}${srcExt}`)) {
        // ./parser → ./parser.js
        return { path: args.path + extension, external: true }
      }
      if (fs.existsSync(path.join(resolved, `index${srcExt}`))) {
        // ./utils → ./utils/index.js
        return { path: `${args.path}/index${extension}`, external: true }
      }
    })
  },
})
```

이 플러그인과 함께 3가지 빌드를 병렬로 실행하는 것이 일반적이다:

```typescript
await Promise.all([
  build({ format: 'esm',  outdir: 'dist',      plugins: [addExtension('.js')] }),
  build({ format: 'cjs',  outdir: 'dist/cjs' }),
  exec('tsc --emitDeclarationOnly --declaration --outDir dist/types'),
])
```

결과물:

```
dist/
  index.js              ← ESM (import 경로에 .js 포함)
  cjs/
    index.js            ← CJS
    package.json        ← { "type": "commonjs" }
  types/
    index.d.ts          ← 타입 선언
```

#### CJS 서브디렉토리의 `package.json` 트릭

루트 `package.json`에 `"type": "module"`이 있으면 모든 `.js`가 ESM으로 해석된다. CJS 산출물을 별도 디렉토리에 넣을 때는 **해당 디렉토리에 `{ "type": "commonjs" }`만 담은 `package.json`을 배치**한다:

```jsonc
// dist/cjs/package.json
{ "type": "commonjs" }
```

Node.js는 가장 가까운 상위 `package.json`의 `type` 필드를 참조하므로, `dist/cjs/` 안의 `.js` 파일은 CJS로 인식된다.

**판단 기준**:

| 조건 | 권장 |
|------|------|
| 라이브러리가 번들러 없이 Node.js에서 직접 실행되어야 함 | Node16 + `.js` 확장자 |
| 라이브러리 소비자가 대부분 프론트엔드 (Vite, webpack 등) | Bundler + tsup/unbuild |
| 듀얼 CJS/ESM 지원 필요 | Bundler + 빌드 도구 (esbuild/tsup이 포맷 분기 처리) |
| `.ts` 소스에 `.js` 쓰는 게 용납 안 됨 | Bundler + 빌드 도구 |

---

## 다음 문서

→ [02. pnpm Workspace와 package.json exports](./02-pnpm-workspace-package-json.md)
