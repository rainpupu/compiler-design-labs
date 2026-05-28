import { createApp } from 'vue'
import App from './AppI18n.vue'
import './style.css'
import './lr0-style.css'
import './slr1-style.css'
import { installSLR1Lab } from './lab4-patch.js'

createApp(App).mount('#app')
installSLR1Lab()
