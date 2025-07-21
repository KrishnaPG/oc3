// worker-backend.ts  (ESM, runs inside a DedicatedWorker)
import { Box3, Vector3, Frustum, Matrix4, Ray, Plane } from "three";

import { Octree } from "./core/Octree";
import { WorkerMsg } from "./worker-msg-types";

export class WorkerBackend {
  private octree = new Octree();
  private scope: DedicatedWorkerGlobalScope;

  constructor(scope: DedicatedWorkerGlobalScope) {
    this.scope = scope;
    scope.onmessage = (ev: MessageEvent<WorkerMsg>) => this.onMessage(ev.data);
  }

  private onMessage(msg: WorkerMsg) {
    switch (msg.type) {
      case "insert":
        this.octree.insert({
          box: new Box3().set(new Vector3(...msg.min), new Vector3(...msg.max)),
          id: msg.id,
        });
        break;

      case "remove":
        this.octree.remove({ id: msg.id, box: new Box3() }); // box unused
        break;

      case "update":
        this.octree.update({
          id: msg.id,
          box: new Box3().set(new Vector3(...msg.min), new Vector3(...msg.max)),
        });
        break;

      case "raycast": {
        const ray = new Ray(new Vector3(...msg.origin), new Vector3(...msg.direction));
        const hits: { id: number; distance: number }[] = [];
        // local helper that fills hits
        this.octree.raycast(ray, hits);
        this.reply(msg.id, hits);
        break;
      }

      case "aabbQuery": {
        const box = new Box3(new Vector3(...msg.min), new Vector3(...msg.max));
        const ids: number[] = [];
        this.octree.aabbQuery(box, (id) => ids.push(id));
        this.reply(msg.id, ids);
        break;
      }

      case "frustumQuery": {
        const p = msg.planes; // same buffer across threads, zero copy
        // Build Frustum without loops
        const frustum = new Frustum(
          new Plane(new Vector3(p[0], p[1], p[2]), p[3]),
          new Plane(new Vector3(p[4], p[5], p[6]), p[7]),
          new Plane(new Vector3(p[8], p[9], p[10]), p[11]),
          new Plane(new Vector3(p[12], p[13], p[14]), p[15]),
          new Plane(new Vector3(p[16], p[17], p[18]), p[19]),
          new Plane(new Vector3(p[20], p[21], p[22]), p[23])
        );
        const ids: number[] = [];
        this.octree.frustumQuery(frustum, (id) => ids.push(id));
        this.reply(msg.id, ids);
        break;
      }
    }
  }

  private reply(id: number, payload: any) {
    this.scope.postMessage({ id, payload });
  }
}

// instantiate inside worker
new WorkerBackend(self as unknown as DedicatedWorkerGlobalScope);
