import { Injectable } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig, MatSnackBarRef, TextOnlySnackBar } from '@angular/material/snack-bar';

export type ToastKind = 'success' | 'error';

/** How long each kind of toast stays up. An error stays much longer than a confirmation: the user has to read it and
 *  maybe act on it (it used to vanish after 2 s, faster than a success). */
export const TOAST_DURATION_MS: Readonly<Record<ToastKind, number>> = { success: 3000, error: 8000 };

/** The snackbar config for one kind of toast: its own panel class (the look lives in styles.scss, "Toasts"), its
 *  duration, and how a screen reader announces it (errors interrupt, confirmations wait). */
export function toastConfig(kind: ToastKind, durationMs = TOAST_DURATION_MS[kind]): MatSnackBarConfig {
  return {
    duration: durationMs,
    panelClass: ['fm-toast', `fm-toast--${kind}`],
    politeness: kind === 'error' ? 'assertive' : 'polite',
  };
}

@Injectable({
  providedIn: 'root'
})
export class NotifyService {

  constructor(public notify: MatSnackBar) {  }

  success(message: string = "Success!", action: string = "Dismiss"): MatSnackBarRef<TextOnlySnackBar> {
    return this.notify.open(message, action, toastConfig('success', 5000));
  }

  createSuccess(message: string = "Created!", action: string = "Dismiss"): MatSnackBarRef<TextOnlySnackBar> {
    return this.notify.open(message, action, toastConfig('success', 2000));
  }

  updateSuccess(message: string = "Updated!", action: string = "Dismiss"): MatSnackBarRef<TextOnlySnackBar> {
    return this.notify.open(message, action, toastConfig('success', 2000));
  }

  /** An error toast: red, stays 8 s, announced assertively. With an action other than "Dismiss" (e.g. "Retry"), the
   *  caller can react through the returned ref's onAction(). */
  error(message: string = "Something went wrong.", action: string = "Dismiss"): MatSnackBarRef<TextOnlySnackBar> {
    return this.notify.open(message, action, toastConfig('error'));
  }
}
