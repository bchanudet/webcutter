import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideOptimus } from '@openng/optimus-ui/config';
import { appRoutes } from './app.routes';
import { WebcutterPreset } from './core/theme/webcutter-preset';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideOptimus({
      theme: {
        preset: WebcutterPreset,
      },
    }),
  ],
};
