'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { insforge } from './insforge'

interface AuthUser {
  id: string
  email: string
  name?: string
}

interface AuthContextValue {
  user: AuthUser | null
  workspaceId: string | null
  workspaceName: string | null
  loading: boolean
  signInWithGoogle: () => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchWorkspace(userId: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await insforge.database
    .from('workspace_members')
    .select('workspace_id, workspaces(id, name)')
    .eq('user_id', userId)
    .limit(1)

  if (error || !data?.length) return null

  const row = data[0] as {
    workspace_id: string
    workspaces: { id: string; name: string } | { id: string; name: string }[] | null
  }

  const ws = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces
  if (ws?.id && ws?.name) return { id: ws.id, name: ws.name }

  return row.workspace_id ? { id: row.workspace_id, name: 'Workspace' } : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const hydrate = useCallback(async () => {
    const { data, error } = await insforge.auth.getCurrentUser()
    if (error || !data?.user) {
      setUser(null)
      setWorkspaceId(null)
      setWorkspaceName(null)
      setLoading(false)
      return
    }

    const u = data.user
    setUser({
      id: u.id,
      email: u.email ?? '',
      name: (u as { name?: string }).name,
    })

    const ws = await fetchWorkspace(u.id)
    setWorkspaceId(ws?.id ?? null)
    setWorkspaceName(ws?.name ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await hydrate()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [hydrate])

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = `${window.location.origin}/intake`
    const { error } = await insforge.auth.signInWithOAuth('google', { redirectTo })
    if (error) return { error: error.message }
    return {}
  }, [])

  const signOut = useCallback(async () => {
    await insforge.auth.signOut()
    setUser(null)
    setWorkspaceId(null)
    setWorkspaceName(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, workspaceId, workspaceName, loading, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
