export class BoardPermissions {
  id!: number;
  boardId!: number;
  canNonCollaboratorsView: boolean = false;
  canNonCollaboratorsEdit: boolean = false;
}
