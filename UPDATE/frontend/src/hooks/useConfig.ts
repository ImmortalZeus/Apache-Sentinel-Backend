import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConfig, patchConfig } from '../api/config';
import type { ConfigPatch } from '../types/config';

export function useConfig() {
    return useQuery({
        queryKey: ['config'],
        queryFn: getConfig,
        staleTime: 30_000,   // don't refetch unless stale for 30 s
    });
}

export function useUpdateConfig() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (patch: ConfigPatch) => patchConfig(patch),
        onSuccess: (updated) => {
            // Immediately update the cache with the response from the server
            qc.setQueryData(['config'], updated);
        },
    });
}
