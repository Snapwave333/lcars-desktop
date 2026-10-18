import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { BACKEND, isTauri } from './core/backend';
import { DemoBackend } from './core/demo-backend';
import { TauriBackend } from './core/tauri-backend';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation(), withViewTransitions({ skipInitialTransition: true })),
    { provide: BACKEND, useFactory: () => (isTauri() ? new TauriBackend() : new DemoBackend()) },
  ],
};
