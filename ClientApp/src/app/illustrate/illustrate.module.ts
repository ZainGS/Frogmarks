import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SharedUiModule } from '../shared/shared-ui.module';
import { IllustrationComponent } from './components/illustration/illustration.component';
import { NEW_INSTANCE_PER_DOCUMENT } from '../shared/routing/document-route-reuse.strategy';
import { AnimationTimelineComponent } from './components/animation-timeline/animation-timeline.component';
import { AnimationExportComponent } from './components/animation-export/animation-export.component';
import { ClothBuilderComponent } from './components/cloth-builder/cloth-builder.component';
import { ParticleEmittersComponent } from './components/particle-emitters/particle-emitters.component';
import { MeshEditPanelComponent } from './components/mesh-edit-panel/mesh-edit-panel.component';
import { MeshEditChromeComponent } from './components/mesh-edit-chrome/mesh-edit-chrome.component';
import { MeshEditPropsComponent } from './components/mesh-edit-props/mesh-edit-props.component';
import { ArmaturePanelComponent } from './components/armature-panel/armature-panel.component';
import { ARMATURE_SECTION_COMPONENTS } from './components/armature-panel/sections/arm-sections.index';
import { ArmSectionsComponent } from './components/armature-panel/arm-sections.component';
import { ArmatureModeComponent } from './components/armature-mode/armature-mode.component';
import { SkinsPanelComponent } from './components/skins-panel/skins-panel.component';
import { CdDesignerPanelComponent } from './components/cd-designer-panel/cd-designer-panel.component';
import { UiSystemPanelComponent } from './components/ui-system-panel/ui-system-panel.component';
import { FoliagePanelComponent } from './components/foliage-panel/foliage-panel.component';
import { BuildingPanelComponent } from './components/building-panel/building-panel.component';
import { BlockPanelComponent } from './components/block-panel/block-panel.component';
import { WorldPanelComponent } from './components/world-panel/world-panel.component';
import { PkgCreatorPanelComponent } from './components/pkg-creator-panel/pkg-creator-panel.component';
import { PkgDielineSidebarComponent } from './components/pkg-dieline-sidebar/pkg-dieline-sidebar.component';
import { CharacterPanelComponent } from './components/character-panel/character-panel.component';
import { CharBodySectionComponent } from './components/character-panel/sections/char-body-section.component';
import { CharFaceSectionComponent } from './components/character-panel/sections/char-face-section.component';
import { CharEyesSectionComponent } from './components/character-panel/sections/char-eyes-section.component';
import { CharHairSectionComponent } from './components/character-panel/sections/char-hair-section.component';
import { CharClothingSectionComponent } from './components/character-panel/sections/char-clothing-section.component';
import { CharCharmsSectionComponent } from './components/character-panel/sections/char-charms-section.component';
import { ArrayGroupPanelComponent } from './components/array-group-panel/array-group-panel.component';
import { ClothInspectorComponent } from './components/cloth-inspector/cloth-inspector.component';
import { SceneViewBarComponent } from './components/scene-view-bar/scene-view-bar.component';
import { SceneRenderSettingsComponent } from './components/scene-render-settings/scene-render-settings.component';
import { EditorMenubarComponent } from './components/editor-menubar/editor-menubar.component';
import { ArrayToolPanelComponent } from './components/array-tool-panel/array-tool-panel.component';
import { ExportModalComponent } from './components/export-modal/export-modal.component';
import { SceneOutlinerComponent } from './components/scene-outliner/scene-outliner.component';
import { RibbonPanelComponent } from './components/ribbon-panel/ribbon-panel.component';
import { DecalPanelComponent } from './components/decal-panel/decal-panel.component';
import { CreatorPanelComponent } from './components/creator-panel/creator-panel.component';
import { MeshKeyframeSectionComponent } from './components/mesh-keyframe-section/mesh-keyframe-section.component';
import { MeshBlendShapesSectionComponent } from './components/mesh-blend-shapes-section/mesh-blend-shapes-section.component';
import { SyncModeDialogComponent } from './components/sync-mode-dialog/sync-mode-dialog.component';
import { AddMeshMenuComponent } from './components/add-mesh-menu/add-mesh-menu.component';
import { SceneAdvancedSettingsComponent } from './components/scene-advanced-settings/scene-advanced-settings.component';
import { MeshMaterialSectionComponent } from './components/mesh-material-section/mesh-material-section.component';
import { MeshFrameLinkSectionComponent } from './components/mesh-frame-link-section/mesh-frame-link-section.component';
import { MeshHtmlTextureSectionComponent } from './components/mesh-html-texture-section/mesh-html-texture-section.component';
import { MeshTextureSectionComponent } from './components/mesh-texture-section/mesh-texture-section.component';
import { MeshTransformSectionComponent } from './components/mesh-transform-section/mesh-transform-section.component';
import { MeshBehaviorSectionComponent } from './components/mesh-behavior-section/mesh-behavior-section.component';
import { MeshOutlineSectionComponent } from './components/mesh-outline-section/mesh-outline-section.component';
import { MagicWandOptionsComponent } from './components/magic-wand-options/magic-wand-options.component';
import { FillOptionsComponent } from './components/fill-options/fill-options.component';
import { RasterTextOptionsComponent } from './components/raster-text-options/raster-text-options.component';
import { PanelLayoutOptionsComponent } from './components/panel-layout-options/panel-layout-options.component';
import { LiveTextOptionsComponent } from './components/live-text-options/live-text-options.component';
import { BalloonOptionsComponent } from './components/balloon-options/balloon-options.component';
import { PersistentColorPickerComponent } from './components/persistent-color-picker/persistent-color-picker.component';
import { PlayTouchControlsComponent } from './components/play-touch-controls/play-touch-controls.component';
import { TouchContextPillComponent } from './components/touch-context-pill/touch-context-pill.component';
import { VectorLayerPanelComponent } from './components/vector-layer-panel/vector-layer-panel.component';
import { DitherOptionsComponent } from './components/dither-options/dither-options.component';
import { FrameLinkPanelComponent } from './components/frame-link-panel/frame-link-panel.component';
import { LayerDitherPanelComponent } from './components/layer-dither-panel/layer-dither-panel.component';
import { SceneAnimSectionComponent } from './components/scene-anim-section/scene-anim-section.component';
import { TimelineFrameBadgeComponent } from './components/timeline-frame-badge/timeline-frame-badge.component';
import { SceneCinematicSectionComponent } from './components/scene-cinematic-section/scene-cinematic-section.component';
import { EphemeraPanel } from './components/ephemera-panel/ephemera-panel.component';
import { GreasePencilPanelComponent } from './components/grease-pencil-panel/grease-pencil-panel.component';
import { UvEditorPanelComponent } from './components/uv-editor-panel/uv-editor-panel.component';
import { AuthoringPanelComponent } from './components/authoring-panel/authoring-panel.component';
import { DetachWhenHiddenDirective } from '../shared/directives/detach-when-hidden.directive';
import { HoldRepeatDirective } from '../shared/directives/hold-repeat.directive';
import { ConfirmStripComponent } from './components/confirm-strip/confirm-strip.component';
import { ModeHeaderBarComponent } from './components/mode-chrome/mode-header-bar/mode-header-bar.component';
import { ModeToolStripComponent } from './components/mode-chrome/mode-tool-strip/mode-tool-strip.component';
import { ModeOpPillComponent } from './components/mode-chrome/mode-op-pill/mode-op-pill.component';
import { ModeRadialMenuComponent } from './components/mode-chrome/mode-radial-menu/mode-radial-menu.component';
import { ModePropsPanelComponent } from './components/mode-chrome/mode-props-panel/mode-props-panel.component';

/** Leaving the editor saves the pending change first (audit Phase 2.3). */
const flushBeforeLeave = (c: IllustrationComponent) => c.flushBeforeLeave();

/** Mounted under both /illustration and /view (app.module); /view sets data.viewer, which the child inherits. */
/** NEW_INSTANCE_PER_DOCUMENT: switching documents (New / Duplicate Illustration) recreates the editor instead of reusing
 *  it, so no component-scoped state carries over (see DocumentRouteReuseStrategy). */
const routes: Routes = [
  { path: 'local/:id', component: IllustrationComponent, data: { local: true, [NEW_INSTANCE_PER_DOCUMENT]: true }, canDeactivate: [flushBeforeLeave] },
  { path: ':id', component: IllustrationComponent, data: { [NEW_INSTANCE_PER_DOCUMENT]: true }, canDeactivate: [flushBeforeLeave] },
];

/** The Illustrate editor and all its panels — lazy-loaded (audit Phase 4.1). */
@NgModule({
  declarations: [
    IllustrationComponent,
    AnimationTimelineComponent,
    AnimationExportComponent,
    ClothBuilderComponent,
    ParticleEmittersComponent,
    MeshEditPanelComponent,
    MeshEditChromeComponent,
    MeshEditPropsComponent,
    ArmaturePanelComponent,
    // Armature: the shared sections (classic panel + mode chrome) and the mode chrome itself (UI review §4)
    ArmSectionsComponent,
    ...ARMATURE_SECTION_COMPONENTS,
    ArmatureModeComponent,
    SkinsPanelComponent,
    CdDesignerPanelComponent,
    UiSystemPanelComponent,
    FoliagePanelComponent,
    BuildingPanelComponent,
    BlockPanelComponent,
    WorldPanelComponent,
    PkgCreatorPanelComponent,
    PkgDielineSidebarComponent,
    CharacterPanelComponent,
    CharBodySectionComponent,
    CharFaceSectionComponent,
    CharEyesSectionComponent,
    CharHairSectionComponent,
    CharClothingSectionComponent,
    CharCharmsSectionComponent,
    ArrayGroupPanelComponent,
    ClothInspectorComponent,
    SceneViewBarComponent,
    SceneRenderSettingsComponent,
    EditorMenubarComponent,
    ArrayToolPanelComponent,
    ExportModalComponent,
    SceneOutlinerComponent,
    RibbonPanelComponent,
    DecalPanelComponent,
    CreatorPanelComponent,
    MeshKeyframeSectionComponent,
    MeshBlendShapesSectionComponent,
    SyncModeDialogComponent,
    AddMeshMenuComponent,
    SceneAdvancedSettingsComponent,
    MeshMaterialSectionComponent,
    MeshFrameLinkSectionComponent,
    MeshHtmlTextureSectionComponent,
    MeshTextureSectionComponent,
    MeshTransformSectionComponent,
    MeshBehaviorSectionComponent,
    MeshOutlineSectionComponent,
    MagicWandOptionsComponent,
    FillOptionsComponent,
    RasterTextOptionsComponent,
    PanelLayoutOptionsComponent,
    LiveTextOptionsComponent,
    BalloonOptionsComponent,
    PersistentColorPickerComponent,
    PlayTouchControlsComponent,
    TouchContextPillComponent,
    VectorLayerPanelComponent,
    DitherOptionsComponent,
    FrameLinkPanelComponent,
    LayerDitherPanelComponent,
    SceneAnimSectionComponent,
    TimelineFrameBadgeComponent,
    SceneCinematicSectionComponent,
    EphemeraPanel,
    GreasePencilPanelComponent,
    UvEditorPanelComponent,
    AuthoringPanelComponent,
    // Mode chrome (Edit Mesh / Armature redesign): components/mode-chrome/README.md
    ModeHeaderBarComponent,
    ModeToolStripComponent,
    ModeOpPillComponent,
    ModeRadialMenuComponent,
    ModePropsPanelComponent,
  ],
  exports: [ModeHeaderBarComponent, ModeToolStripComponent, ModeOpPillComponent, ModeRadialMenuComponent, ModePropsPanelComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule, SharedUiModule, DetachWhenHiddenDirective, HoldRepeatDirective, ConfirmStripComponent, RouterModule.forChild(routes)],
})
export class IllustrateModule { }
