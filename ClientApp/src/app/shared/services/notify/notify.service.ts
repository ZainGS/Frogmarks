import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root'
})
export class NotifyService {

  constructor(public notify: MatSnackBar) {  }

  // For now, these all take in the same parameters and are visually identical, but later on I want custom styling for each case.

  success(message: string = "Success!", action: string = "Dismiss") {
    this.notify.open(message, action, {
      duration: 2000,
    });
  }

  createSuccess(message: string = "Created!", action: string = "Dismiss") {
    this.notify.open(message, action, {
      duration: 2000,
    });
  }

  updateSuccess(message: string = "Updated!", action: string = "Dismiss") {
    this.notify.open(message, action, {
      duration: 2000,
    });
  }

  error(message: string = "Error :(", action: string = "Dismiss") {
    this.notify.open(message, action, {
      duration: 2000,
    });
  }
}
