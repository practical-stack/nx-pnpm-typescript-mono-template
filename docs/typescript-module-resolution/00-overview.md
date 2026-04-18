# TypeScript Module Resolution in pnpm Workspaces

> pnpm workspace 모노레포에서 `moduleResolution: "Bundler"`를 사용할 때 알아야 할 모든 것

## 이 문서 시리즈의 목적

pnpm workspace + TypeScript `moduleResolution: "Bundler"` 조합은 현대 프론트엔드 모노레포의 사실상 표준이 되었다. 하지만 이 조합이 **기존의 Node.js 모듈 해석과 근본적으로 다르게 동작**하기 때문에, 이를 이해하지 못하면 다음과 같은 문제에 반복적으로 부딪힌다:

- `Cannot find module '@repo/shared'` — 분명히 설치했는데 왜?
- barrel file(`index.ts`)을 만들어야만 import가 되는 구조
- `exports` 필드를 설정했는데 TypeScript가 인식 못 함
- 빌드는 되는데 에디터에서 빨간 줄

이 시리즈는 **왜 이런 일이 발생하는지** 원리부터 설명하고, **실전에서 어떻게 설정해야 하는지**를 이 프로젝트의 실제 코드를 기반으로 보여준다.

---

## 문서 구성

| # | 문서 | 핵심 질문 |
|---|------|-----------|
| 01 | [moduleResolution: Bundler 이해하기](./01-module-resolution-bundler.md) | Bundler 모드는 Node와 뭐가 다른가? |
| 02 | [pnpm Workspace와 package.json exports](./02-pnpm-workspace-package-json.md) | exports 필드가 모듈 해석에 어떤 영향을 주는가? |
| 03 | [Bundler 모드에서 실패하는 패턴들](./03-bundler-pitfalls.md) | 어떤 import 패턴이 깨지고, 왜 깨지는가? |
| 04 | [Barrel File 없이 살아남기](./04-avoiding-barrel-files.md) | barrel file을 제거하면서도 DX를 유지하는 방법은? |
| 05 | [`baseUrl`는 왜 deprecated 되었고, 이제 무엇을 해야 할까](./05-tsconfig-baseurl-paths-in-pnpm-workspaces.md) | `baseUrl`은 예전엔 어떻게 동작했고, 지금은 어떻게 옮겨가야 하는가? |

---

## 이 프로젝트의 설정 요약

```
@repo/source (root)
├── apps/app-a          ──→  @repo/shared, @repo/base-ui
├── apps/app-b          ──→  @repo/shared, @repo/base-ui
├── packages/shared     (source-level 공유, 단일 exports)
└── packages/base-ui    (granular exports, custom conditions)
```

### 핵심 설정값

```jsonc
// tsconfig.base.json
{
  "module": "ESNext",
  "moduleResolution": "Bundler",
  "customConditions": ["@repo/source"]
}

// packages/shared/package.json — 단순한 형태
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}

// packages/base-ui/package.json — granular exports + custom condition
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

---

## 읽는 순서

- **처음 접하는 분**: 01 → 02 → 03 → 04 순서대로
- **문제 해결이 급한 분**: 03 (pitfalls)부터 읽고, 필요시 01/02 참조
- **barrel file을 없애고 싶은 분**: 04를 먼저 읽고, 02의 exports 설정 참조
