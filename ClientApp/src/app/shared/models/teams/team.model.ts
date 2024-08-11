import { Board } from "../../../boards/models/board.model";
import { TeamProject } from "./team-project.model";
import { TeamUser } from "./team-user.model";


export class Team {
  id?: number;
  name?: string;
  description?: string;
  teamProjects?: TeamProject[];
  boards?: Board[];
  teamUsers?: TeamUser[];
}
