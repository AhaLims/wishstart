import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import Tasks from './views/Tasks.vue'
import Records from './views/Records.vue'
import Dice from './views/Dice.vue'
import Starlight from './views/Starlight.vue'
import Wishes from './views/Wishes.vue'
import Stats from './views/Stats.vue'
import Settings from './views/Settings.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/tasks', component: Tasks },
  { path: '/records', component: Records },
  { path: '/dice', component: Dice },
  { path: '/starlight', component: Starlight },
  { path: '/wishes', component: Wishes },
  { path: '/stats', component: Stats },
  { path: '/settings', component: Settings },
  // 兜底：工作时间页删掉后，浏览器历史/收藏里还留着的 /work 会落在这里，
  // 不然匹配不到路由会渲染成一张空白页。
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
