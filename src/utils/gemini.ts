import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Language } from '../contexts/LanguageContext';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const languageNames = {
  en: 'English',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  es: 'Spanish',
  cs: 'Czech',
  da: 'Danish',
  nl: 'Dutch',
  fi: 'Finnish',
  id: 'Indonesian',
  pl: 'Polish',
  pt: 'Portuguese',
  sv: 'Swedish',
  tr: 'Turkish',
  vi: 'Vietnamese',
  hu: 'Hungarian',
  fil: 'Filipino',
  el: 'Greek',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  hi: 'Hindi',
  zh: 'Chinese',
  ar: 'Arabic',
  fa: 'Persian',
};

const basePrompt = `Act as a script writer who writes informative and engaging stories. Your scripts should have these characteristics:

1. Start with an attention-grabbing, intriguing opening sentence.
2. Include informative details about the topic.
3. Present information in a storytelling format, not just dry facts.
4. Maintain viewer interest with smooth flow.
5. End with a thought-provoking question or idea.
6. Appropriately invite viewers to like and subscribe, but don't overdo it.
7. DO NOT include headers like INTRO, BODY, CONCLUSION.
8. Text must not exceed 400 characters.`;

export async function generateImagePrompt(script: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `Given this script:
    "${script}"
    
    Create a detailed image generation prompt that captures the main theme and visual elements of this script.
    The prompt should be descriptive and focus on visual elements, atmosphere, and style.
    Keep it under 200 characters.
    DO NOT include technical terms like "4k", "HD", "high quality" etc.
    Focus on the scene, subjects, actions, colors, and mood.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating image prompt:', error);
    return script;
  }
}

export async function generateScript(
  theme: string,
  language: Language = 'en'
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `You are writing a script in ${languageNames[language]}. 
The response MUST be in ${languageNames[language]} language only.

${basePrompt}

Write the script about this topic: "${theme}"

Remember: The ENTIRE response must be in ${languageNames[language]} language.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating script:', error);
    return 'An error occurred while generating the script. Please try again.';
  }
}
