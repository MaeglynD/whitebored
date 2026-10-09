import 'fake-indexeddb/auto'
import { vi } from 'vitest'
vi.stubGlobal('window', new EventTarget())
