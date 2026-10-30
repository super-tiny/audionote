import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import App from './src/App';
import { registerPlaybackSession } from './src/playback/session';

registerPlaybackSession();
registerRootComponent(App);
