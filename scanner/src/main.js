import { createApp } from 'vue'
import App from './AppI18n.vue'
import './style.css'
import './lr0-style.css'
import './slr1-style.css'
import './lab56-style.css'
import './pipeline-style.css'
import { installSLR1Lab } from './lab4-patch.js'
import { installLab56 } from './lab56-patch.js'
import { installPipelineLab } from './pipeline-patch.js'

createApp(App).mount('#app')
installSLR1Lab()
installLab56()
installPipelineLab()
