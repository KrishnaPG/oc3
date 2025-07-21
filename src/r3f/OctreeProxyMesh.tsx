import React, { forwardRef, useEffect, useRef, useImperativeHandle, JSX } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, Mesh, Vector3 } from "three";
import { useOctreeProxy } from "./OctreeProvider";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { Octree } from "../core/Octree";
import { OctreeProxy } from "../worker-proxy";

/* ---------- global Zustand store (bypass React) ---------- */
interface MeshStore {
  queue: Map<number, { min: Vector3; max: Vector3 }>;
  add(id: number, min: Vector3, max: Vector3): void;
  remove(id: number): void;
  flush(): MapIterator<[Number,{ min: Vector3; max: Vector3 }]>;
}
const meshStore = create<MeshStore>()(
  subscribeWithSelector((set, get) => ({
    queue: new Map(),
    add(id, min, max) {
      get().queue.set(id, { min, max });
    },
    remove(id) {
      get().queue.delete(id);
    },
    flush() {
      const entries = get().queue.entries();
      get().queue.clear();
      return entries;
    },
  }))
);

/* ---------- tiny worker helper ---------- */
const batch: any[] = [];
let frameScheduled = false;
function scheduleBatch(octree: OctreeProxy) {
  if (frameScheduled) return;
  frameScheduled = true;
  queueMicrotask(() => {
    frameScheduled = false;
    if (batch.length) {
      octree.postBatch(batch.splice(0));
    }
  });
}

/**
 * OctreeMesh
 *
 * A React-Three-Fiber mesh that automatically registers its world-space AABB
 * in the `oc3` octree (Web-Worker backend) **outside the React render loop**.
 *
 * ## Zero-React-render animation
 * ```tsx
 * const ref = useRef<Mesh>(null);
 * useFrame(() => {
 *   ref.current.position.y = Math.sin(Date.now() * 0.001) * 10;
 * });
 * <OctreeMesh ref={ref}>…</OctreeMesh>
 * ```
 *
 * ## react-spring / framer-motion
 * ```tsx
 * const { position } = useSpring({ position: [0, 10, 0] });
 * <OctreeMesh position={position.get()}>…</OctreeMesh>
 * ```
 *
 * ## Imperative matrix updates
 * ```tsx
 * const ref = useRef<Mesh>(null);
 * ref.current.matrixWorldNeedsUpdate = true;
 * ref.current.position.set(…);
 * ```
 *
 * ## Global Zustand store (bypass React entirely)
 * ```ts
 * import { meshStore } from 'oc3/r3f/OctreeMesh';
 * meshStore.subscribe(
 *   (state) => state.queue,
 *   (q) => console.log('pending updates', q.size),
 *   { fireImmediately: false }
 * );
 * ```
 */
export const OctreeProxyMesh = forwardRef<Mesh, JSX.IntrinsicElements["mesh"]>(({ id: userId, children, ...meshProps }, ref) => {
  const meshRef = useRef<Mesh>(null!);
  const octree = useOctreeProxy();
  const objId = userId ?? meshRef.current?.id ?? React.useId(); // stable once

  // expose mesh ref to caller
  useImperativeHandle(ref, () => meshRef.current);

  /* --- mount / unmount --- */
  useEffect(() => {
    const onMatrixUpdate = () => {
      if (!meshRef.current) return;
      meshRef.current.updateMatrixWorld(true);
      const box = new Box3().setFromObject(meshRef.current);
      meshStore.getState().add(objId, box.min, box.max);
      scheduleBatch(octree);
    };

    const mesh = meshRef.current;
    // mesh.addEventListener("afterMatrixUpdate", onMatrixUpdate); <- FIX THIS
    // initial insert
    onMatrixUpdate();

    return () => {
      // mesh.removeEventListener("afterMatrixUpdate", onMatrixUpdate); <- FIX THIS
      meshStore.getState().remove(objId);
      batch.push({ cmd: "remove", id: objId });
      scheduleBatch(octree);
    };
  }, [objId, octree]);

  /* --- one flush per frame --- */
  useFrame(() => {
    for (const [id, { min, max }] of meshStore.getState().flush()) {
      batch.push({
        cmd: "update",
        id,
        min: min.toArray(),
        max: max.toArray(),
      });
    }
  });

  return (
    <mesh {...meshProps} ref={meshRef}>
      {children}
    </mesh>
  );
});
