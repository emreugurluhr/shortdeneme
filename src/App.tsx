import React, { useState } from 'react';
import Header from './components/Header';
import TabNavigation from './components/TabNavigation';
import ImageCarousel from './components/ImageCarousel';
import OptionsForm from './components/OptionsForm';
import ScriptInput from './components/ScriptInput';
import PreviewSections from './components/PreviewSections';
import { generateVoice } from './utils/elevenlabs';

const images = [
  {
    src: 'https://images.unsplash.com/photo-1535016120720-40c646be5580?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=300&h=300&q=80',
    alt: 'Action Movie',
  },
  {
    src: 'https://images.unsplash.com/photo-1520034475321-cbe63696469a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=300&h=300&q=80',
    alt: 'Ancient Fairytale',
  },
  {
    src: 'https://images.unsplash.com/photo-1534732806146-b3bf32171b48?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=300&h=300&q=80',
    alt: 'Animated Cartoon',
  },
  {
    src: 'https://images.unsplash.com/photo-1500462918059-b1a0cb512f1d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=300&h=300&q=80',
    alt: 'Animated Fantasy',
  },
  {
    src: 'https://images.unsplash.com/photo-1519340241574-2cec6aef0c01?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=300&h=300&q=80',
    alt: 'Art Deco',
  },
  {
    src: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=300&h=300&q=80',
    alt: 'Old Camera',
  },
];

function App() {
  const [activeTab] = useState('AI Visuals');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [showPreviews, setShowPreviews] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [script, setScript] = useState('');
  const [generationComplete, setGenerationComplete] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState(
    'EXAVITQu4vr4xnSDxMaL'
  );

  const handleStyleSelect = (style: string) => {
    setSelectedStyle(style);
  };

  const handleGenerateVideo = async () => {
    if (!script.trim()) {
      alert('Please generate or write a script first.');
      return;
    }

    setIsGenerating(true);
    setGenerationComplete(false);
    setShowPreviews(false);

    try {
      const generatedAudioUrl = await generateVoice(script, selectedVoiceId);
      setAudioUrl(generatedAudioUrl);
      setGenerationComplete(true);
      setShowPreviews(true);
    } catch (error) {
      console.error('Error generating voice:', error);
      alert('Failed to generate voice. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="container mx-auto p-4">
        <TabNavigation activeTab={activeTab} onTabChange={() => {}} />
        <div className="mt-4">
          <ImageCarousel
            images={images}
            selectedStyle={selectedStyle}
            onStyleSelect={handleStyleSelect}
          />
        </div>
        <div className="mt-8 space-y-8">
          <OptionsForm onVoiceChange={setSelectedVoiceId} />
          <ScriptInput onScriptChange={setScript} />
          <div>
            <button
              className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition duration-300 text-lg font-semibold disabled:bg-blue-400 disabled:cursor-not-allowed"
              onClick={handleGenerateVideo}
              disabled={isGenerating || !script.trim()}
            >
              {isGenerating ? 'Generating...' : 'Generate Video'}
            </button>
          </div>
          {showPreviews && generationComplete && (
            <PreviewSections
              script={script}
              audioUrl={audioUrl}
              isGenerating={isGenerating}
              selectedStyle={selectedStyle}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
