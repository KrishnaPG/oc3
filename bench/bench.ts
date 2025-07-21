import { performance } from "node:perf_hooks";
import { Box3, Vector3, BufferGeometry, BufferAttribute, Ray } from "three";
import { MeshBVH } from "three-mesh-bvh"; // dev-only peer
import { Octree } from "../dist/index.js"; // built ESM

const COUNT = 60000;
const RAY_COUNT = 1000;

// 1. Generate identical AABBs
const boxes = Array.from({ length: COUNT }, () => {
  const min = new Vector3(Math.random() * 500 - 250, Math.random() * 100, Math.random() * 500 - 250);
  return new Box3().setFromCenterAndSize(min, new Vector3(1 + Math.random(), 1 + Math.random(), 1 + Math.random()));
});

// 2. Build oc3
const oc3 = new Octree(new Box3().setFromCenterAndSize(new Vector3(0, 0, 0), new Vector3(500, 100, 500)));
console.time("oc3-build");
boxes.forEach((b, i) => oc3.insert({ box: b, id: i }));
console.timeEnd("oc3-build");

// 3. Build MeshBVH (dummy geometry for AABB)
const geom = (() => {
  const g = new (class extends BufferGeometry {})();
  const pos = new Float32Array(boxes.length * 12 * 2); // 2 triangles per box
  let off = 0;
  boxes.forEach((b) => {
    const [min, max] = [b.min, b.max];
    // 12 vertices (2 triangles) per box
    const vs = [
      min.x,
      min.y,
      min.z,
      max.x,
      min.y,
      min.z,
      max.x,
      max.y,
      min.z,
      min.x,
      min.y,
      min.z,
      max.x,
      max.y,
      min.z,
      min.x,
      max.y,
      min.z,
    ];
    pos.set(vs, off);
    off += vs.length;
  });
  g.setAttribute("position", new BufferAttribute(pos, 3));
  return g;
})();
const bvh = new MeshBVH(geom, { maxLeafTris: 1 });
console.time("bvh-build");
bvh.refit();
console.timeEnd("bvh-build");

// 4. Raycast benchmark
const rays = Array.from({ length: RAY_COUNT }, () => {
  const origin = new Vector3(Math.random() * 500 - 250, 50, Math.random() * 500 - 250);
  const dir = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  return { origin, dir };
});

// oc3
console.time("oc3-raycast");
let ocHits = 0;
rays.forEach((r) => {
  const h = [];
  oc3.raycast(new Ray(r.origin, r.dir), h);
  ocHits += h.length;
});
console.timeEnd("oc3-raycast");

const ocTime = performance.now();
const bvhTime = performance.now();

// bvh
console.time("bvh-raycast");
let bvhHits = 0;
rays.forEach((r) => {
  const h = [];
  const intersection = bvh.raycastFirst(new Ray(r.origin, r.dir));
  bvhHits += h.length;
});
console.timeEnd("bvh-raycast");

// 5. AABB query benchmark
const queryBox = new Box3().setFromCenterAndSize(new Vector3(0, 0, 0), new Vector3(50, 50, 50));

console.time("oc3-aabb");
const ocAABBs: number[] = [];
oc3.aabbQuery(queryBox, (id) => ocAABBs.push(id));
console.timeEnd("oc3-aabb");

console.time("bvh-aabb");
const bvhAABBs: number[] = [];
bvh.shapecast(
  {
    intersectsBounds: (box) => queryBox.intersectsBox(box),
    intersectsTriangle: () => true,
  },
);
console.timeEnd("bvh-aabb");

// 6. Report
console.table({
  "oc3 raycast": { ops: (RAY_COUNT / (ocTime / 1000)).toFixed(0) + " ops/sec", hits: ocHits },
  "bvh raycast": { ops: (RAY_COUNT / (bvhTime / 1000)).toFixed(0) + " ops/sec", hits: bvhHits },
  "oc3 aabb": { hits: ocAABBs.length },
  "bvh aabb": { hits: bvhAABBs.length },
});
