import { Board } from "../../../boards/models/board.model";
import { TeamRole } from "./team-role.model";


export class TeamUser {
  id!: number;
  teamId!: number;
  applicationUserId?: number;
  teamRoles?: TeamRole[];
  starredBoards?: Board[];
}
