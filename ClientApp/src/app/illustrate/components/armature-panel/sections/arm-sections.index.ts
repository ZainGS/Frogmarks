import { ArmSkeletonsSectionComponent } from './arm-skeletons-section.component';
import { ArmJointsSectionComponent } from './arm-joints-section.component';
import { ArmJointPropsSectionComponent } from './arm-joint-props-section.component';
import { ArmConstraintsSectionComponent } from './arm-constraints-section.component';
import { ArmPosesSectionComponent } from './arm-poses-section.component';
import { ArmBindSectionComponent } from './arm-bind-section.component';
import { ArmWeightSectionComponent } from './arm-weight-section.component';
import { ArmClipsSectionComponent } from './arm-clips-section.component';
import { ArmPoseLibrarySectionComponent } from './arm-pose-library-section.component';
import { ArmLibrariesSectionComponent } from './arm-libraries-section.component';
import { ArmNlaSectionComponent } from './arm-nla-section.component';
import { ArmRetargetSectionComponent } from './arm-retarget-section.component';
import { ArmSpringSectionComponent } from './arm-spring-section.component';

/** Every Armature section component (declared by IllustrateModule; used by the classic panel and the mode chrome). */
export const ARMATURE_SECTION_COMPONENTS = [
  ArmSkeletonsSectionComponent, ArmJointsSectionComponent, ArmJointPropsSectionComponent, ArmConstraintsSectionComponent,
  ArmPosesSectionComponent, ArmBindSectionComponent, ArmWeightSectionComponent, ArmClipsSectionComponent,
  ArmPoseLibrarySectionComponent, ArmLibrariesSectionComponent, ArmNlaSectionComponent, ArmRetargetSectionComponent,
  ArmSpringSectionComponent,
];
