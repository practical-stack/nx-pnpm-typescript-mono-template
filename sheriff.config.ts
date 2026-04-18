import { noDependencies, sameTag, SheriffConfig } from '@softarc/sheriff-core'

export const config: SheriffConfig = {
  enableBarrelLess: true,

  entryPoints: {
    'tanstack-sample': './apps/tanstack-sample/src/router.tsx',
    'next-sample': './apps/next-sample/src/app/page.tsx',
  },

  modules: {
    'apps/tanstack-sample/src/routes': 'app:tanstack-sample',
    'apps/next-sample/src/app': 'app:next-sample',
    'packages/sample/src': 'lib:sample',
  },

  depRules: {
    'app:*': [sameTag, 'lib:sample'],
    'lib:sample': noDependencies,
    root: ['app:tanstack-sample', 'app:next-sample', 'lib:sample', 'noTag'],
    noTag: ['noTag', 'lib:sample'],
  },
}
