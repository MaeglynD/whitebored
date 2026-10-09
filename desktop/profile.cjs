const path = require('node:path')
const { existsSync } = require('node:fs')

function resolveProfile(appData, exists = existsSync) {
  const current = path.join(appData, 'Whitebored')
  if (exists(path.join(current, 'IndexedDB'))) return current
  return (
    ['Folio', 'folio-canvas']
      .map((name) => path.join(appData, name))
      .find((candidate) => exists(path.join(candidate, 'IndexedDB'))) || current
  )
}

module.exports = { resolveProfile }
