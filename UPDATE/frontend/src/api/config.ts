import { api } from './client';
import type { LiveConfig, ConfigPatch } from '../types/config';

export const getConfig = async (): Promise<LiveConfig> => {
    const { data } = await api.get<LiveConfig>('/api/config');
    return data;
};

export const patchConfig = async (patch: ConfigPatch): Promise<LiveConfig> => {
    const { data } = await api.patch<LiveConfig>('/api/config', patch);
    return data;
};
