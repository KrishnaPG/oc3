
export type Vec3Array = [number, number, number];

export interface BaseMsg {
  id: number;
}

export interface InsertMsg extends BaseMsg {
  cmd: "insert";
  id: number;
  min: Vec3Array;
  max: Vec3Array;
}

export interface RemoveMsg extends BaseMsg {
  cmd: "remove";
  id: number;
}

export interface UpdateMsg extends BaseMsg {
  cmd: "update";
  id: number;
  min: Vec3Array;
  max: Vec3Array;
}

export interface RaycastMsg extends BaseMsg {
  cmd: "raycast";
  origin: Vec3Array;
  direction: Vec3Array;
}

export interface AabbQueryMsg extends BaseMsg {
  cmd: "aabbQuery";
  min: Vec3Array;
  max: Vec3Array;
}

export interface FrustumQueryMsg extends BaseMsg {
  cmd: "frustumQuery";
  planes: number[]; // 6 planes, 4 floats each → 24 numbers
}

export type SingleMsg = InsertMsg | RemoveMsg | UpdateMsg | RaycastMsg | AabbQueryMsg | FrustumQueryMsg; 
export type BatchMessage = Array<SingleMsg>;
export type WorkerMsg = SingleMsg | BatchMessage;