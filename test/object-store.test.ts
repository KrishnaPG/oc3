// object-store.test.ts
import { describe, it, expect } from 'bun:test';
import { ObjectStore, DataBox, DataBounds } from '../src/core/ObjectStore';
import { Box3, Vector3 } from 'three';

describe('ObjectStore', () => {
  it('should add and retrieve objects correctly', () => {
    const store = new ObjectStore();

    // Add an object
    const box = new Box3(new Vector3(1, 2, 3), new Vector3(4, 5, 6));
    const id = 42;
    const head = store.add(-1, box, id);

    // Verify the head is the index of the added object
    expect(head).toBeGreaterThanOrEqual(0);

    // Retrieve the object
    const data = store.get(head);
    expect(data.box).toEqual(box);
    expect(data.id).toBe(id);
    expect(data.next).toBe(-1); // Should be the end of the list
  });

  it('should handle linked list correctly', () => {
    const store = new ObjectStore();

    // Add multiple objects to create a linked list
    const box1 = new Box3(new Vector3(1, 2, 3), new Vector3(4, 5, 6));
    const box2 = new Box3(new Vector3(7, 8, 9), new Vector3(10, 11, 12));
    const box3 = new Box3(new Vector3(13, 14, 15), new Vector3(16, 17, 18));

    let head = store.add(-1, box1, 1);
    head = store.add(head, box2, 2);
    head = store.add(head, box3, 3);

    // Verify the linked list structure
    let current = head;
    let count = 0;

    while (current !== -1) {
      count++;
      const data = store.get(current);
      
      if (count === 1) {
        expect(data.id).toBe(3);
        expect(data.next).toBeGreaterThanOrEqual(0);
      } else if (count === 2) {
        expect(data.id).toBe(2);
        expect(data.next).toBeGreaterThanOrEqual(0);
      } else if (count === 3) {
        expect(data.id).toBe(1);
        expect(data.next).toBe(-1);
      }
      
      current = data.next;
    }

    expect(count).toBe(3);
  });

  it('should remove objects correctly', () => {
    const store = new ObjectStore();

    // Add objects
    const box1 = new Box3(new Vector3(1, 2, 3), new Vector3(4, 5, 6));
    const box2 = new Box3(new Vector3(7, 8, 9), new Vector3(10, 11, 12));
    const box3 = new Box3(new Vector3(13, 14, 15), new Vector3(16, 17, 18));

    let head = store.add(-1, box1, 1);
    head = store.add(head, box2, 2);
    head = store.add(head, box3, 3);

    // Remove the middle object (id=2)
    head = store.remove(head, 2);

    // Verify the linked list structure
    let current = head;
    const ids: number[] = [];

    while (current !== -1) {
      const data = store.get(current);
      ids.push(data.id);
      current = data.next;
    }

    expect(ids).toEqual([3, 1]);
  });

  it('should remove head object correctly', () => {
    const store = new ObjectStore();

    // Add objects
    const box1 = new Box3(new Vector3(1, 2, 3), new Vector3(4, 5, 6));
    const box2 = new Box3(new Vector3(7, 8, 9), new Vector3(10, 11, 12));

    let head = store.add(-1, box1, 1);
    head = store.add(head, box2, 2);

    // Remove the head object (id=2)
    head = store.remove(head, 2);

    // Verify the linked list structure
    let current = head;
    const ids: number[] = [];

    while (current !== -1) {
      const data = store.get(current);
      ids.push(data.id);
      current = data.next;
    }

    expect(ids).toEqual([1]);
  });

  it('should count objects correctly', () => {
    const store = new ObjectStore();

    // Add objects
    const box1 = new Box3(new Vector3(1, 2, 3), new Vector3(4, 5, 6));
    const box2 = new Box3(new Vector3(7, 8, 9), new Vector3(10, 11, 12));
    const box3 = new Box3(new Vector3(13, 14, 15), new Vector3(16, 17, 18));

    let head = store.add(-1, box1, 1);
    head = store.add(head, box2, 2);
    head = store.add(head, box3, 3);

    // Count objects
    const count = store.count(head);
    expect(count).toBe(3);
  });

  it('should get raw data correctly', () => {
    const store = new ObjectStore();

    // Add an object
    const box = new Box3(new Vector3(1, 2, 3), new Vector3(4, 5, 6));
    const id = 42;
    const head = store.add(-1, box, id);

    // Get raw data
    const rawData = store.getRaw(head);
    
    expect(rawData.id).toBe(id);
    expect(rawData.next).toBe(-1);
    expect(rawData.bounds).toBeInstanceOf(Float32Array);
    expect(rawData.bounds.length).toBe(6);
    
    // Verify bounds values
    expect(rawData.bounds[0]).toBe(1); // minX
    expect(rawData.bounds[1]).toBe(2); // minY
    expect(rawData.bounds[2]).toBe(3); // minZ
    expect(rawData.bounds[3]).toBe(4); // maxX
    expect(rawData.bounds[4]).toBe(5); // maxY
    expect(rawData.bounds[5]).toBe(6); // maxZ
  });

  it('should traverse objects correctly', () => {
    const store = new ObjectStore();

    // Add objects
    const box1 = new Box3(new Vector3(1, 2, 3), new Vector3(4, 5, 6));
    const box2 = new Box3(new Vector3(7, 8, 9), new Vector3(10, 11, 12));
    const box3 = new Box3(new Vector3(13, 14, 15), new Vector3(16, 17, 18));

    let head = store.add(-1, box1, 1);
    head = store.add(head, box2, 2);
    head = store.add(head, box3, 3);

    // Traverse with get function
    const visitedIds: number[] = [];
    store.traverse(head, store.get, (data: DataBox) => {
      visitedIds.push(data.id);
    });

    expect(visitedIds).toEqual([3, 2, 1]);

    // Traverse with getRaw function
    const visitedRawIds: number[] = [];
    store.traverse(head, store.getRaw, (data: DataBounds) => {
      visitedRawIds.push(data.id);
    });

    expect(visitedRawIds).toEqual([3, 2, 1]);
  });

  it('should handle early termination in traverse', () => {
    const store = new ObjectStore();

    // Add objects
    const box1 = new Box3(new Vector3(1, 2, 3), new Vector3(4, 5, 6));
    const box2 = new Box3(new Vector3(7, 8, 9), new Vector3(10, 11, 12));
    const box3 = new Box3(new Vector3(13, 14, 15), new Vector3(16, 17, 18));

    let head = store.add(-1, box1, 1);
    head = store.add(head, box2, 2);
    head = store.add(head, box3, 3);

    // Traverse with early termination
    const visitedIds: number[] = [];
    store.traverse(head, store.get, (data: DataBox) => {
      visitedIds.push(data.id);
      // Stop after the second object
      return visitedIds.length === 2;
    });

    expect(visitedIds).toEqual([3, 2]);
  });

  it('should grow buffer when capacity is exceeded', () => {
    const store = new ObjectStore();
    const initialCapacity = store.capacity;

    // Add enough objects to exceed the initial capacity
    let head = -1;
    for (let i = 0; i < initialCapacity + 10; i++) {
      const box = new Box3(new Vector3(i, i, i), new Vector3(i + 1, i + 1, i + 1));
      head = store.add(head, box, i);
    }

    // Verify the capacity has increased
    expect(store.capacity).toBeGreaterThan(initialCapacity);

    // Verify all objects are still accessible
    const visitedIds: number[] = [];
    store.traverse(head, store.get, (data: DataBox) => {
      visitedIds.push(data.id);
    });

    expect(visitedIds.length).toBe(initialCapacity + 10);
  });

  it('should reuse memory slots from free list', () => {
    const store = new ObjectStore();

    // Add objects
    const box1 = new Box3(new Vector3(1, 2, 3), new Vector3(4, 5, 6));
    const box2 = new Box3(new Vector3(7, 8, 9), new Vector3(10, 11, 12));

    let head = store.add(-1, box1, 1);
    head = store.add(head, box2, 2);

    // Get the current capacity
    const capacityBeforeRemove = store.capacity;

    // Remove an object
    head = store.remove(head, 1);

    // Add a new object (should reuse the freed slot)
    const box3 = new Box3(new Vector3(13, 14, 15), new Vector3(16, 17, 18));
    head = store.add(head, box3, 3);

    // Verify the capacity hasn't changed
    expect(store.capacity).toBe(capacityBeforeRemove);

    // Verify all objects are accessible
    const visitedIds: number[] = [];
    store.traverse(head, store.get, (data: DataBox) => {
      visitedIds.push(data.id);
    });

    expect(visitedIds).toEqual([3, 2]);
  });

  it('should clear store correctly', () => {
    const store = new ObjectStore();

    // Add objects
    const box1 = new Box3(new Vector3(1, 2, 3), new Vector3(4, 5, 6));
    const box2 = new Box3(new Vector3(7, 8, 9), new Vector3(10, 11, 12));

    let head = store.add(-1, box1, 1);
    head = store.add(head, box2, 2);

    // Clear the store
    store.clear();

    // Add new objects after clear
    const box3 = new Box3(new Vector3(13, 14, 15), new Vector3(16, 17, 18));
    head = store.add(-1, box3, 3);

    // Verify the new object is accessible
    const data = store.get(head);
    expect(data.id).toBe(3);
    expect(data.box).toEqual(box3);
    
    // Verify only one object exists after clear
    const visitedIds: number[] = [];
    store.traverse(head, store.get, (data: DataBox) => {
      visitedIds.push(data.id);
    });
    expect(visitedIds).toEqual([3]);
  });

  it('should handle scratch space correctly', () => {
    const store = new ObjectStore();

    // Verify scratch space exists
    expect(store.scratch.tmpVec).toBeDefined();
    expect(store.scratch.tmpVec).toBeInstanceOf(Vector3);
    expect(store.scratch.stack).toBeDefined();
    expect(Array.isArray(store.scratch.stack)).toBe(true);
    expect(store.scratch.stack.length).toBe(64);

    // Modify scratch space
    store.scratch.tmpVec.set(1, 2, 3);
    store.scratch.stack[0] = 'test';

    // Verify modifications
    expect(store.scratch.tmpVec.x).toBe(1);
    expect(store.scratch.tmpVec.y).toBe(2);
    expect(store.scratch.tmpVec.z).toBe(3);
    expect(store.scratch.stack[0]).toBe('test');
  });
});