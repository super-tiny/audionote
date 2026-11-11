import 'react-native-gesture-handler';
import './src/i18n/nativeDirection';
import { registerRootComponent } from 'expo';

import App from './src/App';
import { registerPlaybackSession } from './src/playback/session';

registerPlaybackSession();
registerRootComponent(App);
