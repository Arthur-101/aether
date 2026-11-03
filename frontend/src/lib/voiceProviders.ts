/**
 * Cloud voice provider metadata.
 *
 * Mirrors backend/ai/voice_providers.py. Keys are not duplicated here: cloud
 * voice reuses the provider keys stored under ai_provider.cloud_providers.
 * Models and voices are voice-specific and never touch the chat model field.
 */

export type VoiceProviderId =
  | 'openai'
  | 'groq'
  | 'mistral'
  | 'gemini'
  | 'openrouter';

export interface VoiceProviderMeta {
  id: VoiceProviderId;
  label: string;
  sttModel: string;
  ttsModel: string;
  ttsVoice: string;
  sttModels: string[];
  ttsModels: string[];
  voices: string[];
}

export const VOICE_PROVIDERS: VoiceProviderMeta[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    sttModel: 'gpt-4o-transcribe',
    ttsModel: 'gpt-4o-mini-tts',
    ttsVoice: 'alloy',
    sttModels: ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'],
    ttsModels: ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd'],
    voices: [
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'fable',
      'nova',
      'onyx',
      'sage',
      'shimmer',
      'verse',
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    sttModel: 'whisper-large-v3-turbo',
    ttsModel: 'canopylabs/orpheus-v1-english',
    ttsVoice: 'troy',
    sttModels: ['whisper-large-v3-turbo', 'whisper-large-v3'],
    ttsModels: [
      'canopylabs/orpheus-v1-english',
      'canopylabs/orpheus-arabic-saudi',
    ],
    voices: ['autumn', 'diana', 'hannah', 'austin', 'daniel', 'troy'],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    sttModel: 'voxtral-mini-transcribe-3-0',
    ttsModel: 'voxtral-mini-tts-3-0',
    ttsVoice: 'en_paul_neutral',
    sttModels: ['voxtral-mini-transcribe-3-0', 'voxtral-small-transcribe-3-0'],
    ttsModels: ['voxtral-mini-tts-3-0', 'voxtral-mini-tts-realtime-3-0'],
    voices: ['en_paul_neutral'],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    sttModel: 'gemini-3.5-transcribe',
    ttsModel: 'gemini-3.8-flash-tts',
    ttsVoice: 'Kore',
    sttModels: ['gemini-3.5-transcribe'],
    ttsModels: ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'],
    voices: [
      'Zephyr',
      'Puck',
      'Charon',
      'Kore',
      'Fenrir',
      'Leda',
      'Orus',
      'Aoede',
      'Callirrhoe',
      'Autonoe',
      'Enceladus',
      'Iapetus',
      'Umbriel',
      'Algieba',
      'Despina',
      'Erinome',
      'Algenib',
      'Rasalgethi',
      'Laomedeia',
      'Achernar',
      'Alnilam',
      'Schedar',
      'Gacrux',
      'Pulcherrima',
      'Achird',
      'Zubenelgenubi',
      'Vindemiatrix',
      'Sadachbia',
      'Sadaltager',
      'Sulafat',
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    sttModel: 'openai/whisper-large-v3',
    ttsModel: 'mistralai/voxtral-mini-tts-2603',
    ttsVoice: 'en_paul_neutral',
    sttModels: [
      'openai/whisper-large-v3',
      'openai/whisper-1',
      'elevenlabs/scribe-v2',
    ],
    ttsModels: [
      'mistralai/voxtral-mini-tts-2603',
      'x-ai/grok-voice-tts-1.0',
      'microsoft/mai-voice-2',
    ],
    voices: [
      'en_paul_neutral',
      'eve',
      'ara',
      'rex',
      'sal',
      'leo',
      'en-US-Harper:MAI-Voice-2',
    ],
  },
];

export const LOCAL_VOICE_LABEL = 'Local (offline)';

export function voiceProvider(id: string): VoiceProviderMeta | undefined {
  return VOICE_PROVIDERS.find((provider) => provider.id === id);
}
