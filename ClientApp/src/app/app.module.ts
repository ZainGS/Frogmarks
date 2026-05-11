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

import { AppComponent } from './app.component';
import { ApiAuthorizationModule } from '../../src/api-authorization/api-authorization.module';
import { AuthorizeGuard } from '../../src/api-authorization/authorize.guard';
import { AuthorizeInterceptor } from '../../src/api-authorization/authorize.interceptor';
import { NavMenuComponent } from './shared/components/nav-menu/nav-menu.component';
import { HomeComponent } from './shared/components/home/home.component';
import { AuthInterceptor } from './shared/interceptors/auth.interceptor';

import { MsalModule, MsalService, MSAL_INSTANCE } from '@azure/msal-angular';
import { PublicClientApplication, InteractionType } from '@azure/msal-browser';
import { SignInComponent } from './shared/components/signin/signin.component';
import { DashboardComponent } from './shared/components/dashboard/dashboard.component';
import { CheckYourEmailComponent } from './shared/components/check-your-email/check-your-email.component';
import { BoardComponent } from './boards/components/board/board.component';
import { InviteModalComponent } from './shared/components/invite-modal/invite-modal.component';
import { UpgradeModalComponent } from './shared/components/upgrade-modal/upgrade-modal.component';
import { ColorPickerComponent } from './shared/components/color-picker/color-picker.component';
import { IllustrationComponent } from './illustrate/components/illustration/illustration.component';
import { ExploreFeedComponent } from './shared/components/explore-feed/explore-feed.component';
import { BrushOptionsComponent } from './boards/components/brush-options/brush-options.component';
import { CurveEditorComponent } from './boards/components/curve-editor/curve-editor.component';
import { RasterLayersComponent } from './boards/components/raster-layers/raster-layers.component';
import { SelectionToolbarComponent } from './boards/components/selection-toolbar/selection-toolbar.component';
import { AnimationTimelineComponent } from './illustrate/components/animation-timeline/animation-timeline.component';
import { AnimationExportComponent } from './illustrate/components/animation-export/animation-export.component';
import { NewIllustrationDialogComponent } from './shared/components/new-illustration-dialog/new-illustration-dialog.component';
import { ClothBuilderComponent } from './illustrate/components/cloth-builder/cloth-builder.component';
import { ParticleEmittersComponent } from './illustrate/components/particle-emitters/particle-emitters.component';
import { MeshEditPanelComponent } from './illustrate/components/mesh-edit-panel/mesh-edit-panel.component';

// Define MSAL configuration
/*
export function MSALInstanceFactory(): PublicClientApplication {
  return new PublicClientApplication({
    auth: {
      clientId: 'your-client-id', // Azure AD Application (client) ID
      authority: 'https://login.microsoftonline.com/your-tenant-id', // Azure AD tenant ID
      redirectUri: 'http://localhost:4200' // redirect URI
    },
    cache: {
      cacheLocation: 'localStorage', // This configures where your cache will be stored
      storeAuthStateInCookie: true // Set to true for Internet Explorer 11
    }
  });
}
*/

@NgModule({
  declarations: [
    AppComponent,
    NavMenuComponent,
    HomeComponent,
    DashboardComponent,
    ExploreFeedComponent,
    InviteModalComponent,
    UpgradeModalComponent,
    ColorPickerComponent,
    BoardComponent,
    IllustrationComponent,
    BrushOptionsComponent,
    CurveEditorComponent,
    RasterLayersComponent,
    SelectionToolbarComponent,
    AnimationTimelineComponent,
    AnimationExportComponent,
    NewIllustrationDialogComponent,
    ClothBuilderComponent,
    ParticleEmittersComponent,
    MeshEditPanelComponent,
  ],
  imports: [
    //.withServerTransition({ appId: 'ng-cli-universal' })
    BrowserModule,
    MsalModule,
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
    ApiAuthorizationModule,
    RouterModule.forRoot([
      { path: '', component: HomeComponent, pathMatch: 'full' },
      { path: 'check-your-email', component: CheckYourEmailComponent},
      { path: 'signin', component: SignInComponent},
      { path: 'dashboard', component: DashboardComponent},
      { path: 'board/:id', component: BoardComponent},
      { path: 'illustration/local/:id', component: IllustrationComponent, data: { local: true } },
      { path: 'illustration/:id', component: IllustrationComponent},
      { path: 'view/:id', component: IllustrationComponent, data: { viewer: true } },
    ])
  ],
  exports: [RouterModule],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      //useClass: AuthorizeInterceptor, multi: true
      useClass: AuthInterceptor, multi: true
    },
    /*
    {
      provide: MSAL_INSTANCE,
      useFactory: MSALInstanceFactory
    },
    MsalService
    */
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
