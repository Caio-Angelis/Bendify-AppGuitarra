import { Navigate, Outlet } from 'react-router-dom'
import { useStore } from '../store/useStore'

export default function ProtectedRoute() {
  const session = useStore((s) => s.session)
  const authHydrated = useStore((s) => s.authHydrated)

  if (!authHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212] text-[#F5F5F5]">
        <p className="font-mono text-sm text-[#F5F5F5]/70">A carregar…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
