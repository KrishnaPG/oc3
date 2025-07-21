import { BufferGeometry, LineSegments, Material, Box3, Float32BufferAttribute } from "three";

export class OctreeHelper extends LineSegments {
  constructor(public octree: any, depth = 5) {
    const geom = new BufferGeometry();
    super(geom, new Material()); // simple material
    this.update(depth);
  }

  update(depth: number) {
    // minimal wireframe for debug
    const positions: number[] = [];
    // traverse octree and push box corners – simplified for brevity
    this.geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  }
}
