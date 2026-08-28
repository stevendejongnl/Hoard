import './styles/vars.css'
import './components/printer-app'
import { sseClient } from './sse'
import { registerServiceWorker } from './notifications'

sseClient.connect()
registerServiceWorker()
