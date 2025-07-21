import { Box3, Object3D } from "three";
import { Octree } from "../core/Octree";

export function fromObject3D(oct: Octree, obj: Object3D) {
  const box = new Box3().setFromObject(obj);
  oct.insert({ box, id: obj.id });
}

export function updateObject3D(oct: Octree, obj: Object3D) {
  const box = new Box3().setFromObject(obj);
  oct.update({ box, id: obj.id });
}
