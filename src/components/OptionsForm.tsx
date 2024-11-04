import React from 'react';
import { ChevronDown, User } from 'lucide-react';
import { useLanguage, Language } from '../contexts/LanguageContext';

interface Voice {
  voice_id: string;
  name: string;
  labels: {
    accent: string;
    description: string;
    gender: string;
  };
}

interface OptionsFormProps {
  onVoiceChange: (voiceId: string) => void;
}

const languages: { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'es', name: 'Spanish' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'fi', name: 'Finnish' },
  { code: 'id', name: 'Indonesian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'sv', name: 'Swedish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'fil', name: 'Filipino' },
  { code: 'el', name: 'Greek' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'hi', name: 'Hindi' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'fa', name: 'Persian' },
];

const voices: Voice[] = [
  {
    voice_id: '9BWtsMINqrJLrRacOk9x',
    name: 'Aria',
    labels: {
      accent: 'American',
      description: 'expressive',
      gender: 'female',
    },
  },
  {
    voice_id: 'CwhRBWXzGAHq8TQ4Fs17',
    name: 'Roger',
    labels: {
      accent: 'American',
      description: 'confident',
      gender: 'male',
    },
  },
  {
    voice_id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah',
    labels: {
      accent: 'american',
      description: 'soft',
      gender: 'female',
    },
  },
  {
    voice_id: 'FGY2WhTYpPnrIDTdsKH5',
    name: 'Laura',
    labels: {
      accent: 'American',
      description: 'upbeat',
      gender: 'female',
    },
  },
  {
    voice_id: 'IKne3meq5aSn9XLyUdCD',
    name: 'Charlie',
    labels: {
      accent: 'Australian',
      description: 'natural',
      gender: 'male',
    },
  },
  {
    voice_id: 'JBFqnCBsd6RMkjVDRZzb',
    name: 'George',
    labels: {
      accent: 'British',
      description: 'warm',
      gender: 'male',
    },
  },
  {
    voice_id: 'N2lVS1w4EtoT3dr4eOWO',
    name: 'Callum',
    labels: {
      accent: 'Transatlantic',
      description: 'intense',
      gender: 'male',
    },
  },
  {
    voice_id: 'SAz9YHcvj6GT2YYXdXww',
    name: 'River',
    labels: {
      accent: 'American',
      description: 'confident',
      gender: 'non-binary',
    },
  },
  {
    voice_id: 'TX3LPaxmHKxFdv7VOQHJ',
    name: 'Liam',
    labels: {
      accent: 'American',
      description: 'articulate',
      gender: 'male',
    },
  },
  {
    voice_id: 'XB0fDUnXU5powFXDhCwa',
    name: 'Charlotte',
    labels: {
      accent: 'Swedish',
      description: 'seductive',
      gender: 'female',
    },
  },
  {
    voice_id: 'Xb7hH8MSUJpSbSDYk0k2',
    name: 'Alice',
    labels: {
      accent: 'British',
      description: 'confident',
      gender: 'female',
    },
  },
  {
    voice_id: 'XrExE9yKIg1WjnnlVkGX',
    name: 'Matilda',
    labels: {
      accent: 'American',
      description: 'friendly',
      gender: 'female',
    },
  },
  {
    voice_id: 'bIHbv24MWmeRgasZH58o',
    name: 'Will',
    labels: {
      accent: 'American',
      description: 'friendly',
      gender: 'male',
    },
  },
  {
    voice_id: 'cgSgspJ2msm6clMCkdW9',
    name: 'Jessica',
    labels: {
      accent: 'American',
      description: 'expressive',
      gender: 'female',
    },
  },
  {
    voice_id: 'cjVigY5qzO86Huf0OWal',
    name: 'Eric',
    labels: {
      accent: 'American',
      description: 'friendly',
      gender: 'male',
    },
  },
  {
    voice_id: 'iP95p4xoKVk53GoZ742B',
    name: 'Chris',
    labels: {
      accent: 'American',
      description: 'casual',
      gender: 'male',
    },
  },
  {
    voice_id: 'nPczCjzI2devNBz1zQrb',
    name: 'Brian',
    labels: {
      accent: 'American',
      description: 'deep',
      gender: 'male',
    },
  },
  {
    voice_id: 'onwK4e9ZLuTAKqWW03F9',
    name: 'Daniel',
    labels: {
      accent: 'British',
      description: 'authoritative',
      gender: 'male',
    },
  },
  {
    voice_id: 'pFZP5JQG7iQjIQuC4Bku',
    name: 'Lily',
    labels: {
      accent: 'British',
      description: 'warm',
      gender: 'female',
    },
  },
  {
    voice_id: 'pqHfZKP75CvOlQylNhV4',
    name: 'Bill',
    labels: {
      accent: 'American',
      description: 'trustworthy',
      gender: 'male',
    },
  },
];

const OptionsForm: React.FC<OptionsFormProps> = ({ onVoiceChange }) => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Language
        </label>
        <div className="relative">
          <select
            className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 sm:text-sm rounded-md appearance-none"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Subtitle
        </label>
        <div className="relative">
          <select className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 sm:text-sm rounded-md appearance-none">
            <option>WHIMSY</option>
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Voices
        </label>
        <div className="relative">
          <select
            className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 sm:text-sm rounded-md appearance-none"
            onChange={(e) => onVoiceChange(e.target.value)}
            defaultValue={voices[0].voice_id}
          >
            {voices.map((voice) => (
              <option key={voice.voice_id} value={voice.voice_id}>
                {voice.name} ({voice.labels.description}, {voice.labels.accent})
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
            <User className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Video Length
        </label>
        <div className="relative">
          <select className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 sm:text-sm rounded-md appearance-none">
            <option>&lt; 1 Minute</option>
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default OptionsForm;
