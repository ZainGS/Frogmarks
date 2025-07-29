// theme.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private isDarkMode = false;

  toggleDarkMode(isDark: boolean): void {
    this.isDarkMode = isDark;
    const root = document.documentElement; // or document.body if preferred
    if (this.isDarkMode) {
      root.classList.add('dark-mode');
    } else {
      root.classList.remove('dark-mode');
    }
  }

  getDarkMode(): boolean {
    return this.isDarkMode; 
  }
}