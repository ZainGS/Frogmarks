import { Board } from "../../../boards/models/board.model";
import { TeamUser } from "./team-user.model";

export class TeamProject {
  id!: number;
  name?: string;
  tags?: string[];
  teamProjectUsers?: TeamUser[];
  boards?: Board[];
  isPublic?: boolean;
}
