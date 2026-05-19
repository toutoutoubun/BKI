import { invoke } from '@tauri-apps/api/core';

const LOCAL_STORAGE_KEY = 'bki.analysisConfigs';

export interface AnalysisConfigRecord<TConfig = Record<string, unknown>> {
  id: string;
  type: string;
  name: string;
  config: TConfig;
  created_at?: string;
}

interface ConfigResponse<TConfig> {
  ok?: boolean;
  error?: string;
  path?: string;
  config?: AnalysisConfigRecord<TConfig>;
  configs?: Array<AnalysisConfigRecord<TConfig>>;
}

function localConfigs<TConfig>() {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) return [] as Array<AnalysisConfigRecord<TConfig>>;
  try {
    return JSON.parse(raw) as Array<AnalysisConfigRecord<TConfig>>;
  } catch {
    return [] as Array<AnalysisConfigRecord<TConfig>>;
  }
}

function saveLocalConfigs(configs: Array<AnalysisConfigRecord>) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(configs));
}

export async function listAnalysisConfigs<TConfig>(type: string): Promise<Array<AnalysisConfigRecord<TConfig>>> {
  try {
    const response = await invoke<ConfigResponse<TConfig>>('run_python', {
      command: 'list_analysis_configs',
      payload: { type },
    });
    if (response.error) throw new Error(response.error);
    return response.configs ?? [];
  } catch {
    return localConfigs<TConfig>().filter((config) => config.type === type);
  }
}

export async function saveAnalysisConfig<TConfig>(type: string, name: string, config: TConfig, id?: string): Promise<AnalysisConfigRecord<TConfig>> {
  try {
    const response = await invoke<ConfigResponse<TConfig>>('run_python', {
      command: 'save_analysis_config',
      payload: { type, name, config, id },
    });
    if (response.error) throw new Error(response.error);
    if (!response.config) throw new Error('No analysis config returned.');
    return response.config;
  } catch {
    const configs = localConfigs<TConfig>().filter((item) => item.id !== id);
    const record: AnalysisConfigRecord<TConfig> = {
      id: id || `${type}:${crypto.randomUUID?.() ?? Date.now()}`,
      type,
      name: name.trim() || 'Untitled preset',
      config,
      created_at: new Date().toISOString(),
    };
    saveLocalConfigs([...configs, record] as Array<AnalysisConfigRecord>);
    return record;
  }
}

export async function deleteAnalysisConfig(id: string): Promise<void> {
  try {
    const response = await invoke<ConfigResponse<unknown>>('run_python', {
      command: 'delete_analysis_config',
      payload: { id },
    });
    if (response.error) throw new Error(response.error);
  } catch {
    saveLocalConfigs(localConfigs<Record<string, unknown>>().filter((config) => config.id !== id));
  }
}
