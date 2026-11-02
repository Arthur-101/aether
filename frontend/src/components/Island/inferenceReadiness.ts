import type { AIProviderConfig, ModelStatus } from '../../types/ipc';

export type InferenceBlocker =
  | 'loading'
  | 'no_model_path'
  | 'no_api_key'
  | 'no_ollama_model'
  | 'ollama_unreachable';

export interface InferenceReadiness {
  ready: boolean;
  blocker: InferenceBlocker | null;
}

/**
 * Derives whether the active backend has a usable target.
 *
 * This is intentionally not a stored flag: the config is the source of truth,
 * so deleting a key or model path makes the setup card appear again.
 */
export function inferenceReadiness(
  ai: AIProviderConfig | null | undefined,
  status?: ModelStatus | null
): InferenceReadiness {
  if (!ai) return { ready: false, blocker: 'loading' };

  if (ai.mode === 'local_gguf') {
    return ai.gguf_model_path.trim()
      ? { ready: true, blocker: null }
      : { ready: false, blocker: 'no_model_path' };
  }

  if (ai.mode === 'cloud') {
    const key =
      ai.cloud_providers?.[ai.cloud_provider]?.api_key || ai.api_key || '';
    return key.trim()
      ? { ready: true, blocker: null }
      : { ready: false, blocker: 'no_api_key' };
  }

  if (!ai.ollama_model_name.trim()) {
    return { ready: false, blocker: 'no_ollama_model' };
  }
  if (status?.reachable === false) {
    return { ready: false, blocker: 'ollama_unreachable' };
  }
  return { ready: true, blocker: null };
}