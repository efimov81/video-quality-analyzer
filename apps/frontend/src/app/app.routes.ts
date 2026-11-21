import type { Routes } from '@angular/router';
import { requireGuest, requireSession } from './core/auth/session.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'videos' },
  {
    path: 'login', canActivate: [requireGuest],
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'videos', canActivate: [requireSession],
    loadComponent: () => import('./features/videos/videos.component').then((m) => m.VideosComponent),
  },
  {
    path: 'profile', canActivate: [requireSession],
    loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'profiles', canActivate: [requireSession],
    loadComponent: () => import('./features/profiles/profiles.component').then((m) => m.ProfilesComponent),
  },
  {
    path: 'users', canActivate: [requireSession],
    loadComponent: () => import('./features/users/users.component').then((m) => m.UsersComponent),
  },
  {
    path: 'forbidden', canActivate: [requireSession],
    loadComponent: () => import('./features/users/forbidden.component').then((m) => m.ForbiddenComponent),
  },
  { path: '**', redirectTo: 'videos' },
];
