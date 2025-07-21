import { Box3, Vector3 } from "three";

const RECORD_BYTES = 32;

export class ObjectStore {
  private buffer = new ArrayBuffer(1024 * RECORD_BYTES);
  private float32 = new Float32Array(this.buffer);
  private int32 = new Int32Array(this.buffer);
  private freeList: number[] = [];
  private next = 0;

  get capacity() {
    return this.buffer.byteLength / RECORD_BYTES;
  }

  get(idx: number) {
    const o = idx * 8;
    return {
      minX: this.float32[o],
      minY: this.float32[o + 1],
      minZ: this.float32[o + 2],
      maxX: this.float32[o + 3],
      maxY: this.float32[o + 4],
      maxZ: this.float32[o + 5],
      id: this.int32[o + 6],
      next: this.int32[o + 7],
      box: new Box3(
        new Vector3(this.float32[o], this.float32[o + 1], this.float32[o + 2]),
        new Vector3(this.float32[o + 3], this.float32[o + 4], this.float32[o + 5])
      ),
    };
  }

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
    this.int32[o + 7] = head;
    return idx;
  }

  remove(head: number, id: number): number {
    let prev = -1;
    let cur = head;
    while (cur !== -1) {
      if (this.int32[cur * 8 + 6] === id) {
        const next = this.int32[cur * 8 + 7];
        if (prev === -1) return next;
        this.int32[prev * 8 + 7] = next;
        this.freeList.push(cur);
        return head;
      }
      prev = cur;
      cur = this.int32[cur * 8 + 7];
    }
    return head;
  }

  count(head: number): number {
    let c = 0;
    while (head !== -1) {
      c++;
      head = this.int32[head * 8 + 7];
    }
    return c;
  }

  clear() {
    this.next = 0;
    this.freeList.length = 0;
  }

  private grow() {
    const cap = this.capacity;
    const newBuf = new ArrayBuffer(this.buffer.byteLength * 2);
    new Float32Array(newBuf).set(this.float32);
    new Uint32Array(newBuf).set(this.int32);
    this.buffer = newBuf;
    this.float32 = new Float32Array(this.buffer);
    this.int32 = new Int32Array(this.buffer);
  }
}
