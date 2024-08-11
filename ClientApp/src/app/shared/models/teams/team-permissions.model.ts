import { TeamRole } from "./team-role.model";

export class TeamPermissions {
  id!: number;
  teamRoleId?: number;
  teamRole?: TeamRole;
  canAddMembers: boolean = false;
  canDeleteMembers: boolean = false;
  canCreateBoards: boolean = false;
  canEditBoards: boolean = false;
  canDeleteBoards: boolean = false;
  canCreateProjects: boolean = false;
  canEditProjects: boolean = false;
  canDeleteProjects: boolean = false;
  canChangePermissions: boolean = false;
}
