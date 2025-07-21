# oc3
High-performance **Octree** with _Three.js_ and _React-Three-Fiber_ (r3f) compatibility


1. Goals  
   • Provide an **octree spatial-index** that is **blazing-fast** for three.js geometries and objects.  
   • Remain **framework-agnostic**: must work in vanilla three.js, r3f, A-Frame, Babylon (via adapters), etc.  
   • TypeScript-first, tree-shakeable ESM, zero runtime deps except `three`.  
   • Offer **both** an **acceleration structure** (for raycasting, frustum culling, nearest-neighbor, etc.) and **an optional ECS-friendly wrapper** for reactive scenes (r3f).  
   • Memory & CPU budget:  
     – ≤ 40 ns per insertion in hot path (≈ 25 M ops/s on M2).  
     – ≤ 4 bytes per empty child pointer (typed arrays).  
     – GC pressure ≈ 0 (pre-allocated pools).  

2. Use-Cases it is Optimised for
   a. **Raycasting** on 100 k meshes (r3f `<mesh>`).  
   b. **Frustum culling** for massive tilesets.  
   c. **Physics broad-phase** (AABB queries).  
   d. **LOD selection** (find all objects inside node).  
   e. **Streaming** - fast insert / remove / update as tiles stream in.  

3. Design Highlights  
   • Does **not** allocate on every insertion/removal (object pooling).  
   • Does allow **SIMD-like AABB tests** (SoA float32 arrays).  
   • **Reuses three.js math primitives** (`THREE.Box3`, `THREE.Vector3`, etc.) but **allows zero-copy** when caller already has flat arrays.  
   • Exposes **iterator-based API** to avoid large temporary arrays.  

4. API Surface (vanilla)  
   ```
   class Octree {
     constructor(box?: Box3, maxDepth?: number, maxObjects?: number);
     insert(object: Object3D | Box3): void;
     remove(object: Object3D | Box3): boolean;
     update(object: Object3D): void;          // fast move
     aabbQuery(box: Box3, visitor: (o)=>void): void;
     frustumQuery(frustum: Frustum, visitor: (o)=>void): void;
     raycast(ray: Ray, hits: Array<Intersection>): void;
     clear(): void;
   }
   ```
   • Each method is **iterative** (no recursion) to avoid call-stack overhead.  
   • `Object3D` is optional; plain AABB can be used for pure data.  

5. r3f (react-three-fiber) Integration  
   A thin React reconciler wrapper that:  
   • Subscribes to r3f’s `useFrame` to update moving objects via `Octree#update`.  
   • Provides `<OctreeProvider>` context so child meshes register themselves automatically via `React.useLayoutEffect`.  
   • Exposes a hook `useOctree()` to run spatial queries in user land.  

6. Memory Layout (SoA)  
   ```
   Float32Array(8*3)  // 8 corner xyz (static)
   Uint16Array(8)     // child indices (-1 = null)
   Uint16Array(8)     // object list heads (index into ObjectStore)
   ```
   ObjectStore is a **pool array** of fixed-size records (32 bytes):  
   ```
   struct ObjectRecord {
     float minX, minY, minZ, maxX, maxY, maxZ;
     uint32 userId;       // Object3D id or custom
   }
   ```
   Hot loops operate on contiguous Float32Array → **SIMD-friendly**.  

7. Build & Distribution  
   • `tsup` for ESM/CJS dual package.  
   • `exports` map with `"three"` as **peer dependency**.  
   • `"sideEffects": false` for full tree-shaking.  
   • Provides `three-octree/three` entry for three.js specific helpers, and `three-octree/core` for framework-agnostic core.  

8. Benchmark Harness  
   • vitest + @thi.ng/bench.  
   • Compare against `THREE.MeshBVH`, naive linear.  

9. Future expansions possible:
   • **Compressed octree** (SVO) for GPU storage.  
   • **WebWorkers** batch update API.  


Performance Notes
-----------------
• The `ObjectStore` is a **lock-free pool** backed by contiguous typed arrays → achieves **zero-allocation** hot path.  
• All recursive algorithms rewritten to **iterative loops** (not shown for brevity in split/query).  
• The r3f layer only attaches lightweight event listeners (`afterMatrixUpdate`) rather than diffing every frame.  

Oc3 keeps the **core octree engine** entirely decoupled from three.js or React, while providing thin, optional adapters that stay out of the critical path.

## License

MIT License.

## Contact

For issues or contributions, please open a pull request or issue on the repository.
