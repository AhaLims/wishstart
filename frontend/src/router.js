import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import Tasks from './views/Tasks.vue'
import Records from './views/Records.vue'
import Dice from './views/Dice.vue'
import Starlight from './views/Starlight.vue'
import Wishes from './views/Wishes.vue'
import Draw from './views/Draw.vue'
import Stats from './views/Stats.vue'
import Work from './views/Work.vue'
import Settings from './views/Settings.vue'
import { isDesktop } from './utils/env'

const routes = [
  { path: '/', component: Home },
  { path: '/tasks', component: Tasks },
  { path: '/records', component: Records },
  { path: '/dice', component: Dice },
  { path: '/starlight', component: Starlight },
  { path: '/wishes', component: Wishes },
  { path: '/draw', component: Draw },
  { path: '/stats', component: Stats },
  { path: '/work', component: Work },
  { path: '/settings', component: Settings }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 计时功能仅桌面端使用
router.beforeEach((to, from, next) => {
  if (to.path === '/work' && !isDesktop()) {
    next('/')
  } else {
    next()
  }
})

export default router
