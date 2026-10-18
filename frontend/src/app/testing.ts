import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withHashLocation } from '@angular/router';

import { routes } from './app.routes';
import { BACKEND } from './core/backend';
import { DemoBackend } from './core/demo-backend';

export function setupTestBed(imports: unknown[] = []) {
  localStorage.clear();
  const backend = new DemoBackend();
  TestBed.configureTestingModule({
    imports,
    providers: [
      provideZonelessChangeDetection(),
      provideRouter(routes, withHashLocation()),
      { provide: BACKEND, useValue: backend },
    ],
  });
  return backend;
}

export const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
