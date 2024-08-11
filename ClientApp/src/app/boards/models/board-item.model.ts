import { BoardItemOptions } from "./board-item-options.model";
import { BoardItemPositionData } from "./board-item-position-data.model";
import { BoardItemType } from "./board-item-type.model";

export class BoardItem {
  id!: number;
  boardItemPosition?: BoardItemPositionData;
  type?: BoardItemType;
  options?: BoardItemOptions;
}
