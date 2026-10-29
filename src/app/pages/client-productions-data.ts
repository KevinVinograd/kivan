import { useQuery } from '@tanstack/react-query'

import { monthlyApi } from '@/api/monthly'
import { queryKeys } from '@/queries/keys'
import { productionFromDto } from './monthly-operation-api-data'

export function useClientProductions(clientId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.clients.productions(clientId),
    queryFn: async () => (await monthlyApi.listClientProductions(clientId)).map(productionFromDto),
    enabled,
    staleTime: 0,
  })
}
