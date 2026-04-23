// Metro config for Jumix mobile in pnpm monorepo (M1).
// watchFolders — весь workspace, чтобы Metro видел `packages/shared`.
// nodeModulesPaths — сначала local, затем hoisted workspace root.
// disableHierarchicalLookup — устраняет дубликаты React из hoisted deps.

const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.disableHierarchicalLookup = true

module.exports = config
