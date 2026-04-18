# 이 템플릿의 세팅 가이드

이 폴더의 문서는 **이 레포가 어떻게 묶여 있는지**를 설명한다. 일반적인 TypeScript 모노레포 백과사전이 아니라, `apps/tanstack-sample`, `apps/next-sample`, `packages/sample` 세 워크스페이스를 어떤 결정으로 연결했는지에 대한 기록이다.

## 워크스페이스 한눈에 보기

```
nx-pnpm-typescript-mono-template/
├── apps/
│   ├── tanstack-sample/   # TanStack Start + Vite (port 3001)
│   └── next-sample/       # Next.js 16 App Router (port 3002)
├── packages/
│   └── sample/            # @repo/sample — 공유 라이브러리 (source-level exports)
├── tsconfig.base.json     # moduleResolution: Bundler + customConditions: ["@repo/source"]
├── tsconfig.json          # 루트: 모든 프로젝트의 references 묶음
├── pnpm-workspace.yaml    # packages 글롭 + catalog
├── .npmrc                 # hoist=false
└── nx.json                # 순수 태스크 러너 (target dependsOn + cache)
```

의존 그래프:

```
@repo/tanstack-sample ──→ @repo/sample
@repo/next-sample     ──→ @repo/sample
```

## 읽는 순서

| # | 파일 | 핵심 질문 |
|---|------|-----------|
| 01 | [pnpm 워크스페이스](./01-pnpm-workspace.md) | `workspace:*`, `hoist=false`, `catalog`은 각각 무엇을 보장하는가? |
| 02 | [TypeScript 모듈 해석](./02-module-resolution.md) | `moduleResolution: "Bundler"`와 `package.json#exports`는 어떻게 함께 동작하는가? |
| 03 | [Live Types — 소스 직접 참조와 빌드 산출물의 분기](./03-live-types.md) | 빌드 없이 타입이 즉시 반영되게 하는 메커니즘. 왜 `@repo/source` 커스텀 조건이 미리 깔려 있는가? |
| 04 | [Nx + tsconfig references](./04-nx-and-tsconfig-references.md) | 왜 root `tsconfig.json`이 모든 프로젝트를 `references`로 묶고, 그 위에 Nx를 얹었는가? |

## 핵심 용어

이 문서들은 두 개의 실행 시점을 일관되게 구분한다. 모든 설명에서 같은 용어를 쓴다.

| 용어 | 의미 |
|------|------|
| **로컬 실행 (local execution)** | `pnpm dev`, `tsc -b`, 에디터 — 워크스페이스 내부의 `.ts` 소스를 그대로 읽어서 동작하는 시점. |
| **번들 산출물 (build bundle)** | 패키지가 `dist/`로 빌드된 결과를 npm 등 외부에서 소비하는 시점. 이 템플릿은 아직 이 시점을 사용하지 않지만, 그쪽으로 자연스럽게 확장되도록 세팅되어 있다. |

이 두 시점을 **하나의 `package.json#exports`로 동시에 만족**시키기 위한 도구가 03 문서의 **커스텀 export 조건**이다.
