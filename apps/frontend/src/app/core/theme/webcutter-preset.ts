import { definePreset } from '@openng/optimus-ui-themes';
import Aura from '@openng/optimus-ui-themes/aura';

/**
 * Aura preset with the primary color ramp replaced by one anchored on #FF7300
 * (500 step = exact hex, same hue/saturation carried through 50-950).
 */
export const WebcutterPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#FFF7F0',
      100: '#FFEBDB',
      200: '#FFD5B2',
      300: '#FFB67A',
      400: '#FF953D',
      500: '#FF7300',
      600: '#D66100',
      700: '#AD4E00',
      800: '#8A3E00',
      900: '#6B3000',
      950: '#472000',
    },
  },
});
