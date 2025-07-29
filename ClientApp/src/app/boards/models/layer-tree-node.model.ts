export interface LayerTreeNode {
  id: string;
  type: string;
  name?: string;
  visible: boolean;
  children: LayerTreeNode[];
  locked: boolean;
}