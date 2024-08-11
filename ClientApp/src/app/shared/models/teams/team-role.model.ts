import { TeamPermissions } from "./team-permissions.model";


export class TeamRole {
  id!: number;
  teamId?: number;
  name?: string;
  permissionsId?: number;
  permissions?: TeamPermissions;
}

