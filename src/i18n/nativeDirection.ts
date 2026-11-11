import { I18nManager } from 'react-native';

// The saved language sets layout direction in JavaScript. Turning off the
// automatic left/right swap keeps that choice from being mirrored twice.
I18nManager.allowRTL(true);
I18nManager.swapLeftAndRightInRTL(false);
