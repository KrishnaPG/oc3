import { Box3, Frustum, Ray, Vector3 } from "three";
import { ObjectStore } from "./ObjectStore";


export interface IOctreeOptions {
  maxDepth?: number;
  maxObjects?: number;
}

export interface IRayCastHit {
  id: number;
  distance: number;
};

export interface IVisibleNode {
  node: Node;
  distance: number;   // camera to node center (for LOD)
  mouseHit?: {        // only present if the mouse ray hit something inside this node
    id: number;
    distance: number; // ray origin to target 
  };
}

export interface IVisibleNodeVisitor {
  (vn: IVisibleNode): boolean | void;
}

/**
 * A dynamic, loose octree implementation for 3D spatial partitioning.
 * It is "loose" because objects that span multiple child nodes are stored
 * in the parent, rather than being split or duplicated.
 * 
 * A maxDepth of 8, and maxObjects of 16, allows 16 x 8^8 = 268,435,456 objects;
 */
export class Octree {
  readonly box: Box3;
  readonly maxDepth: number;
  readonly maxObjects: number;

  private store = new ObjectStore();
  private root = new Node(0, this.store);

  constructor(box?: Box3, opts: IOctreeOptions = {}) {
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

  raycast(ray: Ray, out: IRayCastHit[]): void {
    out.length = 0; // reuse caller's array to avoid GC churn
    const invDir = new Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z); // to avoid recalculations
    this.root.raycast(ray, invDir, out, this.store);
  }

  /**
   * @exmple
      // ---- once per frame ----
      let closestPick: { id: number; distance: number } | null = null;
      
      octree.frustumRaycast(cameraFrustum, mouseRay, visibleNode => {
        // 1. LOD for every visible node
        const lod = lodFromDistance(distance);   // fast table lookup
        renderNode(node, lod);
        
        // 2. Picking: track the closest hit
        if (mouseHit && (!closestPick || mouseHit.distance < closestPick.distance)) {
          closestPick = mouseHit;
        }
      });

      // After traversal, use the closest pick
      if (closestPick) {
        highlight(closestPick.id);
      }
   */
  frustumRaycast(frustum: Frustum, ray: Ray, visitor: IVisibleNodeVisitor): void {
    const invDir = new Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z); // to avoid recalculations
    this.root.frustumRaycast(frustum, ray, invDir, visitor, this.store);
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
 * 
 * Note: Since this is a "loose" Octree node, non-leaf nodes may also have
 * objects (when they span multiple children they are kept in the parent).
 * In other words, some nodes may have both children **and** objects.
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
      const index = this.getChildIndex(box, store.scratch.tmpVec);
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

    // First try to remove from current node's objects
    const oldHead = this.head;
    if(this.head !== -1) this.head = store.remove(this.head, id);
    
    // If the object was found and removed from current node, we're done
    if (this.head !== oldHead) return;

    // If not found in current node and we have children, recurse into children
    if (this.children) {
      for (const c of this.children) c.remove(box, id, store);
    }
  }

  split(store: ObjectStore, maxObjects: number, maxDepth: number) {
    const tmpVec = store.scratch.tmpVec;
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
      const index = this.getChildIndex(box, tmpVec);
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
  private getChildIndex(box: Box3, tmpVec:Vector3): number {
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
    }
    // process objects in this node, if any
    store.traverse(this.head, store.get, ({box: objBox, id}) => {
      if (box.intersectsBox(objBox)) visitor(id);
    })
      // let cur = this.head;
      // while (cur !== -1) {
      //   const { id, box: objBox } = store.get(cur);
      //   if (box.intersectsBox(objBox)) visitor(id);
      //   cur = store.get(cur).next;
      // }
  }

  frustumQuery(frustum: Frustum, visitor: (id: number) => void, store: ObjectStore) {
    if (!frustum.intersectsBox(this.box)) return;
    // recurse into children
    if (this.children) {
      for (const c of this.children) c.frustumQuery(frustum, visitor, store);
    }
    // process objects in this node, if any
    store.traverse(this.head, store.get, ({ box, id }) => {
      if (frustum.intersectsBox(box)) visitor(id);
    })
    // let cur = this.head;
    // while (cur !== -1) {
    //   const { id, box, next } = store.get(cur);
    //   if (frustum.intersectsBox(box)) visitor(id);
    //   cur = next;
    // }
  }

  raycast(ray: Ray, invDir: Vector3, out: IRayCastHit[], store: ObjectStore): void {
    // iterative stack (pre-allocated 64 levels max)
    const stack: Node[] = store.scratch.stack;
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
      }
      // test all objects in this node (leaf or intermediate)
      store.traverse(node.head, store.getRaw, (rec) => {
        const t = intersectRayBounds(ray, invDir, rec.bounds);
        if (t !== Infinity) out.push({ id: rec.id, distance: t });
      })
      // let idx = node.head;
      // while (idx !== -1) {
      //   const rec = store.getRaw(idx);
      //   const t = intersectRayBounds(ray, invDir, rec.bounds);
      //   if (t !== Infinity) out.push({ id: rec.id, distance: t });
      //   idx = rec.next;
      // }
      node = sp ? stack[--sp] : null;
    }
  }

  frustumRaycast(frustum: Frustum, ray: Ray, invDir: Vector3, visitor: IVisibleNodeVisitor, store: ObjectStore) {
    const camPos = ray.origin;            // we need this for LOD distance
    const stack: Node[] = store.scratch.stack;  // iterative DFS

    let sp = 0;
    stack[sp++] = this;
    let closestHitDist = Infinity;      // early-out threshold for ray

    while (sp) {
      const node = stack[--sp];
      if (!frustum.intersectsBox(node.box)) continue;

      // Distance to camera (cheap aabb center)
      const center = store.scratch.tmpVec.copy(node.box.min).add(node.box.max).multiplyScalar(0.5);
      const dCam = center.distanceTo(camPos);

      // -- Frustum part: only accept the node if it has objects or children --
      const hasObjects = node.head !== -1;
      const hasChildren = node.children !== null;
      
      // Skip empty nodes with no children nor objects
      if (!hasObjects && !hasChildren) continue;

      const visibleNode: IVisibleNode = { node, distance: dCam };     // reserve slot; mouseHit may come later

      // -- Ray part: skips if we already have something closer --
      const tNode = intersectRayBoxSlab(ray, invDir, node.box);
      if (tNode < closestHitDist && hasObjects) {
        // test objects for ray testing
        store.traverse(node.head, store.getRaw, (rec) => {
          const t = intersectRayBounds(ray, invDir, rec.bounds);
          if (t < closestHitDist) {
            closestHitDist = t;
            visibleNode.mouseHit = { id: rec.id, distance: t }; // record the mouse hit
          }
        });
      }
      
      // Call the visitor for this visible node
      const bShouldStop = visitor(visibleNode);
      if (bShouldStop) return; // visitor requested early termination
 
      // No sort, just push children in fixed order
      node.children?.forEach(child => stack[sp++] = child);
    }
  }

  clear() {
    this.children = null;
    this.head = -1;
  }
}

// ---------- Fastest AABB-Ray slab test ----------
function intersectRayBounds(
  ray: Ray,
  invDir: Vector3,
  bounds: Float32Array<ArrayBuffer>
): number {
  const { origin } = ray;
  const [minX, minY, minZ, maxX, maxY, maxZ] = bounds;
  let tMin = (minX - origin.x) * invDir.x;
  let tMax = (maxX - origin.x) * invDir.x;
  if (tMin > tMax) [tMin, tMax] = [tMax, tMin];

  let tYMin = (minY - origin.y) * invDir.y;
  let tYMax = (maxY - origin.y) * invDir.y;
  if (tYMin > tYMax) [tYMin, tYMax] = [tYMax, tYMin];

  if (tMin > tYMax || tYMin > tMax) return Infinity;
  if (tYMin > tMin) tMin = tYMin;
  if (tYMax < tMax) tMax = tYMax;

  let tZMin = (minZ - origin.z) * invDir.z;
  let tZMax = (maxZ - origin.z) * invDir.z;
  if (tZMin > tZMax) [tZMin, tZMax] = [tZMax, tZMin];

  if (tMin > tZMax || tZMin > tMax) return Infinity;
  if (tZMin > tMin) tMin = tZMin;
  if (tZMax < tMax) tMax = tZMax;

  return tMin >= 0 ? tMin : (tMax >= 0 ? tMax : Infinity);
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