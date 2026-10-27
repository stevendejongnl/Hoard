import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './styles/design-tokens.css'
import './styles/components.css'
import './styles/shell.css'
import { createAccentTheme } from './accent-theme'
import './components/printer-app'
import { sseClient } from './sse'
import { registerServiceWorker } from './notifications'

createAccentTheme({ storage: window.localStorage, rootElement: document.documentElement }).restoreAccentColor()
sseClient.connect()
registerServiceWorker()
