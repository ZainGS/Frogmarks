import { Component, HostListener, OnInit, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-color-picker',
  standalone: false,
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss'
})
export class ColorPickerComponent implements OnInit {
  @Output() colorSelected = new EventEmitter<string>();
  hexColor: string = "#1E1E1E"; // Default color
  hue: number = 0; // Default hue
  sbX: number = 0; // Saturation (X Position)
  sbY: number = 0; // Brightness (Y Position)
  isSelecting: boolean = false; // Tracks if the user is dragging

  ngOnInit(): void {
    this.updateGradient();
  }

  // 🎨 Start color selection on click
  startColorSelection(event: MouseEvent) {
      this.isSelecting = true;
      this.updateColorFromEvent(event);
  }

  // 🖱️ Update color on drag
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
      if (this.isSelecting) {
          this.updateColorFromEvent(event);
      }
  }

  // 🛑 Stop selecting when mouse is released
  @HostListener('document:mouseup')
  onMouseUp() {
      this.isSelecting = false;
  }

  // 🎨 Update color based on cursor position inside SB gradient
  updateColorFromEvent(event: MouseEvent) {
      const gradient = document.querySelector(".color-gradient") as HTMLDivElement;
      if (!gradient) return;
      
      const rect = gradient.getBoundingClientRect();
      let x = ((event.clientX - rect.left) / rect.width) * 100;
      let y = ((event.clientY - rect.top) / rect.height) * 100;

      // Clamp values within the gradient box
      this.sbX = Math.max(0, Math.min(x, 100));
      this.sbY = Math.max(0, Math.min(y, 100));

      this.updateColor();
  }

  // 🔄 Updates the selected color (HSL → HEX)
  updateColor() {
    const saturation = this.sbX;  // X-axis controls saturation
    const L_left = 100 - this.sbY;  // Max Lightness at the left edge
    const L_right = (100 - this.sbY) / 2;  // Half Lightness at the right edge
    const lightness = L_left - (this.sbX / 100) * (L_left - L_right); // Linearly interpolate

    this.hexColor = this.hslToHex(this.hue, saturation, lightness);
    this.colorSelected.emit(this.hexColor);
}


  // 🔄 Updates SB Gradient when Hue changes
  updateGradient() {
      document.documentElement.style.setProperty('--hue', this.hue.toString());
      this.updateColor();
  }

  // 🔄 Updates HSL values from HEX input
  updateFromHex() {
      const hsl = this.hexToHSL(this.hexColor);
      this.hue = hsl.h;
      this.sbX = hsl.s;
      this.sbY = 100 - hsl.l; // Reverse lightness axis
      this.updateGradient();
  }

  // 🎨 Convert HSL to HEX
  hslToHex(h: number, s: number, l: number): string {
      s /= 100;
      l /= 100;
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = l - c / 2;
      let r = 0, g = 0, b = 0;

      if (h < 60) { r = c, g = x, b = 0; }
      else if (h < 120) { r = x, g = c, b = 0; }
      else if (h < 180) { r = 0, g = c, b = x; }
      else if (h < 240) { r = 0, g = x, b = c; }
      else if (h < 300) { r = x, g = 0, b = c; }
      else { r = c, g = 0, b = x; }

      return `#${((1 << 24) + (Math.round((r + m) * 255) << 16) + (Math.round((g + m) * 255) << 8) + Math.round((b + m) * 255)).toString(16).slice(1).toUpperCase()}`;
  }

  // 🎨 Convert HEX to HSL
  hexToHSL(hex: string): { h: number, s: number, l: number } {
      let r = parseInt(hex.substring(1, 3), 16) / 255;
      let g = parseInt(hex.substring(3, 5), 16) / 255;
      let b = parseInt(hex.substring(5, 7), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;

      if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
              case r: h = (g - b) / d + (g < b ? 6 : 0); break;
              case g: h = (b - r) / d + 2; break;
              case b: h = (r - g) / d + 4; break;
          }
          h *= 60;
      }
      return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

    // openEyedropper() {
    //     if (!window.Eyedropper) {
    //         alert("Eyedropper API not supported");
    //         return;
    //     }
    //     const eyeDropper = new EyeDropper();
    //     eyeDropper.open().then(result => {
    //         this.hexColor = result.sRGBHex;
    //     });
    // }

    openEyedropper() {
      if (!(window as any).Eyedropper) {
          alert("Eyedropper API not supported in this browser.");
          return;
      }
      const eyeDropper = new (window as any).Eyedropper();
      eyeDropper.open().then((result: { sRGBHex: string }) => {
          this.hexColor = result.sRGBHex;
      });
  }
}
