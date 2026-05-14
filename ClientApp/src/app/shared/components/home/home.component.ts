import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { LocalIllustrationService } from '../../services/illustrate/local-illustration.service';

interface HomeParticle {
  shape: 'circle' | 'square' | 'triangle';
  size:    number;
  top:     number;
  dur:     number;
  delay:   number;
  opacity: number;
}

interface ThumbnailParticle {
  dataUrl:  string;
  width:    number;
  height:   number;
  top:      number;
  dur:      number;
  delay:    number;
  opacity:  number;
  tilt:     number;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit, OnDestroy {

  showFrog          = false; // flip to true for the frog version
  animationType     = 2;     // 1 = pixelate + glitch, 2 = simple fade
  showContent       = false;
  isPressed         = false;
  isTransitioning   = false;
  exitOverlayActive = false;

  particles: HomeParticle[] = [];
  thumbnailParticles: ThumbnailParticle[] = [];

  constructor(private router: Router, private localIllustrationService: LocalIllustrationService) {}

  ngOnInit(): void {
    document.body.classList.remove('base-body');
    setTimeout(() => this.showContent = true, 100);
    this._spawnParticles();
    this._spawnThumbnailParticles();
  }

  private _spawnParticles(): void {
    const shapes = ['circle', 'square', 'triangle'] as const;
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        shape:   shapes[Math.floor(Math.random() * 3)],
        size:    100 + Math.floor(Math.random() * 180),
        top:     -10 + Math.random() * 100,
        dur:     18  + Math.random() * 20,
        delay:   -(Math.random() * 38),
        opacity: 0.01 + Math.random() * 0.02,
      });
    }
  }

  private async _spawnThumbnailParticles(): Promise<void> {
    try {
      const items = await this.localIllustrationService.getAll(false);
      const withThumbs = items.filter(i => i.thumbnailDataUrl);
      if (withThumbs.length < 3) return;

      // Shuffle and cap at 12
      const pool = withThumbs.sort(() => Math.random() - 0.5).slice(0, 12);
      for (const item of pool) {
        const h = 70 + Math.floor(Math.random() * 80);
        this.thumbnailParticles.push({
          dataUrl:  item.thumbnailDataUrl!,
          width:    Math.round(h * 1.6),
          height:   h,
          top:      -5  + Math.random() * 95,
          dur:      22  + Math.random() * 18,
          delay:    -(Math.random() * 40),
          opacity:  0.55 + Math.random() * 0.40,
          tilt:     -10  + Math.random() * 20,
        });
      }
    } catch { /* OPFS unavailable — shapes-only mode */ }
  }

  ngOnDestroy(): void {
    document.body.classList.add('base-body');
  }

  pushStart(): void {
    if (this.isPressed) return;
    this.isPressed = true;

    if (this.animationType === 2) {
      this.exitOverlayActive = true;
      setTimeout(() => this.router.navigate(['/dashboard']), 450);
      return;
    }

    // animationType === 1: freeze frame → pixelate + glitch
    const freeze = this.showFrog ? 325 : 0;
    setTimeout(() => {
      this.isTransitioning = true;
      setTimeout(() => this.router.navigate(['/dashboard']), 420);
    }, freeze);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (this.isPressed) return;
    const skip = ['Tab', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
    if (!skip.includes(e.key)) this.pushStart();
  }
}
