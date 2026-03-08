import { useAppState } from './context/AppContext';

import AppHeader from './components/AppHeader';
import WelcomeScreen from './screens/WelcomeScreen';
import MoodPickerScreen from './screens/MoodPickerScreen';
import EnvironmentScreen from './screens/EnvironmentScreen';
import GearInputScreen from './screens/GearInputScreen';
import LoadingScreen from './screens/LoadingScreen';
import ResultsScreen from './screens/ResultsScreen';

const SCREENS = {
  welcome:     WelcomeScreen,
  mood:        MoodPickerScreen,
  environment: EnvironmentScreen,
  gear:        GearInputScreen,
  loading:     LoadingScreen,
  results:     ResultsScreen,
};

export default function App() {
  const { screen } = useAppState();
  const Screen = SCREENS[screen] || WelcomeScreen;

  return (
    <>
      <AppHeader />
      <Screen />
    </>
  );
}
