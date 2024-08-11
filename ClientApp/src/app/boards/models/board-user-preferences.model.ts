import { PeripheralType } from "../../shared/models/enums/peripheral-type.enum";

export class BoardUserPreferences {
  id!: number;
  boardId!: number;

  // View
  snapToGrid: boolean = true;
  showCollaboratorCursors: boolean = true;
  showCommentsOnBoard: boolean = true;
  showScrollBars: boolean = true;
  showObjectDimensions: boolean = false;

  // Preferences
  peripheralType: PeripheralType = PeripheralType.Autodetect;
  alignObjects: boolean = true;
  reduceMotion: boolean = false;
  followAllThreads: boolean = true;
}
