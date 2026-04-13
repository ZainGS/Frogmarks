import { BoardCollaborator } from "app/boards/models/board-collaborator.model";
import { BoardItem } from "app/boards/models/board-item.model";
import { BoardPermissions } from "app/boards/models/board-permissions.model";
import { BoardUserPreferences } from "app/boards/models/board-user-preferences.model";
import { Team } from "../../shared/models/teams/team.model";

export class Illustration {
  id?: number;
  uuid?: string;
  name?: string = "Untitled";
  description?: string;
  thumbnailUrl?: string;
  isCustomThumbnail?: boolean = false;
  isDraft?: boolean;
  isFavorite?: boolean;
  collaborators?: BoardCollaborator[];
  boardItems?: BoardItem[];
  teamId?: number;
  team?: Team;
  preferences?: BoardUserPreferences;
  permissions?: BoardPermissions;
  canvasData?: string;
  sceneGraphData?: string;
  isArchived?: boolean;
  type?: string = 'illustration';
}
