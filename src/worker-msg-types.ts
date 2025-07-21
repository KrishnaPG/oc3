
export type Vec3Array = [number, number, number];

export interface BaseMsg {
  id: number;
}

export interface InsertMsg extends BaseMsg {
  type: "insert";
  id: number;
  min: Vec3Array;
  max: Vec3Array;
}

export interface RemoveMsg extends BaseMsg {
  type: "remove";
  id: number;
}

export interface UpdateMsg extends BaseMsg {
  type: "update";
  id: number;
  min: Vec3Array;
  max: Vec3Array;
}

export interface RaycastMsg extends BaseMsg {
  type: "raycast";
  origin: Vec3Array;
  direction: Vec3Array;
}

export interface AabbQueryMsg extends BaseMsg {
  type: "aabbQuery";
  min: Vec3Array;
  max: Vec3Array;
}

export interface FrustumQueryMsg extends BaseMsg {
  type: "frustumQuery";
  planes: number[]; // 6 planes, 4 floats each → 24 numbers
}

export type WorkerMsg = InsertMsg | RemoveMsg | UpdateMsg | RaycastMsg | AabbQueryMsg | FrustumQueryMsg;