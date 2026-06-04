'use client'
import { SessionProvider } from 'next-auth/react'
import { ImportProvider } from '@/lib/ImportContext' // 👇 Importamos el nuevo contexto

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ImportProvider> {/* 👇 Envolvemos la aplicación */}
        {children}
      </ImportProvider>
    </SessionProvider>
  )
}