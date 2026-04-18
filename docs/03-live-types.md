# 03. Live Types — 소스 직접 참조와 빌드 산출물의 분기

이 템플릿의 핵심 결정. **`packages/sample`의 코드를 수정하면 `apps/*`의 타입과 런타임이 빌드 단계 없이 즉시 반영된다.** 이 문서는 그 메커니즘을 정리하고, 향후 패키지에 빌드 산출물(`dist/`)이 필요해졌을 때 어떻게 자연스럽게 확장할 수 있는지를 보여준다.

## 두 시점, 하나의 `exports`

이 문서는 [README](./README.md#핵심-용어)에서 정의한 두 시점을 일관되게 사용한다.

| 용어 | 의미 |
|------|------|
| **로컬 실행** | 워크스페이스 안에서 `pnpm dev`, `tsc -b`, 에디터가 동작하는 시점. 워크스페이스끼리 `.ts` 소스를 직접 본다. |
| **번들 산출물** | 패키지가 `dist/`로 빌드되어 외부(npm 소비자, 다른 도구)에서 쓰이는 시점. |

목표: **하나의 `package.json#exports`로 두 시점을 동시에 만족**시킨다. 로컬에서는 소스를, 외부에서는 산출물을 가리키게 한다. 도구는 **커스텀 export 조건**이다.

## 지금: source-level exports만 사용

`@repo/sample`은 npm에 배포하지 않는 internal 패키지(`"private": true`)다. 외부 소비자가 없으므로 산출물도 필요 없다. 그래서 `exports`가 `.ts` 소스를 그대로 가리킨다.

```jsonc
// packages/sample/package.json
{
  "name": "@repo/sample",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

해석 흐름은 단순하다.

```
import { greet } from "@repo/sample"

→ TypeScript (Bundler 모드)
  → exports["."] 에서 "types" 매칭
  → packages/sample/src/index.ts 의 타입을 읽음

→ Vite (apps/tanstack-sample)
  → exports["."] 에서 "default" 매칭
  → packages/sample/src/index.ts 를 직접 트랜스파일

→ Next.js (apps/next-sample)
  → next.config.ts 의 transpilePackages: ["@repo/sample"] 설정으로
     워크스페이스 .ts 소스를 자체 번들에 포함
  → packages/sample/src/index.ts 를 직접 컴파일
```

`packages/sample/src/index.ts`를 수정하면, 위 세 도구가 모두 그 파일을 다시 읽는다. **`packages/sample`을 빌드하는 단계 자체가 존재하지 않는다.**

### Next.js의 `transpilePackages`

```typescript
// apps/next-sample/next.config.ts
const nextConfig: NextConfig = {
  transpilePackages: ['@repo/sample'],
}
```

Next.js는 기본적으로 `node_modules` 안의 패키지를 **이미 빌드된 `.js`라고 가정**한다. 워크스페이스 심볼릭 링크 너머가 `.ts` 소스라는 것을 알리려면 `transpilePackages`에 명시적으로 추가해야 한다. 새로운 source-level 패키지를 만들 때마다 이 배열에 추가한다.

Vite는 별도 설정이 필요 없다. `.ts` 소스를 만나면 자체 esbuild 파이프라인이 처리한다.

## 미리 깔린 무대장치: `@repo/source` 커스텀 조건

`packages/sample`은 지금 커스텀 조건을 사용하지 않는다. 그런데 이 템플릿은 두 곳에 이미 `@repo/source`를 등록해 두었다.

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "customConditions": ["@repo/source"]
  }
}
```

```typescript
// apps/tanstack-sample/vite.config.ts
export default defineConfig({
  resolve: {
    conditions: ['@repo/source'],
  },
  // …
})
```

이 두 줄은 **빌드 산출물이 있는 패키지를 추가했을 때** 비로소 의미가 생긴다. 즉, 지금 당장 동작하는 것은 없지만 그쪽으로 자연스럽게 확장할 수 있도록 준비되어 있다.

## 패키지를 "build 시점"으로 키울 때: 커스텀 조건 패턴

`packages/sample`을 npm에 배포하기로 했다고 가정한다. 그러면 **외부 소비자에게는 `dist/index.js` + `dist/index.d.ts`**를 제공해야 하지만, **로컬 워크스페이스는 여전히 `src/index.ts`를 봐야 한다** (그래야 Live Types가 유지된다).

`exports`를 다음과 같이 확장한다.

```jsonc
// packages/sample/package.json (가상의 미래 모습)
{
  "name": "@repo/sample",
  "type": "module",
  "exports": {
    ".": {
      "@repo/source": "./src/index.ts",   // 1순위 — 로컬 실행 시점
      "types": "./dist/index.d.ts",       // 2순위 — 외부 소비자의 타입
      "default": "./dist/index.js"        // 3순위 — 외부 소비자의 런타임
    }
  },
  "scripts": {
    "build": "tsc -b",                    // dist/ 생성 (또는 tsup, unbuild 등)
    "typecheck": "tsc -b",
    "test": "vitest run --passWithNoTests"
  }
}
```

해석 흐름이 시점별로 갈라진다.

| 소비자 | 인식하는 조건 | 매칭 결과 | 읽히는 파일 |
|--------|---------------|-----------|-------------|
| 워크스페이스 내부 TypeScript | `customConditions: ["@repo/source"]` | `@repo/source` | `./src/index.ts` |
| 워크스페이스 내부 Vite | `resolve.conditions: ["@repo/source"]` | `@repo/source` | `./src/index.ts` |
| 워크스페이스 내부 Next.js | (커스텀 조건 미등록 — 아래 주의 참조) | `default` | `./dist/index.js` |
| 외부 npm 소비자 | (커스텀 조건 모름) | `types` → `default` | `./dist/index.d.ts` + `./dist/index.js` |

### 핵심 포인트

1. **순서가 결정한다.** 객체 키는 위에서 아래로 첫 매칭이 이긴다. 커스텀 조건이 `types`보다 위에 있어야 로컬 도구가 산출물 대신 소스를 선택한다.
2. **커스텀 조건의 이름은 scoped로**. `"source"` 같은 일반 이름은 외부 패키지가 같은 키를 쓰면 충돌해서 외부 패키지의 미빌드 소스까지 읽히는 사고가 난다. `@repo/source`처럼 워크스페이스 스코프와 같은 prefix가 안전하다.
3. **로컬 도구만 조건을 등록한다.** 외부 소비자는 `customConditions`를 모르기 때문에 자동으로 `types` → `default` 폴백 경로를 탄다. 한 `package.json`이 두 시점을 동시에 만족시킨다.

### Next.js를 같은 패턴에 합류시키려면

위 표에서 Next.js만 `dist/index.js`를 본다. Next는 dev/build 양쪽에서 커스텀 조건을 직접 노출하는 옵션이 일관되게 제공되지 않으므로, 보통 두 가지 중 하나를 선택한다.

- **(A) 산출물을 보게 두기** — 그 패키지에 한해 빌드를 거치게 한다. `dist/`가 항상 최신이도록 Nx의 `dependsOn: ["^build"]`를 활용 ([04 문서](./04-nx-and-tsconfig-references.md)).
- **(B) 소스를 보게 하기** — `transpilePackages: ['@repo/sample']`로 Next에 소스 트랜스파일을 맡긴다. 단, Next 빌드의 webpack/Turbopack 설정에서 `resolve.conditions`를 추가해야 `@repo/source`가 매칭된다. (현재 Next.js 16 기준 `next.config.ts`의 `webpack` 콜백 또는 `turbopack.resolveAlias`를 통해 가능.)

이 템플릿의 현재 `next-sample`은 (B)의 소스 트랜스파일만 켜져 있고 source-level exports를 쓰는 패키지(`@repo/sample`)에 대해서만 동작한다. `dist`를 가진 패키지를 추가하면 그 패키지에 맞춰 결정을 내려야 한다.

## `composite: true`는 런타임과 무관하다

`packages/sample/tsconfig.json`은 `composite: true`, `outDir: "dist"`, `declaration: true`를 가진다.

```jsonc
// packages/sample/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts"]
}
```

여기서 만들어지는 `dist/`는 **런타임에 절대로 사용되지 않는다.** `exports`가 `src/index.ts`를 가리키고 있고 `apps/*`의 어떤 import도 `dist/`를 거치지 않는다.

이 `dist/`의 진짜 용도는 **TypeScript의 project references**다. `composite: true` 프로젝트는 반드시 선언 파일을 emit해야 다른 프로젝트가 `references`로 참조할 수 있다. 그래서 `noEmit: true`(`tsconfig.base.json`에서 상속)를 명시적으로 `false`로 덮어쓴다. project references의 의미와 그것을 Nx가 어떻게 활용하는지는 [04 문서](./04-nx-and-tsconfig-references.md)에서 다룬다.

요약하자면:

| 메커니즘 | 영향 범위 | 비고 |
|----------|-----------|------|
| `package.json#exports` | 런타임 + TypeScript 타입 해석 | Live Types를 만든다 |
| `tsconfig.json#references` + `composite` | `tsc -b`의 incremental typecheck | 런타임 import와 무관 |

이 둘을 혼동하면 "왜 `dist/`가 있는데 수정이 즉시 반영되지?"라거나, 반대로 "`dist/`를 지웠더니 typecheck가 이상해진다"는 혼선이 생긴다.

## 새 패키지를 추가할 때의 결정 트리

```
새 패키지가 npm에 배포되거나 외부 소비자가 있는가?
├── No (internal 전용)
│   └── source-level exports
│       package.json:
│         "exports": {
│           ".": {
│             "types":   "./src/index.ts",
│             "default": "./src/index.ts"
│           }
│         }
│       Next.js로 import한다면 transpilePackages에 추가
│
└── Yes (또는 미래에 그럴 수 있음)
    └── 커스텀 조건 + dist 폴백
        package.json:
          "exports": {
            ".": {
              "@repo/source": "./src/index.ts",
              "types":        "./dist/index.d.ts",
              "default":      "./dist/index.js"
            }
          }
        + 빌드 스크립트
        + Next.js로 import한다면 위의 (A)/(B) 결정
```

두 경우 모두 **로컬 워크스페이스는 항상 `.ts` 소스를 본다**는 불변식을 지킨다. 빌드 산출물은 외부 경계에서만 등장한다.

## 정리

| 결정 | 이유 |
|------|------|
| `@repo/sample`은 source-level exports만 사용 | internal 전용. dist가 필요 없으므로 가장 단순한 형태로 충분 |
| `tsconfig.base.json`에 `customConditions: ["@repo/source"]` 미리 등록 | 빌드 산출물이 있는 패키지가 추가될 때, 워크스페이스 측에 추가 설정 없이 바로 매칭되도록 |
| `vite.config.ts`에 `resolve.conditions` 미리 등록 | 같은 이유. Vite 측 무대장치 |
| Next.js는 `transpilePackages`로 source-level 패키지 처리 | Next의 기본 가정(`node_modules`는 빌드 완료)을 우회 |
| `packages/sample/dist/`는 project references 용도 | 런타임과 무관. 04 문서 참조 |

다음: [04. Nx + tsconfig references](./04-nx-and-tsconfig-references.md)
