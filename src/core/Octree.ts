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

/**
 * A dynamic, loose octree implementation for 3D spatial partitioning.
 * It is "loose" because objects that span multiple child nodes are stored
 * in the parent, rather than being split or duplicated.
 */
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
    this.root.box.copy(this.box);
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

/**
 * Represents a single node in the octree.
 * Each node has a bounding box and can either contain a list of objects
 * or have 8 child nodes.
 */
class Node {
  level: number;
  box: Box3;
  children: Node[] | null = null;
  head = -1; // index into ObjectStore linked list

  constructor(level: number, store: ObjectStore) {
    this.level = level;
    this.box = new Box3();
  }

  /**
   * Inserts an object into the octree.
   * The method recursively descends the tree to find the most appropriate node.
   *
   * Insertion Logic:
   * 1. If the object does not intersect the node's bounding box, do nothing.
   * 2. If the node has children, determine which child the object fits into.
   *    - If it fits entirely within one child, recursively call insert on that child.
   *    - If it spans multiple children, it is stored in the current (parent) node.
   * 3. If the node is a leaf (no children), add the object to this node's list.
   * 4. After adding, if the node exceeds `maxObjects` and has not reached `maxDepth`,
   *    it is split into 8 children, and its objects are redistributed.
   */
  insert(box: Box3, id: number, maxObjects: number, maxDepth: number, store: ObjectStore) {
    if (!this.box.intersectsBox(box)) return;

    if (this.children) {
      const index = this.getChildIndex(box);
      if (index !== -1) {
        this.children[index].insert(box, id, maxObjects, maxDepth, store);
        return;
      }
    }

    this.head = store.add(this.head, box, id);

    if (!this.children && this.level < maxDepth && store.count(this.head) >= maxObjects) {
      this.split(store, maxObjects, maxDepth);
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

  split(store: ObjectStore, maxObjects: number, maxDepth: number) {
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

    const oldHead = this.head;
    this.head = -1;
    let cur = oldHead;

    while (cur !== -1) {
      const { box, id, next } = store.get(cur);
      const index = this.getChildIndex(box);
      if (index !== -1) {
        this.children[index].insert(box, id, maxObjects, maxDepth, store);
      } else {
        this.head = store.add(this.head, box, id);
      }
      cur = next;
    }
  }

  /**
   * Determines which child node an object's bounding box fits into.
   * @returns The index of the child (0-7) if it fits completely, or -1 if it spans
   *          multiple children.
   */
  private getChildIndex(box: Box3): number {
    const { min, max } = this.box;
    const mid = tmpVec.addVectors(min, max).multiplyScalar(0.5);
    const { min: bmin, max: bmax } = box;

    const fitsInLowerX = bmax.x <= mid.x;
    const fitsInUpperX = bmin.x >= mid.x;
    const fitsInLowerY = bmax.y <= mid.y;
    const fitsInUpperY = bmin.y >= mid.y;
    const fitsInLowerZ = bmax.z <= mid.z;
    const fitsInUpperZ = bmin.z >= mid.z;

    if (fitsInLowerX && fitsInLowerY && fitsInLowerZ) return 0;
    if (fitsInUpperX && fitsInLowerY && fitsInLowerZ) return 1;
    if (fitsInLowerX && fitsInUpperY && fitsInLowerZ) return 2;
    if (fitsInUpperX && fitsInUpperY && fitsInLowerZ) return 3;
    if (fitsInLowerX && fitsInLowerY && fitsInUpperZ) return 4;
    if (fitsInUpperX && fitsInLowerY && fitsInUpperZ) return 5;
    if (fitsInLowerX && fitsInUpperY && fitsInUpperZ) return 6;
    if (fitsInUpperX && fitsInUpperY && fitsInUpperZ) return 7;

    return -1; // Object spans multiple children
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