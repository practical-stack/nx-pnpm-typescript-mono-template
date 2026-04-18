# Live Types in a TypeScript Monorepo — 전략 비교

> 원문: [Colin McDonnell — Live types in a TypeScript monorepo](https://colinhacks.com/essays/live-types-typescript-monorepo) (2024.05.30)
>
> 이 문서는 원문의 핵심을 정리하고, 각 전략의 장단점을 비교합니다.
> TypeScript 배경지식은 [01-typescript-module-resolution-background.md](./01-typescript-module-resolution-background.md)를 참고하세요.

## 목차

- [Live Types란 무엇인가](#live-types란-무엇인가)
- [전략 1: Project References](#전략-1-project-references)
- [전략 2: publishConfig (pnpm 전용)](#전략-2-publishconfig-pnpm-전용)
- [전략 3: tsconfig paths](#전략-3-tsconfig-paths)
- [전략 4: tshy liveDev](#전략-4-tshy-livedev)
- [전략 5: Custom Export Conditions (권장)](#전략-5-custom-export-conditions-권장)
- [전략 비교 요약](#전략-비교-요약)

---

## Live Types란 무엇인가

모노레포에서 개발할 때, 한 패키지의 코드를 수정하면 그 변경이 **빌드 없이 즉시** 다른 패키지에 반영되어야 한다. 이것이 "Live Types"다.

```diff
  // apps/app-a/src/routes/index.tsx
- import { Fish } from "../../../packages/shared/src/index";  // 상대경로 — 작동하지만 지저분
+ import { Fish } from "@repo/shared";                         // 패키지명 — 깔끔하고 올바른 방법
```

패키지명으로 import할 때도, TypeScript가 빌드된 `.d.ts` 대신 원본 `.ts` 소스를 바라보게 하는 것이 목표다.

### 왜 어려운가?

1. **Node.js**는 `package.json`의 `exports`/`main`을 읽어 `.js` 파일을 찾는다
2. **TypeScript**는 같은 구조에서 `types` 조건이나 `.d.ts` 파일을 찾는다
3. 둘 다 **빌드된 결과물**을 보고 있기 때문에, 소스 수정이 즉시 반영되지 않는다

해결: 두 시스템 모두 **소스 `.ts` 파일**을 직접 바라보게 "속이는" 방법이 필요하다.

---

## 전략 1: Project References

### 개요

TypeScript의 `references` 필드를 사용해 패키지 간 의존 관계를 선언한다.

```jsonc
// packages/pkg-b/tsconfig.json
{
  "references": [
    { "path": "../pkg-a" }
  ]
}
```

### 작동 원리

- TypeScript는 `references`로 연결된 프로젝트의 소스를 직접 참조할 수 있다
- 대규모 코드베이스에서 **증분 빌드(incremental build)** 와 **병렬 타입체크** 를 가능하게 한다
- `tsc -b` (build mode)와 함께 사용하도록 설계되었다

### 한계

| 문제 | 설명 |
|---|---|
| **extends에서 상속 불가** | `references`는 `tsconfig.json`의 `extends`로 상속되지 않는다. 모든 패키지 tsconfig에 수동 선언 필요 |
| **package.json과 이중 관리** | `references`가 `dependencies`를 미러링하게 되어 두 곳을 동기화해야 한다 |
| **런타임 해석과 무관** | 순수 TypeScript 기능이다. Node.js, Vite 등의 런타임 모듈 해석에는 영향을 주지 않는다 |
| **composite 필수** | 참조되는 프로젝트는 `"composite": true`와 `"declaration": true`가 필요하다 |

### 결론

대규모 코드베이스에서 타입체크 성능을 위해서는 여전히 필요하지만, **단독으로는 Live Types를 구현할 수 없다**. 아래 전략과 조합해서 사용해야 한다.

---

## 전략 2: publishConfig (pnpm 전용)

### 개요

개발 시에는 `.ts` 소스를 가리키고, 배포 시에는 `publishConfig`로 오버라이드한다.

```jsonc
// packages/pkg-a/package.json
{
  "name": "pkg-a",

  // 개발 환경 — .ts 소스 직접 참조
  "exports": "./src/index.ts",

  // 배포 환경 — pnpm publish 시 이 값으로 대체됨
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}
```

### 작동 원리

1. **개발 시**: 최상위 `exports`가 `./src/index.ts`를 가리킴 → TypeScript와 Vite가 소스를 직접 읽음
2. **배포 시**: `pnpm publish`가 `publishConfig`의 값으로 `exports`를 교체한 `package.json`을 패키징

### 장점

- 설정이 직관적이다
- 개발 환경에서 추가 도구가 필요 없다
- TypeScript가 `.ts` 파일에서 직접 타입을 추출할 수 있다 (`"types"` 필드 없이도)

### 한계

| 문제 | 설명 |
|---|---|
| **pnpm에 강하게 결합** | `npm publish`는 `publishConfig`로 `exports`를 오버라이드하지 않는다. `npm`은 `registry`, `tag` 같은 `.npmrc` 설정만 `publishConfig`에서 읽는다 |
| **실수 위험** | `npm publish`를 실수로 실행하면 `.ts` 파일을 가리키는 깨진 패키지가 배포된다 |
| **CI 호환성** | `JS-DevTools/npm-publish` 같은 인기 GitHub Actions는 `npm`을 사용하므로 별도 설정이 필요하다 |

---

## 전략 3: tsconfig paths

### 개요

`tsconfig.json`의 `compilerOptions.paths`로 TypeScript의 모듈 해석을 직접 오버라이드한다.

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "paths": {
      "@repo/shared": ["./packages/shared/src/index.ts"],
      "@repo/utils": ["./packages/utils/src/index.ts"]
    }
  }
}
```

### 작동 원리

- TypeScript가 `@repo/shared`를 만나면 `node_modules` 대신 `paths`에 지정된 파일을 바라본다
- 런타임에서도 같은 매핑이 필요하다:
  - **tsx**: 자동으로 `tsconfig.json`의 `paths`를 런타임 해석에 반영
  - **Vite/Vitest**: [`vite-tsconfig-paths`](https://www.npmjs.com/package/vite-tsconfig-paths) 플러그인 사용

### 장점

- 패키지 매니저에 의존하지 않는다
- 설정이 비교적 간단하다

### 한계

| 문제 | 설명 |
|---|---|
| **TypeScript 팀이 비권장** | paths는 "이미 존재하는 런타임 매핑을 TypeScript에 알려주는 것"이지, "새로운 매핑을 만드는 것"이 아님. 의도와 다른 사용이다 |
| **런타임 동기화 필수** | TypeScript paths만으로는 런타임 해석이 변하지 않는다. 별도 도구(tsx, vite-tsconfig-paths)가 필요하다 |
| **패키지가 많아지면 복잡** | 모든 패키지를 수동으로 `paths`에 등록해야 한다 |
| **subpath exports와 충돌 가능** | `@repo/shared/utils` 같은 subpath import를 paths로 관리하면 와일드카드 패턴이 복잡해진다 |

---

## 전략 4: tshy liveDev

### 개요

[tshy](https://github.com/isaacs/tshy) (TypeScript Hybridizer)의 `liveDev` 모드는 소스 파일을 `dist/` 디렉토리에 **하드 링크**한다.

```jsonc
// packages/pkg-a/package.json
{
  "tshy": {
    "liveDev": true
  }
}
```

```bash
npx tshy  # 소스를 dist/에 하드 링크
```

### 작동 원리

1. `tshy`가 `src/index.ts`를 `dist/esm/index.ts`로 하드 링크한다
2. `package.json`의 `exports`는 `dist/` 내 파일을 가리킨다
3. 하드 링크이므로 소스를 수정하면 `dist/`의 파일도 즉시 반영된다 (같은 inode)

### 장점

- 추가 `package.json` 설정이 필요 없다
- TypeScript와 런타임 모두 자연스럽게 작동한다

### 한계

| 문제 | 설명 |
|---|---|
| **초기 실행 필요** | `tshy`를 한 번은 실행해야 한다 — 빌드 스텝처럼 느껴진다 |
| **새 파일 추가 시 재실행** | 하드 링크는 파일 단위이므로, 새 `.ts` 파일을 만들면 `tshy`를 다시 실행해야 한다 |
| **tshy에 대한 의존** | npm의 창시자(Isaac Z. Schlueter)가 만든 도구지만, 생태계에서 주류는 아니다 |

---

## 전략 5: Custom Export Conditions (권장)

### 개요

`package.json`의 `exports`에 커스텀 조건(custom condition)을 정의하고, TypeScript와 Vite에 그 조건을 인식하게 설정한다.

```jsonc
// packages/shared/package.json
{
  "name": "@repo/shared",
  "exports": {
    ".": {
      "@repo/source": "./src/index.ts",   // 커스텀 조건 (첫 번째!)
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

```jsonc
// tsconfig.base.json — TypeScript에 조건 등록
{
  "compilerOptions": {
    "customConditions": ["@repo/source"]
  }
}
```

```typescript
// vite.config.ts — Vite에 조건 등록
export default {
  resolve: {
    conditions: ['@repo/source']
  }
}
```

### 작동 원리

1. **개발 시**: TypeScript와 Vite가 `@repo/source` 조건을 인식 → `./src/index.ts` 사용
2. **배포 시**: Node.js는 `@repo/source` 조건을 모름 → `"default"` 폴백으로 `./dist/index.js` 사용
3. **순서가 중요**: 커스텀 조건은 반드시 **첫 번째**에 위치해야 한다 (`"types"`보다 앞에)

### 조건 이름 짓기

Colin은 `"@colinhacks/source"` 처럼 **유니크한 이름**을 권장한다:

| 이름 | 위험도 | 이유 |
|---|---|---|
| `"source"` | **위험** | 외부 의존성도 같은 이름을 쓸 수 있다. 외부 패키지의 미빌드 소스를 참조하게 되어 에디터 성능이 저하된다 |
| `"@repo/source"` | **안전** | scoped name이므로 충돌 가능성이 거의 없다 |
| `"@colinhacks/zod"` | **안전** | 완전히 유니크 |

### 장점

| 장점 | 설명 |
|---|---|
| **깔끔함** | `exports`에 한 줄 추가, tsconfig/vite에 각 한 줄 추가면 끝 |
| **패키지 매니저 무관** | pnpm, npm, yarn 모두 동일하게 작동 |
| **Static-Runtime 일치** | TypeScript와 Vite 모두 같은 `.ts` 소스를 바라봄 |
| **배포 안전** | 커스텀 조건을 모르는 환경은 자동으로 빌드된 파일을 사용 |
| **표준 메커니즘** | Node.js의 공식 Conditional Exports 스펙 위에 구현 |

### 한계

- `customConditions`는 TypeScript 5.0+ (moduleResolution `"Bundler"` 이상) 필요
- 프로젝트의 모든 tsconfig가 이 조건을 포함해야 함 (base tsconfig에서 상속하면 해결)

---

## 전략 비교 요약

| 기준 | Project References | publishConfig | tsconfig paths | tshy liveDev | **Custom Conditions** |
|---|---|---|---|---|---|
| **Live Types** | 부분적 | O | O | O | **O** |
| **런타임 해석** | X | O | 도구 필요 | O | **O** |
| **Static-Runtime 일치** | X | O | 도구에 따라 | O | **O** |
| **패키지 매니저 제약** | 없음 | pnpm 필수 | 없음 | 없음 | **없음** |
| **추가 도구** | 없음 | 없음 | tsx/vite-tsconfig-paths | tshy | **없음** |
| **설정 복잡도** | 높음 | 중간 | 중간 | 낮음 | **낮음** |
| **배포 안전성** | N/A | npm 실수 위험 | N/A | N/A | **안전** |
| **TS 팀 입장** | 공식 기능 | 중립 | 비권장 용도 | 중립 | **공식 지원** |
| **대규모 성능** | 최적 | - | - | - | - |
| **Colin의 권장** | 조합용 | ~~이전 권장~~ | X | X | **현재 권장** |

### 최종 권장 조합

대부분의 프로젝트에서:

> **Custom Export Conditions** (전략 5)를 메인으로 사용하고,
> 대규모 코드베이스에서는 **Project References** (전략 1)를 추가로 조합한다.

---

## 다음 문서

- [01-typescript-module-resolution-background.md](./01-typescript-module-resolution-background.md) — TypeScript 모듈 해석 배경지식
- [03-applying-live-types-to-our-project.md](./03-applying-live-types-to-our-project.md) — 우리 프로젝트에의 적용
