import { Box3, Vector3 } from "three";

/**
 * The number of bytes allocated for a single object record.
 * - 6 floats for the Box3 (min/max vectors): 6 * 4 = 24 bytes
 * - 1 signed integer for the user-provided ID: 1 * 4 = 4 bytes
 * - 1 signed integer for the next-pointer in the linked list: 1 * 4 = 4 bytes
 * Total: 32 bytes
 */
const RECORD_BYTES = 32;

export interface DataBox {
  box: Box3,
  id: number,
  next: number
};
export interface DataBounds {
  bounds: Float32Array,
  id: number,
  next: number
};

/**
 * A highly optimized, array-backed pool allocator for object records.
 * This class uses a single contiguous ArrayBuffer to store all object data,
 * which avoids memory fragmentation and garbage collection pressure.
 *
 * Internally, it manages a linked list of objects for each octree node.
 * It uses a free list to recycle memory slots from removed objects.
 */
export class ObjectStore {
  /** The main buffer holding all object data. */
  private buffer = new ArrayBuffer(1024 * RECORD_BYTES);
  /** A Float32 view into the buffer for accessing coordinate data. */
  private float32 = new Float32Array(this.buffer);
  /** An Int32 view into the buffer for accessing ID and pointer data. */
  private int32 = new Int32Array(this.buffer);

  /** just temp variables, to avoid repeat allocations in loops */
  public scratch = {
    tmpVec: new Vector3(),
    stack: new Array(64)
  }

  /**
   * A list of indices that have been freed. When adding a new object,
   * these recycled slots are used before expanding the store.
   */
  private freeList: number[] = [];
  /** The index of the next available slot if the free list is empty. */
  private next = 0;

  /** The total number of objects the store can currently hold. */
  get capacity() {
    return this.buffer.byteLength / RECORD_BYTES;
  }

  /**
   * Retrieves the data for an object at a given index.
   * Note: This creates a new Box3 object on every call. For performance-critical
   * code, access the raw float32/int32 arrays directly.
   */
  get(idx: number): DataBox {
    const o = idx * 8; // 8 x 4-byte words per record
    return {
      box: new Box3(
        new Vector3(this.float32[o], this.float32[o + 1], this.float32[o + 2]),
        new Vector3(this.float32[o + 3], this.float32[o + 4], this.float32[o + 5])
      ),
      id: this.int32[o + 6],
      next: this.int32[o + 7],
    };
  }

  getRaw(idx: number): DataBounds {
    const o = idx * 8; // 8 x 4-byte words per record
    return {
      bounds: this.float32.subarray(o, o + 6), //[minX, minY, minZ, maxX, maxY, maxZ]
      id: this.int32[o + 6],
      next: this.int32[o + 7],
    };
  }

  getNext(idx: number): number {
    const o = idx * 8; // 8 x 4-byte words per record
    return this.int32[o + 7];
  }

  /**
   * Adds an object to a linked list and returns the new head of the list.
   * @param head The current head of the linked list.
   * @param box The bounding box of the object.
   * @param id The user-defined ID of the object.
   * @returns The new head of the linked list (the index of the added object).
   */
  add(head: number, box: Box3, id: number): number {
    const idx = this.freeList.pop() ?? this.next++;
    if (idx >= this.capacity) this.grow();

    const o = idx * 8;
    const { min, max } = box;
    this.float32[o] = min.x;
    this.float32[o + 1] = min.y;
    this.float32[o + 2] = min.z;
    this.float32[o + 3] = max.x;
    this.float32[o + 4] = max.y;
    this.float32[o + 5] = max.z;
    this.int32[o + 6] = id;
    this.int32[o + 7] = head; // Point to the old head
    return idx; // The new head is the current object
  }

  /**
   * Removes an object from a linked list.
   * @param head The head of the list to remove from.
   * @param id The ID of the object to remove.
   * @returns The new head of the linked list.
   */
  remove(head: number, id: number): number {
    let prev = -1;
    let cur = head;
    while (cur !== -1) {
      if (this.int32[cur * 8 + 6] === id) {
        const next = this.int32[cur * 8 + 7];
        if (prev === -1) {
          // This was the head of the list
          this.freeList.push(cur);
          return next;
        }
        // Splice the node out of the list
        this.int32[prev * 8 + 7] = next;
        this.freeList.push(cur);
        return head;
      }
      prev = cur;
      cur = this.int32[cur * 8 + 7];
    }
    return head;
  }

  /**
   * Counts the number of objects in a linked list by traversing it.
   *
   * Design Choice: This is an O(n) operation. We chose not to store a separate
   * count for each list to keep the ObjectStore's memory footprint minimal and
   * to prioritize the performance of the more frequent `add` and `remove`
   * operations. Storing counts would require adding overhead to every node
   * in the higher-level Octree structure, which this generic store is unaware of.
   * This method should be used sparingly, primarily during the `split` operation.
   */
  count(head: number): number {
    let c = 0;
    while (head !== -1) {
      c++;
      head = this.int32[head * 8 + 7];
    }
    return c;
  }

  /** Clears the store and resets all pointers. */
  clear() {
    this.next = 0;
    this.freeList.length = 0;
  }

  /**
   * Doubles the size of the internal buffer.
   * This is a costly operation, but its cost is amortized over many insertions.
   * The exponential growth can lead to large memory allocations.
   */
  private grow() {
    const newBuf = new ArrayBuffer(this.buffer.byteLength * 2);
    new Int32Array(newBuf).set(this.int32);
    this.buffer = newBuf;
    this.float32 = new Float32Array(this.buffer);
    this.int32 = new Int32Array(this.buffer);
  }

  /**
   * Traverse method for performance
   * 
   * @example:
      store.traverse(0, store.get, (data: DataBox) => {
        console.log(data.id);
        return false;
      });

      store.traverse(0, store.getRaw, (data: DataBounds) => {
        console.log(data.id, data.bounds);
        return false;
      });
   */
  public traverse<T extends DataBox | DataBounds>(cur: number,
    getFn: (idx: number) => T,
    cb: (d: T) => void | boolean) {
    while (cur !== -1) {
      const d = getFn.call(this, cur);
      if (cb(d)) return; // stop if the callback returns any value, else continue
      cur = d.next;
    }
  }
}