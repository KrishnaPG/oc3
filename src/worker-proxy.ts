// worker-proxy.ts  (runs on main thread)
import { Box3, Frustum, Ray, Vector3 } from "three";

import type { Vec3Array, RaycastMsg, AabbQueryMsg, FrustumQueryMsg } from "./worker-msg-types";

interface Pending {
  resolve: (value: any) => void;
}

export class OctreeProxy {
  private worker: Worker;
  private pending = new Map<number, Pending>();
  private msgId = 0;

  constructor(worker: Worker) {
    this.worker = worker;
    worker.onmessage = (ev: MessageEvent<{ id: number; payload: any }>) => {
      const { id, payload } = ev.data;
      this.pending.get(id)?.resolve(payload);
      this.pending.delete(id);
    };
  }

  /** Promise resolves when worker is ready (empty first message). */
  ready(): Promise<void> {
    return new Promise<void>((res) => {
      const onReady = () => {
        this.worker.removeEventListener("message", onReady);
        res();
      };
      this.worker.addEventListener("message", onReady, { once: true });
    });
  }

  /* ---------- Write API (fire-and-forget batch) ---------- */
  postBatch(batch: any[]) {
    this.worker.postMessage(batch);
  }

  /* ---------- Read API (async promise-based) ---------- */

  /** Raycast → Array<{id:number, distance:number}> */
  raycast(origin: Vector3, direction: Vector3): Promise<{ id: number; distance: number }[]> {
    return this.request<RaycastMsg>("raycast", {
      origin: origin.toArray() as Vec3Array,
      direction: direction.toArray() as Vec3Array,
    });
  }

  /** AABB overlap → number[] ids */
  aabbQuery(box: Box3): Promise<number[]> {
    return this.request<AabbQueryMsg>("aabbQuery", {
      min: box.min.toArray() as Vec3Array,
      max: box.max.toArray() as Vec3Array,
    });
  }

  /** Frustum culling → number[] ids */
  frustumQuery(frustum: Frustum): Promise<number[]> {
    // 6 planes × 4 floats = 24 numbers
    const planes = new Float32Array(24);
    frustum.planes.forEach((p, i) => {
      const n = p.normal;
      planes.set([n.x, n.y, n.z, p.constant], i * 4);
    });
    return this.request<FrustumQueryMsg>("frustumQuery", { planes });
  }

  /* ---------- internal ---------- */
  private request<T>(type: string, payload: Record<string, unknown>) {
    return new Promise<any>((resolve) => {
      const id = ++this.msgId;
      this.pending.set(id, { resolve });
      this.worker.postMessage({ ...payload, type, id });
    });
  }
}
