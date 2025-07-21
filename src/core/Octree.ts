import { Box3, Ray, Vector3 } from "three";
import { ObjectStore } from "./ObjectStore";

const tmpVec = new Vector3();

export interface OctreeOptions {
  maxDepth?: number;
  maxObjects?: number;
}

export interface RayCastHit {
  id: number;
  distance: number;
};

export class Octree {
  readonly box: Box3;
  readonly maxDepth: number;
  readonly maxObjects: number;

  private store = new ObjectStore();
  private root = new Node(0, this.store);

  constructor(box?: Box3, opts: OctreeOptions = {}) {
    this.box = box ?? new Box3().setFromCenterAndSize(new Vector3(), new Vector3(1, 1, 1).multiplyScalar(1e3));
    this.maxDepth = opts.maxDepth ?? 8;
    this.maxObjects = opts.maxObjects ?? 16;
  }

  insert(obj: { box: Box3; id?: number }) {
    this.root.insert(obj.box, obj.id ?? 0, this.maxObjects, this.maxDepth, this.store);
  }

  remove(obj: { box: Box3; id: number }) {
    this.root.remove(obj.box, obj.id, this.store);
  }

  update(obj: { box: Box3; id: number }) {
    this.remove(obj);
    this.insert(obj);
  }

  aabbQuery(box: Box3, visitor: (id: number) => void) {
    this.root.aabbQuery(box, visitor, this.store);
  }

  frustumQuery(frustum: any, visitor: (id: number) => void) {
    this.root.frustumQuery(frustum, visitor, this.store);
  }

  raycast(ray: Ray, out: RayCastHit[]): void {
    out.length = 0; // reuse caller's array to avoid GC churn
    const invDir = new Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z); // to avoid recalculations
    this.root.raycast(ray, invDir, out, this.store);
  }

  clear() {
    this.store.clear();
    this.root.clear();
  }
}

class Node {
  level: number;
  box: Box3;
  children: Node[] | null = null;
  head = -1; // index into ObjectStore linked list

  constructor(level: number, store: ObjectStore) {
    this.level = level;
    this.box = new Box3();
  }

  insert(box: Box3, id: number, maxObjects: number, maxDepth: number, store: ObjectStore) {
    // if (!box.intersectsBox(this.box)) return;

    if (!this.children && this.level < maxDepth && store.count(this.head) >= maxObjects) {
      this.split(store);
    }

    if (this.children) {
      for (const c of this.children) c.insert(box, id, maxObjects, maxDepth, store);
    } else {
      this.head = store.add(this.head, box, id);
    }
  }

  remove(box: Box3, id: number, store: ObjectStore) {
    if (!box.intersectsBox(this.box)) return;

    if (this.children) {
      for (const c of this.children) c.remove(box, id, store);
    } else {
      this.head = store.remove(this.head, id);
    }
  }

  split(store: ObjectStore) {
    const { min, max } = this.box;
    const mid = tmpVec.addVectors(min, max).multiplyScalar(0.5);

    this.children = Array.from({ length: 8 }, (_, i) => {
      const node = new Node(this.level + 1, store);
      const x = i & 1 ? mid.x : min.x;
      const y = i & 2 ? mid.y : min.y;
      const z = i & 4 ? mid.z : min.z;
      const x2 = i & 1 ? max.x : mid.x;
      const y2 = i & 2 ? max.y : mid.y;
      const z2 = i & 4 ? max.z : mid.z;
      node.box.set(new Vector3(x, y, z), new Vector3(x2, y2, z2));
      return node;
    });

    // Reinsert objects into children
    let cur = this.head;
    this.head = -1;
    while (cur !== -1) {
      const { box, id, next } = store.get(cur);
      for (const c of this.children!) c.insert(box, id, 16, 8, store);
      cur = next;
    }
  }

  aabbQuery(box: Box3, visitor: (id: number) => void, store: ObjectStore) {
    if (!box.intersectsBox(this.box)) return;
    if (this.children) {
      for (const c of this.children) c.aabbQuery(box, visitor, store);
    } else {
      let cur = this.head;
      while (cur !== -1) {
        const { id, box: objBox } = store.get(cur);
        if (box.intersectsBox(objBox)) visitor(id);
        cur = store.get(cur).next;
      }
    }
  }

  frustumQuery(frustum: any, visitor: (id: number) => void, store: ObjectStore) {
    if (!frustum.intersectsBox(this.box)) return;
    if (this.children) {
      for (const c of this.children) c.frustumQuery(frustum, visitor, store);
    } else {
      let cur = this.head;
      while (cur !== -1) {
        const { id, box } = store.get(cur);
        if (frustum.intersectsBox(box)) visitor(id);
        cur = store.get(cur).next;
      }
    }
  }

  raycast(ray: Ray, invDir: Vector3, out: RayCastHit[], store: ObjectStore): void {
    // iterative stack (pre-allocated 64 levels max)
    const stack: Node[] = new Array(64);
    let sp = 0;
    let node: Node | null = this;

    while (node) {
      if (node.children) {
        // push children in near-to-far order
        const tNear: number[] = [];
        for (let i = 0; i < 8; ++i) {
          const child = node.children[i];
          if (!child) continue;
          const t = intersectRayBoxSlab(ray, invDir, child.box);
          if (t !== Infinity) tNear.push(t, i);
        }
        // sort ascending
        tNear.sort((a, b) => a - b);
        for (let j = tNear.length - 2; j >= 0; j -= 2) {
          stack[sp++] = node.children[tNear[j + 1]];
        }
      } else {
        // leaf – test all objects in this node
        let idx = node.head;
        while (idx !== -1) {
          const rec = store.get(idx);
          const t = intersectRayBoxSlab(ray, invDir, rec.box);
          if (t !== Infinity) out.push({ id: rec.id, distance: t });
          idx = rec.next;
        }
      }
      node = sp ? stack[--sp] : null;
    }
  }

  clear() {
    this.children = null;
    this.head = -1;
  }
}

// ---------- Fastest AABB-Ray slab test ----------
function intersectRayBoxSlab(
  ray: Ray,
  invDir: Vector3,
  box: Box3
): number {
  const { origin } = ray;
  let tmin = (box.min.x - origin.x) * invDir.x;
  let tmax = (box.max.x - origin.x) * invDir.x;
  if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

  let tymin = (box.min.y - origin.y) * invDir.y;
  let tymax = (box.max.y - origin.y) * invDir.y;
  if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

  if (tmin > tymax || tymin > tmax) return Infinity;
  if (tymin > tmin) tmin = tymin;
  if (tymax < tmax) tmax = tymax;

  let tzmin = (box.min.z - origin.z) * invDir.z;
  let tzmax = (box.max.z - origin.z) * invDir.z;
  if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

  if (tmin > tzmax || tzmin > tmax) return Infinity;
  if (tzmin > tmin) tmin = tzmin;
  if (tzmax < tmax) tmax = tzmax;

  return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : Infinity);
}  