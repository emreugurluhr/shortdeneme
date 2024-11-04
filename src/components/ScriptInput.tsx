import React, { useState, useEffect } from 'react';
import { Wand2 } from 'lucide-react';
import { generateScript } from '../utils/gemini';
import { useLanguage } from '../contexts/LanguageContext';

interface ScriptInputProps {
  onScriptChange: (script: string) => void;
}

const ScriptInput: React.FC<ScriptInputProps> = ({ onScriptChange }) => {
  const [showWizard, setShowWizard] = useState(false);
  const [wizardScript, setWizardScript] = useState('');
  const [mainScript, setMainScript] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { language } = useLanguage();

  // Clear the script when language changes
  useEffect(() => {
    setMainScript('');
    setWizardScript('');
    onScriptChange('');
  }, [language, onScriptChange]);

  const handleGenerateScript = async () => {
    setIsGenerating(true);
    try {
      console.log('Generating script in language:', language); // Debug log
      const generatedScript = await generateScript(wizardScript, language);
      setMainScript(generatedScript);
      onScriptChange(generatedScript);
    } catch (error) {
      console.error('Failed to generate script:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMainScriptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setMainScript(e.target.value);
    onScriptChange(e.target.value);
  };

  const getPlaceholderText = () => {
    return language === 'tr'
      ? 'Video senaryosunu yazın.'
      : 'Write the video script.';
  };

  const getWizardPlaceholderText = () => {
    return language === 'tr'
      ? 'Mısır medeniyetinin etkileyici yenilikleri ve başarıları hakkında bir video senaryosu yazın.'
      : 'Write a video script about the impressive innovations and achievements of the Egyptian civilization.';
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Script</h2>
          <button
            className="flex items-center bg-purple-600 text-white px-3 py-1 rounded-md text-sm hover:bg-purple-700 transition duration-300"
            onClick={() => setShowWizard(!showWizard)}
          >
            <Wand2 className="w-4 h-4 mr-1" />
            AI Script Assistant
          </button>
        </div>
        <textarea
          className="w-full h-32 p-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder={getPlaceholderText()}
          value={mainScript}
          onChange={handleMainScriptChange}
        ></textarea>
        <div className="flex justify-between text-sm text-gray-500">
          <span>{mainScript.length} / 500</span>
          <div>
            <span className="mr-2">
              Estimated video length: {Math.round(mainScript.length / 15)}{' '}
              seconds
            </span>
            <span>Estimated Credits: {Math.ceil(mainScript.length / 100)}</span>
          </div>
        </div>
      </div>

      {showWizard && (
        <div className="space-y-2">
          <h3 className="text-md font-semibold">Wizard Script</h3>
          <textarea
            className="w-full h-24 p-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder={getWizardPlaceholderText()}
            value={wizardScript}
            onChange={(e) => setWizardScript(e.target.value)}
          ></textarea>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">
              {wizardScript.length} / 500
            </span>
            <button
              className={`bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 transition duration-300 disabled:bg-blue-400 flex items-center ${
                isGenerating ? 'cursor-not-allowed' : ''
              }`}
              onClick={handleGenerateScript}
              disabled={!wizardScript.trim() || isGenerating}
            >
              {isGenerating ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {language === 'tr' ? 'Oluşturuluyor...' : 'Generating...'}
                </>
              ) : language === 'tr' ? (
                'Senaryo Oluştur'
              ) : (
                'Generate Script'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScriptInput;
