// Learn more https://docs.expo.dev/guides/monorepo/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Surveiller tout le monorepo : les modifications dans `shared/` doivent
//    déclencher un rechargement à chaud dans l'application mobile.
config.watchFolders = [workspaceRoot];

// 2. Résoudre les modules depuis le node_modules local PUIS celui de la racine
//    (npm workspaces remonte la majorité des paquets à la racine).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Empêcher Metro de résoudre un paquet en remontant l'arborescence au-delà
//    des chemins ci-dessus, ce qui produirait des doublons de React.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
