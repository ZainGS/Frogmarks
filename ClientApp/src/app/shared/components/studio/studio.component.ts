import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import ShapeManager from '@zaings/salsa/shape-manager';
import { isRendererLive, startWebGPURendering } from '@zaings/salsa';
import { LocalIllustrationService } from '../../services/illustrate/local-illustration.service';
import { NewIllustrationDialogComponent } from '../new-illustration-dialog/new-illustration-dialog.component';

@Component({
  selector: 'app-studio',
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.scss']
})
export class StudioComponent implements OnInit, OnDestroy {
  private sm: any = null;
  private _activateSub?: Subscription;
  private _changeSub?: { unsubscribe(): void };
  private _newlyCreatedIds = new Set<string>();
  private _pendingNewProjectResult: any = null;

  showInstallDialog  = false;
  showSettingsOverlay = false;
  installUrlInput    = '';
  ariaSlots: { id: string; name: string }[] = [];

  constructor(
    private router: Router,
    private ngZone: NgZone,
    private dialog: MatDialog,
    private localIllustrationService: LocalIllustrationService,
  ) {}

  async ngOnInit(): Promise<void> {
    // webgpuCanvas persists in AppComponent but must not intercept shell input.
    const webgpuCanvas = document.getElementById('webgpuCanvas') as HTMLCanvasElement | null;
    if (webgpuCanvas) webgpuCanvas.style.pointerEvents = 'none';

    if (!isRendererLive) {
      await startWebGPURendering('shellCanvas');
    }

    this.sm = ShapeManager.getInstance();
    await this.sm.whenWebGPUReady?.();

    // Point the shell at our IndexedDB illustration store so project IDs match.
    this.sm.shell?.setDocumentSource?.({
      listProjects: async () => {
        const items = await this.localIllustrationService.getAll(false);
        return items.map(i => ({
          id:               i.uuid,
          name:             i.name,
          thumbnailDataUrl: i.thumbnailDataUrl,
          lastModified:     i.updatedAt,
        }));
      },
      createProject: async (name: string) => {
        const item = await this.localIllustrationService.create(name);
        this._newlyCreatedIds.add(item.uuid);
        return { id: item.uuid, name: item.name, thumbnailDataUrl: item.thumbnailDataUrl };
      },
      deleteProject: (id: string) => this.localIllustrationService.delete(id),
      renameProject: (id: string, name: string) => this.localIllustrationService.rename(id, name),
    });

    await this.sm.shell?.load?.();
    this.sm.setShellLogo?.('assets/images/logo.png');

    this._activateSub = this.sm.shell?.onActivate?.subscribe(({ id, kind }: any) => {
      this.ngZone.run(() => this._handleActivation(id, kind));
    });

    this._changeSub = this.sm.shell?.onChange?.subscribe(() => {
      this.ngZone.run(() => this._refreshAria());
    });

    const shellCanvas = document.getElementById('shellCanvas') as HTMLCanvasElement;
    await this.sm.shell?.initializeScene?.(shellCanvas);
    this._refreshAria();
  }

  ngOnDestroy(): void {
    this._activateSub?.unsubscribe();
    this._changeSub?.unsubscribe();
    this.sm?.shell?.destroyScene?.();
    const webgpuCanvas = document.getElementById('webgpuCanvas') as HTMLCanvasElement | null;
    if (webgpuCanvas) webgpuCanvas.style.pointerEvents = '';
  }

  private _handleActivation(id: string, kind: string): void {
    switch (kind) {
      case 'project':
        if (this._newlyCreatedIds.has(id)) {
          this._newlyCreatedIds.delete(id);
          this._openNewProject(id);
        } else {
          this._openProject(id);
        }
        break;
      case 'empty':
        if (id === '__new_project__') {
          this._initiateNewProject();
        } else {
          this.showInstallDialog = true;
        }
        break;
      case 'system':
        if (id === 'system:settings') this.showSettingsOverlay = true;
        break;
    }
  }

  private _openProject(projectId: string): void {
    this.router.navigate(['/illustration/local', projectId]);
  }

  private _initiateNewProject(): void {
    const dialogRef = this.dialog.open(NewIllustrationDialogComponent, {
      width: '420px',
      panelClass: 'new-illustration-dialog',
      disableClose: false,
      enterAnimationDuration: '0ms',
      data: { isLoggedIn: false },
    });
    dialogRef.afterClosed().subscribe(async (result: any) => {
      if (!result) return;
      const project = await this.sm.shell?.createProject?.(result.name ?? 'Untitled');
      const id = project?.id;
      if (!id) return;
      // Remove from _newlyCreatedIds so onActivate (if it fires) treats it as an existing project open
      this._newlyCreatedIds.delete(id);
      if (result.bounded && result.docW && result.docH) {
        this.router.navigate(['/illustration/local', id], {
          queryParams: { docW: result.docW, docH: result.docH },
        });
      } else {
        this.router.navigate(['/illustration/local', id]);
      }
    });
  }

  private _openNewProject(projectId: string): void {
    const result = this._pendingNewProjectResult;
    this._pendingNewProjectResult = null;
    if (result?.bounded && result.docW && result.docH) {
      this.router.navigate(['/illustration/local', projectId], {
        queryParams: { docW: result.docW, docH: result.docH },
      });
    } else {
      this.router.navigate(['/illustration/local', projectId]);
    }
  }

  private _refreshAria(): void {
    const slots    = this.sm?.shell?.getSlots?.()    ?? [];
    const projects = this.sm?.shell?.getProjects?.() ?? [];
    this.ariaSlots = [
      ...slots.map((s: any)    => ({ id: s.id,   name: s.name  ?? s.id })),
      ...projects.map((p: any) => ({ id: p.id,   name: p.name  ?? 'Untitled' })),
    ];
  }

  closeInstallDialog(): void {
    this.showInstallDialog = false;
    this.installUrlInput   = '';
  }

  closeSettingsOverlay(): void {
    this.showSettingsOverlay = false;
  }

  async installCartFromUrl(): Promise<void> {
    // Phase 4 — wire when Salsa cart install APIs land
    this.closeInstallDialog();
  }
}
