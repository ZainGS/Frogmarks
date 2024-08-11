import { HorizontalAlignment } from "../../shared/models/enums/horizontal-alignment.enum";
import { VerticalAlignment } from "../../shared/models/enums/vertical-alignment.enum";

export class BoardItemOptions {
  id!: number;
  fontId?: number;
  fontStyleIds: number[] = [];
  borderThickness?: number;
  borderOpacity?: number;
  borderColor?: string;
  horizontalAlignment: HorizontalAlignment = HorizontalAlignment.Center;
  verticalAlignment: VerticalAlignment = VerticalAlignment.Middle;
}

