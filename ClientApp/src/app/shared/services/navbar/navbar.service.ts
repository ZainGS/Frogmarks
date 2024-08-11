// navbar.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})

export class NavbarService {
  private _visible = true;

  get visible(): boolean {
    return this._visible;
  }

  show() {
    this._visible = true;
  }

  hide() {
    this._visible = false;
  }
}