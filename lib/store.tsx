'use client'

import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'
import { Entry, AgentStatus, AgentPhase } from './types'
import { fetchEntries } from './insforge-db'
import { useAuth } from './auth'

interface AppState {
  entries: Entry[]
  currentDraft: Entry | null
  agentStatus: AgentStatus
  isProcessing: boolean
}

type Action =
  | { type: 'SET_AGENT_STATUS'; agent: keyof AgentStatus; phase: AgentPhase }
  | { type: 'SET_DRAFT'; draft: Entry | null }
  | { type: 'APPROVE_ENTRY'; entry: Entry }
  | { type: 'UPDATE_ENTRY'; entry: Entry }
  | { type: 'RESET_AGENTS' }
  | { type: 'SET_PROCESSING'; value: boolean }
  | { type: 'SET_ENTRIES'; entries: Entry[] }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_AGENT_STATUS':
      return {
        ...state,
        agentStatus: { ...state.agentStatus, [action.agent]: action.phase },
      }
    case 'SET_DRAFT':
      return { ...state, currentDraft: action.draft }
    case 'APPROVE_ENTRY': {
      const entry = { ...action.entry, updatedAt: new Date().toISOString() }
      const exists = state.entries.some(e => e.id === entry.id)
      return {
        ...state,
        entries: exists ? state.entries : [entry, ...state.entries],
        currentDraft: null,
      }
    }
    case 'SET_ENTRIES':
      return { ...state, entries: action.entries }
    case 'UPDATE_ENTRY': {
      return {
        ...state,
        entries: state.entries.map(e =>
          e.id === action.entry.id ? action.entry : e,
        ),
      }
    }
    case 'RESET_AGENTS':
      return {
        ...state,
        agentStatus: { hts: 'idle', duty: 'idle', compliance: 'idle', entry: 'idle' },
        currentDraft: null,
        isProcessing: false,
      }
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.value }
    default:
      return state
  }
}

const initialState: AppState = {
  entries: [],
  currentDraft: null,
  agentStatus: { hts: 'idle', duty: 'idle', compliance: 'idle', entry: 'idle' },
  isProcessing: false,
}

const StoreContext = createContext<{
  state: AppState
  dispatch: React.Dispatch<Action>
} | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { user, loading: authLoading } = useAuth()

  // Load entries only after auth resolves — RLS scopes to workspace
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      dispatch({ type: 'SET_ENTRIES', entries: [] })
      return
    }
    fetchEntries().then(entries => {
      dispatch({ type: 'SET_ENTRIES', entries })
    })
  }, [authLoading, user])

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
