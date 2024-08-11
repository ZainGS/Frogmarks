import { Team } from "../../shared/models/teams/team.model";
import { BoardCollaborator } from "./board-collaborator.model";
import { BoardItem } from "./board-item.model";
import { BoardPermissions } from "./board-permissions.model";
import { BoardUserPreferences } from "./board-user-preferences.model";

export class Board {
  id?: number;
  uuid?: string;
  name?: string = "Untitled";
  description?: string;
  thumbnailUrl?: string;
  isDraft?: boolean;
  isFavorite?: boolean;
  startViewLeftTop?: number = 0;
  startViewLeftBottom?: number = 0;
  startViewRightTop?: number = 0;
  startViewRightBottom?: number = 0;
  backgroundColor?: string;
  collaborators?: BoardCollaborator[];
  boardItems?: BoardItem[];
  teamId?: number;
  team?: Team;
  preferences?: BoardUserPreferences;
  permissions?: BoardPermissions;
}
