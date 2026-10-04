import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { MatSnackBarModule } from '@angular/material/snack-bar'
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatOptionModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { SkinBuilderComponent } from './shared/components/skin-builder/skin-builder.component';

import { AppComponent } from './app.component';
import { SharedUiModule } from './shared/shared-ui.module';
import { NavMenuComponent } from './shared/components/nav-menu/nav-menu.component';
import { HomeComponent } from './shared/components/home/home.component';
import { AuthInterceptor } from './shared/interceptors/auth.interceptor';

import { SignInComponent } from './shared/components/signin/signin.component';
import { DashboardComponent } from './shared/components/dashboard/dashboard.component';
import { CheckYourEmailComponent } from './shared/components/check-your-email/check-your-email.component';
import { BoardComponent } from './boards/components/board/board.component';
import { InviteModalComponent } from './shared/components/invite-modal/invite-modal.component';
import { UpgradeModalComponent } from './shared/components/upgrade-modal/upgrade-modal.component';
import { ExploreFeedComponent } from './shared/components/explore-feed/explore-feed.component';
import { NewIllustrationDialogComponent } from './shared/components/new-illustration-dialog/new-illustration-dialog.component';
import { FmIconComponent } from './shared/components/fm-icon/fm-icon.component';
import { DocsComponent } from './shared/components/docs/docs.component';
import { StudioComponent } from './shared/components/studio/studio.component';
import { PackageEditorComponent } from './package-designer/package-editor/package-editor.component';
import { PlayerComponent } from './player/player.component';


@NgModule({
  declarations: [
    AppComponent,
    NavMenuComponent,
    HomeComponent,
    DashboardComponent,
    ExploreFeedComponent,
    InviteModalComponent,
    UpgradeModalComponent,
    BoardComponent,
    NewIllustrationDialogComponent,
    SkinBuilderComponent,
    FmIconComponent,
    DocsComponent,
    StudioComponent,
    PackageEditorComponent,
    PlayerComponent,
  ],
  imports: [
    //.withServerTransition({ appId: 'ng-cli-universal' })
    BrowserModule,
    HttpClientModule,
    MatSnackBarModule,
    MatInputModule,
    MatFormFieldModule,
    MatDialogModule,
    MatOptionModule,
    MatButtonModule,
    MatSelectModule,
    BrowserAnimationsModule,
    MatIconModule,
    MatChipsModule,
    MatMenuModule,
    DragDropModule,
    FormsModule,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatTooltipModule,
    MatExpansionModule,
    SharedUiModule,
    RouterModule.forRoot([
      { path: '', component: StudioComponent, pathMatch: 'full' },
      { path: 'home', component: HomeComponent },
      { path: 'check-your-email', component: CheckYourEmailComponent},
      { path: 'signin', component: SignInComponent},
      { path: 'dashboard', component: DashboardComponent},
      { path: 'dashboard-old', component: DashboardComponent},
      { path: 'board/:id', component: BoardComponent},
      // The Illustrate editor is lazy-loaded (audit Phase 4.1): ~2.3 MB of editor code no longer ships with the shell.
      // Same URLs: /illustration/:id, /illustration/local/:id, /view/:id (viewer data is inherited by the child route).
      { path: 'illustration', loadChildren: () => import('./illustrate/illustrate.module').then(m => m.IllustrateModule) },
      { path: 'view', data: { viewer: true }, loadChildren: () => import('./illustrate/illustrate.module').then(m => m.IllustrateModule) },
      { path: 'docs', component: DocsComponent },
      { path: 'packaging/local/:id', component: PackageEditorComponent, data: { local: true } },
      { path: 'packaging/:id',       component: PackageEditorComponent },
      { path: 'player',              component: PlayerComponent },
    ])
  ],
  exports: [RouterModule],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor, multi: true
    },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
