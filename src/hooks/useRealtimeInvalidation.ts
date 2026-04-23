import { useEffect } from 'react'
import type { QueryKey, QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface UseRealtimeInvalidationInput {
  channel: string
  tables: string[]
  queryKeys: QueryKey[]
  queryClient: QueryClient
}

export function useRealtimeInvalidation({
  channel,
  tables,
  queryKeys,
  queryClient,
}: UseRealtimeInvalidationInput) {
  useEffect(() => {
    const realtimeChannel = supabase.channel(channel)

    tables.forEach((table) => {
      realtimeChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          queryKeys.forEach((queryKey) => {
            queryClient.invalidateQueries({ queryKey })
          })
        },
      )
    })

    realtimeChannel.subscribe()

    return () => {
      supabase.removeChannel(realtimeChannel)
    }
  }, [channel, tables, queryClient, queryKeys])
}
