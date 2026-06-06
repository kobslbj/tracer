'use client'

import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'
import { Entry, AgentStatus, AgentPhase } from './types'
import { fetchEntries } from './insforge-db'

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
  | { type: 'TICK_STATUS'; id: string }
  | { type: 'RESET_AGENTS' }
  | { type: 'SET_PROCESSING'; value: boolean }
  | { type: 'SET_ENTRIES'; entries: Entry[] }

const statusOrder = ['Draft', 'Review', 'Filing', 'Cleared'] as const

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
      const entry = { ...action.entry, status: 'Review' as const, updatedAt: new Date().toISOString() }
      // Avoid duplicates if realtime already pushed it
      const exists = state.entries.some(e => e.id === entry.id)
      return {
        ...state,
        entries: exists ? state.entries : [entry, ...state.entries],
        currentDraft: null,
      }
    }
    case 'SET_ENTRIES':
      return { ...state, entries: action.entries }
    case 'TICK_STATUS': {
      return {
        ...state,
        entries: state.entries.map(e => {
          if (e.id !== action.id) return e
          const idx = statusOrder.indexOf(e.status)
          if (idx === -1 || idx >= statusOrder.length - 1) return e
          return { ...e, status: statusOrder[idx + 1], updatedAt: new Date().toISOString() }
        }),
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

  // Bootstrap: load entries from InsForge on mount
  useEffect(() => {
    fetchEntries().then(entries => {
      if (entries.length > 0) dispatch({ type: 'SET_ENTRIES', entries })
    })
  }, [])

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
