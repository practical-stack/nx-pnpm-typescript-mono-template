# 01. pnpm 워크스페이스

이 템플릿은 모노레포 도구로 `pnpm` 워크스페이스를 사용한다. Nx도 함께 쓰지만 Nx는 **태스크 러너 / 캐시**일 뿐, 패키지의 위치와 의존 관계는 전적으로 `pnpm`이 관리한다 (Nx의 역할은 [04 문서](./04-nx-and-tsconfig-references.md) 참조).

## 워크스페이스 선언

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'

catalog:
  typescript: ~6.0.3
  vitest: ^4.1.4
  react: ^19.2.5
  react-dom: ^19.2.5
  next: ^16.0.0
  # …
```

`packages` 글롭이 매칭하는 모든 디렉토리(현재는 `apps/tanstack-sample`, `apps/next-sample`, `packages/sample`)가 워크스페이스 멤버가 된다. 각 디렉토리의 `package.json#name`이 그 워크스페이스의 식별자다.

## `workspace:*` 프로토콜과 심볼릭 링크

워크스페이스 내부에서 다른 멤버를 의존성으로 쓸 때는 `workspace:*`로 선언한다.

```jsonc
// apps/tanstack-sample/package.json
{
  "dependencies": {
    "@repo/sample": "workspace:*"
  }
}
```

`pnpm install` 시점에 pnpm은 이 선언을 보고 다음과 같은 **심볼릭 링크**를 만든다.

```
apps/tanstack-sample/node_modules/@repo/sample
  → ../../packages/sample
```

링크가 생기면 TypeScript도, Vite도, Next.js도 `@repo/sample`을 일반 npm 패키지처럼 취급한다. `node_modules/@repo/sample/package.json`을 읽고 `exports` 필드를 평가한다 — 패키지 해석 알고리즘이 워크스페이스 멤버라는 사실을 따로 알 필요가 없다.

## `.npmrc` — 왜 `hoist=false`인가

```ini
# .npmrc
shamefully-hoist=false
strict-peer-dependencies=false
auto-install-peers=true
hoist=false
```

`hoist=false`가 핵심이다. pnpm의 기본은 의존성을 워크스페이스 루트의 `node_modules`로 부분 호이스팅하지만, 이 옵션을 끄면 **각 워크스페이스가 자기 `node_modules`만 본다**.

```
apps/tanstack-sample/node_modules/
  @repo/sample          → symlink
  @tanstack/react-router → 실제 패키지 (자신의 dependencies에 선언했음)
  react                  → 실제 패키지

apps/next-sample/node_modules/
  @repo/sample          → symlink
  next                   → 실제 패키지
  react                  → 실제 패키지 (별도 인스턴스)
```

이 구조가 보장하는 것:

- **Phantom dependency 차단** — `apps/next-sample`이 `package.json`에 적지 않은 `@tanstack/react-router`를 코드에서 우연히 import해도, 자기 `node_modules`에 없으므로 즉시 깨진다. 다른 워크스페이스 덕분에 잠깐 굴러가는 import가 생기지 않는다.
- **모듈 해석의 단일 진실 공급원** — 각 워크스페이스의 `package.json` + 자기 `node_modules`만 보면 된다. 상위 디렉토리를 추적할 일이 없다.

`auto-install-peers=true`는 peer 의존성을 자동 설치하도록 두는 보조 설정이다. `strict-peer-dependencies=false`는 peer 충돌을 에러가 아닌 경고로 낮춰 워크스페이스의 일상 작업을 막지 않게 한다.

## `catalog` — 버전 단일화

`pnpm-workspace.yaml`의 `catalog:` 블록에 버전을 한 번 적어두고, 각 워크스페이스의 `package.json`에서는 `catalog:` 키워드로 참조한다.

```jsonc
// apps/tanstack-sample/package.json
{
  "dependencies": {
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "vite": "catalog:",
    "typescript": "catalog:"
  }
}
```

`pnpm install`이 `catalog:`를 카탈로그 선언으로 치환하므로, 모든 워크스페이스가 같은 React/TypeScript/Vitest 버전을 쓴다는 것이 구조적으로 보장된다. 버전 업그레이드는 `pnpm-workspace.yaml` 한 곳만 수정하면 된다.

카탈로그는 모듈 해석 규칙에는 직접 영향을 주지 않는다. 하지만 모든 워크스페이스가 같은 TypeScript 버전을 쓴다는 보장이 있어야 [02 문서](./02-module-resolution.md)에서 다루는 `moduleResolution: "Bundler"`와 `customConditions` 같은 설정이 일관되게 동작한다.

## `pnpm.onlyBuiltDependencies` — 설치 시 postinstall 허용 목록

```jsonc
// package.json (root)
{
  "pnpm": {
    "onlyBuiltDependencies": [
      "esbuild",
      "nx"
    ]
  }
}
```

pnpm 10부터는 보안상 기본값으로 모든 의존성의 `postinstall` 스크립트 실행을 차단한다. 네이티브 바이너리를 받아야 하는 `esbuild`(Vite·Next 빌드에 필요)와 `nx`(데몬·플러그인 캐시 생성)만 명시적으로 허용한다. 새로운 의존성이 빌드 단계에서 native binary를 필요로 한다면 이 목록에 추가해야 한다.

## 정리

| 설정 | 보장하는 것 |
|------|-------------|
| `pnpm-workspace.yaml` `packages` | 어느 디렉토리가 워크스페이스 멤버인지 |
| `workspace:*` | 내부 패키지가 심볼릭 링크로 연결됨 → 일반 npm 패키지처럼 해석 가능 |
| `hoist=false` | 각 워크스페이스의 `node_modules`가 모듈 해석의 유일한 출처 → phantom dependency 차단 |
| `catalog:` | 모든 워크스페이스의 공통 의존성 버전이 한 곳에서 관리됨 |
| `onlyBuiltDependencies` | 신뢰하는 패키지만 설치 시 스크립트 실행 |

다음: [02. TypeScript 모듈 해석](./02-module-resolution.md)
