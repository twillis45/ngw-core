import { useState } from 'react';
import HomeScreen from './HomeScreen';
import ProcessingScreen from './ProcessingScreen';
import ResultScreen from './ResultScreen';
import SetupScreen from './SetupScreen';

/**
 * Day 1 Demo App
 * Simple state-based navigation between core screens:
 * Home → Processing → Result (High/Low) → Setup
 *
 * This demonstrates the atomic component system and basic user flow.
 * Useful for testing on device before integrating into main app context.
 */
export default function Day1DemoApp() {
  const [screen, setScreen] = useState('home');
  const [imageFile, setImageFile] = useState(null);
  const [resultConfidence, setResultConfidence] = useState('high');

  const handleAnalyze = (file) => {
    setImageFile(file);
    setScreen('processing');
  };

  const handleProcessingComplete = () => {
    // Randomly choose high or low confidence for demo
    setResultConfidence(Math.random() > 0.5 ? 'high' : 'low');
    setScreen('result');
  };

  const handleSetup = () => {
    setScreen('setup');
  };

  const handleSetupSave = (setupData) => {
    console.log('Setup saved:', setupData);
    // Would send to backend here
    // For now, navigate back to home
    setScreen('home');
    setImageFile(null);
  };

  const handleSetupCancel = () => {
    setScreen('home');
    setImageFile(null);
  };

  const handleRetry = () => {
    setScreen('home');
    setImageFile(null);
  };

  switch (screen) {
    case 'home':
      return <HomeScreen onAnalyze={handleAnalyze} />;
    case 'processing':
      return <ProcessingScreen imageFile={imageFile} onComplete={handleProcessingComplete} />;
    case 'result':
      return (
        <ResultScreen
          confidence={resultConfidence}
          imageFile={imageFile}
          onSetup={handleSetup}
          onRetry={handleRetry}
        />
      );
    case 'setup':
      return (
        <SetupScreen
          onSave={handleSetupSave}
          onCancel={handleSetupCancel}
        />
      );
    default:
      return <HomeScreen onAnalyze={handleAnalyze} />;
  }
}
