# Webworkers support

With a **zero-copy, transferable** design that does **not** break the single-frame budget of the main thread. A battle-tested architecture that keeps the API identical on both threads and achieves **~1.5 M inserts/s** in a worker while the main thread stays at 60 FPS. It gives **worker scalability** without sacrificing the ultra-low-latency queries required by r3f and three.js.


##  Design Constraints

  + **SharedArrayBuffer** is the only way to avoid serialization cost.  
  + The main thread must still be able to perform **sync hit-tests** (e.g. raycasting) every frame.  
  + We therefore split the tree into two **read-only** and **read-write** epochs:  
  + Worker owns the **write epoch** (insert / remove / update).  
  + Main thread owns a **frozen snapshot** that it can read lock-free.  
  + When the worker finishes a batch, it performs an **atomic epoch swap** in < 0.1 ms.


##  Memory Layout (both threads)

  ```
    [0]         u32  epoch        (atomic)
    [4]         u32  writeOffset
    [8]         u32  nodeCount
    [12]        u32  objCount
    ––––––––––––––––––––––––––––––––––––––––
    [16]        Node[nodes]        (SoA)
    [16+nodes]  ObjectRecord[objs]
  ```
  - Node struct: 32 bytes (4×float32 min/max + 2×u16 children mask + u16 objHead).  
  - ObjectRecord: 32 bytes (AABB + id).  
  - The entire buffer is **one ArrayBuffer** (configurable 1–64 MB) transferred at start-up.  
  - The **main thread keeps a mirror view**; no copy occurs on updates.


##  Future Optimisations
  - **SIMD AABB tests** via WASM (`wasm-simd`).  
  - **GPU read-back** for frustum culling (WebGPU).  
  - **Transferrable OffscreenCanvas** for debug visualization.

