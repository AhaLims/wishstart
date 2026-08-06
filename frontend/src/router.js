import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import Tasks from './views/Tasks.vue'
import Records from './views/Records.vue'
import Dice from './views/Dice.vue'
import Wishes from './views/Wishes.vue'
import Draw from './views/Draw.vue'
import Stats from './views/Stats.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/tasks', component: Tasks },
  { path: '/records', component: Records },
  { path: '/dice', component: Dice },
  { path: '/wishes', component: Wishes },
  { path: '/draw', component: Draw },
  { path: '/stats', component: Stats }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
