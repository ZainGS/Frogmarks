import { BoardRole } from "./board-role.model";

export class BoardCollaborator {
  id!: number;
  userId?: number;
  roles?: BoardRole[];
}
