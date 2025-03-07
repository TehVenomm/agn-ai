import { Component, createEffect, createMemo, JSX, Show } from 'solid-js'
import { Route, Routes } from '@solidjs/router'
import NavBar from './shared/NavBar'
import Toasts from './Toasts'
import CharacterRoutes from './pages/Character'
import Settings from './pages/Settings'
import ChatDetail from './pages/Chat/ChatDetail'
import { settingStore, userStore } from './store'
import LoginPage from './pages/Login'
import ProfilePage from './pages/Profile'
import UsersPage from './pages/Admin/UsersPage'
import { InvitesPage } from './pages/Invite/InvitesPage'
import HomePage from './pages/Home'
import Navigation from './Navigation'
import GenerationPresetsPage from './pages/GenerationPresets'
import CharacterChats from './pages/Character/ChatList'
import PresetList from './pages/GenerationPresets/PresetList'
import MemoryPage from './pages/Memory'
import { EditMemoryPage } from './pages/Memory/EditMemory'
import MetricsPage from './pages/Admin/Metrics'
import './dots.css'

const App: Component = () => {
  const state = userStore()
  const cfg = settingStore()

  createEffect(() => {
    settingStore.init()
  })

  const bg = createMemo(() => {
    return {
      'background-image': state.background ? `url(${state.background})` : undefined,
      'background-repeat': 'no-repeat',
      'background-size': 'cover',
    }
  })

  return (
    <div class="scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-[var(--hl-900)] app flex flex-col justify-between">
      <NavBar />
      <div class="flex w-full grow flex-row overflow-y-hidden">
        <Navigation />
        <div class="w-full overflow-y-auto" data-background style={bg()}>
          <div class={`mx-auto h-full w-full max-w-5xl px-2 pt-2 sm:px-3 sm:pt-4`}>
            <Routes>
              <CharacterRoutes />
              <Route path="/chats" component={CharacterChats} />
              <Route path="/chat" component={ChatDetail} />
              <Route path="/chat/:id" component={ChatDetail} />
              <Route path="/" component={HomePage} />
              <Route path="/presets/:id" component={GenerationPresetsPage} />
              <Route path="/presets" component={PresetList} />
              <Route path="/profile" component={ProfilePage} />
              <Route path="/settings" component={Settings} />
              <Route path="/memory" component={MemoryPage} />
              <Route path="/memory/:id" component={EditMemoryPage} />
              <Show when={state.loggedIn}>
                <Route path="/invites" component={InvitesPage} />
                <Show when={state.user?.admin}>
                  <Route path="/admin/metrics" component={MetricsPage} />
                  <Route path="/admin/users" component={UsersPage} />
                </Show>
              </Show>
              <Show when={cfg.config.canAuth}>
                <Route path="/login" component={LoginPage} />
              </Show>
              <Route path="*" component={HomePage} />
            </Routes>
          </div>
        </div>
      </div>
      <Toasts />
    </div>
  )
}

export default App
