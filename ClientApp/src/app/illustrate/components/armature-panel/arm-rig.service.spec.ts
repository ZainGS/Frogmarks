import { ArmRigService } from './arm-rig.service';
import type { ArmatureJoint } from './armature-panel.component';

/** Armature panel polish (UI review 2026-10-07 §2c): Joints open by default, constraints pick joints by NAME (and never
 *  default to the selected joint itself). */
describe('ArmRigService joints + constraint targets', () => {
  const joint = (name: string, parentIdx: number): ArmatureJoint =>
    ({ name, parentIdx, x: 0, y: 0, z: 0, tailOffset: [0, 0.3, 0], isLeaf: false });

  function setup() {
    const rig = new ArmRigService();
    const sm = {
      getJointRotation3D: () => [0, 0, 0, 1],
      getJointConstraints3D: () => [],
      addJointConstraint3D: jasmine.createSpy('addJointConstraint3D'),
    };
    rig.bind({ shapeManager: sm } as never);
    rig.activeSkeleton = { id: 's1', name: 'Rig' };
    rig.joints = [joint('hips', -1), joint('spine', 0), joint('head', 1)];
    return { rig, sm };
  }

  it('the Joints section starts open', () => {
    expect(new ArmRigService().jointsCollapsed).toBeFalse();
  });

  it('a newly selected joint: the constraint target starts at its parent (never at itself)', () => {
    const { rig } = setup();
    rig._applyJointSelection(2);
    expect(rig.newConstraintTarget).toBe(1);
    rig._applyJointSelection(0);                       // the root: the next joint
    expect(rig.newConstraintTarget).toBe(1);
    rig._applyJointSelection(1);
    expect(rig.newConstraintTarget).toBe(0);
  });

  it('labels constraints with joint names', () => {
    const { rig } = setup();
    expect(rig.constraintLabel({ type: 'lookAt', targetJointIdx: 2, axis: 'y' })).toBe('Look At → head (Y)');
    expect(rig.constraintLabel({ type: 'copyRotation', sourceJointIdx: 0 })).toBe('Copy Rot ← hips');
    expect(rig.constraintLabel({ type: 'stretchTo', targetJointIdx: 9 })).toBe('Stretch → #9');
  });

  it('adds the constraint with the picked joint index', () => {
    const { rig, sm } = setup();
    rig._applyJointSelection(2);
    rig.addConstraint();
    expect(sm.addJointConstraint3D).toHaveBeenCalledOnceWith('s1', 2, jasmine.objectContaining({ type: 'lookAt', targetJointIdx: 1 }));
  });
});
