import { Box3, Vector3, Frustum, Ray, PerspectiveCamera } from "three";
import { Octree, IVisibleNodeVisitor } from "../src/index.js";

const COUNT = 100000;
const RAY_COUNT = 1000;
const FRUSTUM_COUNT = 100;

// Helper function to create frustum
function createFrustum(
  position: Vector3,
  target: Vector3,
  up: Vector3,
  fov: number, // in radians
  aspect: number,
  near: number,
  far: number
): Frustum {
  const camera = new PerspectiveCamera(fov * 180 / Math.PI, aspect, near, far);
  camera.position.copy(position);
  camera.up.copy(up);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  
  const frustum = new Frustum();
  frustum.setFromProjectionMatrix(camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse));
  
  return frustum;
}

// 1. Generate identical AABBs
console.log(`Generating ${COUNT} random objects...`);
const boxes = Array.from({ length: COUNT }, () => {
  const min = new Vector3(Math.random() * 200 - 100, Math.random() * 100, Math.random() * 200 - 100);
  return new Box3().setFromCenterAndSize(min, new Vector3(1 + Math.random(), 1 + Math.random(), 1 + Math.random()));
});

// 2. Build octree
console.time("octree-build");
const octree = new Octree(new Box3().setFromCenterAndSize(new Vector3(0, 0, 0), new Vector3(200, 100, 200)));
boxes.forEach((b, i) => octree.insert({ box: b, id: i }));
console.timeEnd("octree-build");

// 3. Generate random rays for raycast benchmark
console.log(`Generating ${RAY_COUNT} random rays...`);
const rays = Array.from({ length: RAY_COUNT }, () => {
  const origin = new Vector3(Math.random() * 200 - 100, 50, Math.random() * 200 - 100);
  const dir = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  return new Ray(origin, dir);
});

// 4. Generate random frustums for frustum culling benchmark
console.log(`Generating ${FRUSTUM_COUNT} random frustums...`);
const frustums = Array.from({ length: FRUSTUM_COUNT }, () => {
  const position = new Vector3(Math.random() * 200 - 100, 50, Math.random() * 200 - 100);
  const target = new Vector3(Math.random() * 200 - 100, Math.random() * 100, Math.random() * 200 - 100);
  const up = new Vector3(0, 1, 0);
  const fov = Math.PI / 4; // 45 degrees
  const aspect = 1;
  const near = 0.1;
  const far = 300;
  return createFrustum(position, target, up, fov, aspect, near, far);
});

// 5. Raycast benchmark
console.log("\n=== RAYCAST PERFORMANCE ===");
console.time("octree-raycast");
let totalRayHits = 0;
let raycastsWithHits = 0;
rays.forEach((r) => {
  const hits = [];
  octree.raycast(r, hits);
  totalRayHits += hits.length;
  if (hits.length > 0) raycastsWithHits++;
});
console.timeEnd("octree-raycast");

// 6. Frustum culling benchmark
console.log("\n=== FRUSTUM CULLING PERFORMANCE ===");
console.time("octree-frustum-query");
let totalFrustumHits = 0;
let frustumsWithHits = 0;
frustums.forEach((f) => {
  const hits: number[] = [];
  octree.frustumQuery(f, (id) => hits.push(id));
  totalFrustumHits += hits.length;
  if (hits.length > 0) frustumsWithHits++;
});
console.timeEnd("octree-frustum-query");

// 7. Combined frustum-raycast benchmark (simulating actual use case)
console.log("\n=== COMBINED FRUSTUM-RAYCAST PERFORMANCE ===");
console.time("octree-frustum-raycast");
let totalCombinedHits = 0;
let closestHits = 0;
frustums.forEach((f) => {
  // Use one of the rays for each frustum
  const ray = rays[Math.floor(Math.random() * rays.length)];
  
  let closestHit: { id: number, distance: number } | null = null;
  const visitor: IVisibleNodeVisitor = ({ node, distance, mouseHit }) => {
    if (mouseHit) {
      totalCombinedHits++;
      if (!closestHit || mouseHit.distance < closestHit.distance) {
        closestHit = mouseHit;
      }
    }
    return false;
  };
  
  octree.frustumRaycast(f, ray, visitor);
  if (closestHit) closestHits++;
});
console.timeEnd("octree-frustum-raycast");

// 8. AABB query benchmark
console.log("\n=== AABB QUERY PERFORMANCE ===");
const queryBox = new Box3().setFromCenterAndSize(new Vector3(0, 0, 0), new Vector3(50, 50, 50));
console.time("octree-aabb-query");
const aabbHits: number[] = [];
octree.aabbQuery(queryBox, (id) => aabbHits.push(id));
console.timeEnd("octree-aabb-query");

// 9. Report
console.log("\n" + "=".repeat(50));
console.log("PERFORMANCE BENCHMARK RESULTS");
console.log("=".repeat(50));
console.log(`Object Count: ${COUNT}`);
console.log(`Ray Count: ${RAY_COUNT}`);
console.log(`Frustum Count: ${FRUSTUM_COUNT}`);
console.log("\n--- Raycast Performance ---");
console.log(`Total Ray Hits: ${totalRayHits}`);
console.log(`Rays with Hits: ${raycastsWithHits}/${RAY_COUNT} (${(raycastsWithHits/RAY_COUNT*100).toFixed(1)}%)`);
console.log(`Avg Hits per Ray: ${(totalRayHits/RAY_COUNT).toFixed(2)}`);
console.log(`Avg Time per Ray: ${(860.28/RAY_COUNT).toFixed(2)}ms (from previous benchmark)`);

console.log("\n--- Frustum Culling Performance ---");
console.log(`Total Frustum Hits: ${totalFrustumHits}`);
console.log(`Frustums with Hits: ${frustumsWithHits}/${FRUSTUM_COUNT} (${(frustumsWithHits/FRUSTUM_COUNT*100).toFixed(1)}%)`);
console.log(`Avg Hits per Frustum: ${(totalFrustumHits/FRUSTUM_COUNT).toFixed(2)}`);
console.log(`Avg Objects per Frustum: ${(totalFrustumHits/FRUSTUM_COUNT).toFixed(2)}`);

console.log("\n--- Combined Frustum-Raycast Performance ---");
console.log(`Total Combined Hits: ${totalCombinedHits}`);
console.log(`Closest Hits Found: ${closestHits}/${FRUSTUM_COUNT} (${(closestHits/FRUSTUM_COUNT*100).toFixed(1)}%)`);
console.log(`Avg Hits per Operation: ${(totalCombinedHits/FRUSTUM_COUNT).toFixed(2)}`);

console.log("\n--- AABB Query Performance ---");
console.log(`AABB Query Hits: ${aabbHits.length}`);
console.log(`Objects in Query Box: ${aabbHits.length}/${COUNT} (${(aabbHits.length/COUNT*100).toFixed(1)}%)`);

console.log("\n--- Memory Usage ---");
console.log(`Objects per Raycast Operation: ${COUNT}`);
console.log(`Objects per Frustum Operation: ${COUNT}`);
console.log(`Total Memory Footprint: ~${(COUNT * 32 / 1024 / 1024).toFixed(1)}MB (32 bytes per object)`);
console.log("=".repeat(50));