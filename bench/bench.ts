import { Box3, Vector3, BufferGeometry, BufferAttribute, Ray } from "three";
import { MeshBVH } from "three-mesh-bvh"; // dev-only peer
import { Octree } from "../src/index.js"; // built ESM

const COUNT = 60000;
const RAY_COUNT = 1000;

// 1. Generate identical AABBs
const boxes = Array.from({ length: COUNT }, () => {
  const min = new Vector3(Math.random() * 500 - 250, Math.random() * 100, Math.random() * 500 - 250);
  return new Box3().setFromCenterAndSize(min, new Vector3(1 + Math.random(), 1 + Math.random(), 1 + Math.random()));
});

// 2. Build oc3
console.time("oc3-build");
const oc3 = new Octree(new Box3().setFromCenterAndSize(new Vector3(0, 0, 0), new Vector3(500, 100, 500)));
boxes.forEach((b, i) => oc3.insert({ box: b, id: i }));
console.timeEnd("oc3-build");

// 3. Build MeshBVH (dummy geometry for AABB)
const geom = (() => {
  const g = new BufferGeometry();
  const pos = new Float32Array(boxes.length * 4 * 3); 
  const indices = new Uint32Array(boxes.length * 6);
  boxes.forEach((b, i) => {
    const { min, max } = b;
    const baseVertex = i * 4;
    pos.set([
        min.x, min.y, min.z,
        max.x, min.y, min.z,
        max.x, max.y, min.z,
        min.x, max.y, min.z,
    ], baseVertex * 3);
    indices.set([
        baseVertex, baseVertex + 1, baseVertex + 2,
        baseVertex, baseVertex + 2, baseVertex + 3,
    ], i*6);
  });
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setIndex(new BufferAttribute(indices, 1));
  return g;
})();

console.time("bvh-build");
const bvh = new MeshBVH(geom, { maxLeafTris: 1 });
console.timeEnd("bvh-build");


// 4. Raycast benchmark
const rays = Array.from({ length: RAY_COUNT }, () => {
  const origin = new Vector3(Math.random() * 500 - 250, 50, Math.random() * 500 - 250);
  const dir = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  return new Ray(origin, dir);
});

// oc3
console.time("oc3-raycast");
let ocHits = 0;
rays.forEach((r) => {
  const h = [];
  oc3.raycast(r, h);
  ocHits += h.length;
});
console.timeEnd("oc3-raycast");

// bvh
console.time("bvh-raycast");
let bvhHits = 0;
rays.forEach((r) => {
  const h = [];
  bvh.raycast(r);
  bvhHits += h.length;
});
console.timeEnd("bvh-raycast");

// 5. AABB query benchmark
const queryBox = new Box3().setFromCenterAndSize(new Vector3(0, 0, 0), new Vector3(50, 50, 50));

console.time("oc3-aabb");
const ocAABBs = [];
oc3.aabbQuery(queryBox, (id) => ocAABBs.push(id));
console.timeEnd("oc3-aabb");

console.time("bvh-aabb");
const bvhAABBs = new Set();
bvh.shapecast(
  {
    intersectsBounds: (box) => queryBox.intersectsBox(box),
    intersectsTriangle: () => true,
  },
  (triangleIndex) => {
      bvhAABBs.add(Math.floor(triangleIndex / 2));
  }
);
console.timeEnd("bvh-aabb");

// 6. Report
console.log(`
--- BENCHMARK RESULTS ---`);
console.log(`Raycast (${RAY_COUNT} rays, ${COUNT} objects):`);
console.log(`  oc3 hits: ${ocHits}`);
console.log(`  bvh hits: ${bvhHits}`);
console.log(`
AABB Query (${COUNT} objects):`);
console.log(`  oc3 hits: ${ocAABBs.length}`);
console.log(`  bvh hits: ${bvhAABBs.size}`);
console.log(`-------------------------
`);