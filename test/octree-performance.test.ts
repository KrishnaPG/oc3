// octree-performance.test.ts
import { describe, it, expect } from 'bun:test';
import { Octree } from '../src';
import { Box3, Vector3, Frustum, Ray, PerspectiveCamera } from 'three';

// Helper functions for creating test scenarios
function createBoxFromCenterSize(center: Vector3, size: number): Box3 {
  const halfSize = size / 2;
  return new Box3(
    new Vector3(center.x - halfSize, center.y - halfSize, center.z - halfSize),
    new Vector3(center.x + halfSize, center.y + halfSize, center.z + halfSize)
  );
}

function createFrustum(
  position: Vector3,
  target: Vector3,
  up: Vector3,
  fov: number, // in radians
  aspect: number,
  near: number,
  far: number
): Frustum {
  
  const camera = new PerspectiveCamera(fov * 180 / Math.PI, aspect, near, far);
  camera.position.copy(position);
  camera.up.copy(up);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  
  const frustum = new Frustum();
  frustum.setFromProjectionMatrix(camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse));
  
  return frustum;
}

function createRay(origin: Vector3, direction: Vector3): Ray {
  return new Ray(origin, direction.clone().normalize());
}

describe('Octree Performance', () => {
  it('should handle large number of objects efficiently', () => {
    const octree = new Octree(
      new Box3(new Vector3(-100, -100, -100), new Vector3(100, 100, 100)),
      { maxObjects: 16, maxDepth: 6 }
    );

    const numObjects = 1000;
    const objects: any[] = [];

    // Create and insert objects
    const startTime = performance.now();
    for (let i = 0; i < numObjects; i++) {
      const pos = new Vector3(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200
      );
      const obj = {
        box: createBoxFromCenterSize(pos, Math.random() * 5 + 1),
        id: i
      };
      objects.push(obj);
      octree.insert(obj);
    }
    const insertTime = performance.now() - startTime;

    // Verify all objects were inserted
    const foundIds: number[] = [];
    octree.aabbQuery(new Box3(new Vector3(-100, -100, -100), new Vector3(100, 100, 100)), (id) => foundIds.push(id));
    expect(foundIds.length).toBe(numObjects);

    // Performance assertion - should insert 1000 objects in reasonable time
    expect(insertTime).toBeLessThan(100); // Less than 100ms

    // Test query performance
    const queryStartTime = performance.now();
    const queryResults: number[] = [];
    octree.aabbQuery(new Box3(new Vector3(-50, -50, -50), new Vector3(50, 50, 50)), (id) => queryResults.push(id));
    const queryTime = performance.now() - queryStartTime;

    // Performance assertion - should query in reasonable time
    expect(queryTime).toBeLessThan(10); // Less than 10ms

    // Test remove performance
    const removeStartTime = performance.now();
    for (let i = 0; i < 100; i++) {
      octree.remove(objects[i]);
    }
    const removeTime = performance.now() - removeStartTime;

    // Performance assertion - should remove 100 objects in reasonable time
    expect(removeTime).toBeLessThan(50); // Less than 50ms

    // Verify objects were removed
    const remainingIds: number[] = [];
    octree.aabbQuery(new Box3(new Vector3(-100, -100, -100), new Vector3(100, 100, 100)), (id) => remainingIds.push(id));
    expect(remainingIds.length).toBe(numObjects - 100);
  });

  it('should handle deep hierarchies efficiently', () => {
    const octree = new Octree(
      new Box3(new Vector3(-100, -100, -100), new Vector3(100, 100, 100)),
      { maxObjects: 4, maxDepth: 8 }
    );

    const numObjects = 5000;
    const objects: any[] = [];

    // Create objects clustered in specific areas to encourage deep hierarchies
    const clusterCenters = [
      new Vector3(25, 25, 25),
      new Vector3(-25, 25, 25),
      new Vector3(25, -25, 25),
      new Vector3(-25, -25, 25),
      new Vector3(25, 25, -25),
      new Vector3(-25, 25, -25),
      new Vector3(25, -25, -25),
      new Vector3(-25, -25, -25)
    ];

    // Create and insert objects
    const startTime = performance.now();
    for (let i = 0; i < numObjects; i++) {
      const cluster = clusterCenters[i % clusterCenters.length];
      const pos = new Vector3(
        cluster.x + (Math.random() - 0.5) * 20,
        cluster.y + (Math.random() - 0.5) * 20,
        cluster.z + (Math.random() - 0.5) * 20
      );
      const obj = {
        box: createBoxFromCenterSize(pos, Math.random() * 3 + 1),
        id: i
      };
      objects.push(obj);
      octree.insert(obj);
    }
    const insertTime = performance.now() - startTime;

    // Verify all objects were inserted
    const foundIds: number[] = [];
    octree.aabbQuery(new Box3(new Vector3(-100, -100, -100), new Vector3(100, 100, 100)), (id) => foundIds.push(id));
    expect(foundIds.length).toBe(numObjects);

    // Performance assertion - should insert 5000 objects in reasonable time
    expect(insertTime).toBeLessThan(200); // Less than 200ms

    // Test raycast performance
    const ray = createRay(new Vector3(0, 0, 0), new Vector3(1, 1, 1).normalize());
    const raycastStartTime = performance.now();
    const hits: any[] = [];
    octree.raycast(ray, hits);
    const raycastTime = performance.now() - raycastStartTime;

    // Performance assertion - should raycast in reasonable time
    expect(raycastTime).toBeLessThan(20); // Less than 20ms

    // Test frustum query performance
    const frustum = createFrustum(
      new Vector3(0, 0, 0),
      new Vector3(1, 1, 1),
      new Vector3(0, 1, 0),
      Math.PI / 4,
      1,
      0.1,
      200
    );
    const frustumStartTime = performance.now();
    const frustumResults: number[] = [];
    octree.frustumQuery(frustum, (id) => frustumResults.push(id));
    const frustumTime = performance.now() - frustumStartTime;

    // Performance assertion - should frustum query in reasonable time
    expect(frustumTime).toBeLessThan(20); // Less than 20ms
  });

  it('should handle memory management efficiently', () => {
    const octree = new Octree(
      new Box3(new Vector3(-100, -100, -100), new Vector3(100, 100, 100)),
      { maxObjects: 16, maxDepth: 6 }
    );

    const numObjects = 2000;
    const objects: any[] = [];

    // Create and insert objects
    for (let i = 0; i < numObjects; i++) {
      const pos = new Vector3(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200
      );
      const obj = {
        box: createBoxFromCenterSize(pos, Math.random() * 5 + 1),
        id: i
      };
      objects.push(obj);
      octree.insert(obj);
    }

    // Remove half of the objects
    for (let i = 0; i < numObjects / 2; i++) {
      octree.remove(objects[i]);
    }

    // Insert new objects (should reuse memory)
    const newObjects: any[] = [];
    const insertStartTime = performance.now();
    for (let i = 0; i < numObjects / 2; i++) {
      const pos = new Vector3(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200
      );
      const obj = {
        box: createBoxFromCenterSize(pos, Math.random() * 5 + 1),
        id: numObjects + i
      };
      newObjects.push(obj);
      octree.insert(obj);
    }
    const insertTime = performance.now() - insertStartTime;

    // Performance assertion - should insert new objects efficiently (reusing memory)
    expect(insertTime).toBeLessThan(50); // Less than 50ms

    // Verify all objects are present
    const foundIds: number[] = [];
    octree.aabbQuery(new Box3(new Vector3(-100, -100, -100), new Vector3(100, 100, 100)), (id) => foundIds.push(id));
    expect(foundIds.length).toBe(numObjects);

    // Test update performance
    const updateStartTime = performance.now();
    for (let i = 0; i < 100; i++) {
      const obj = newObjects[i];
      obj.box = createBoxFromCenterSize(new Vector3(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200
      ), Math.random() * 5 + 1);
      octree.update(obj);
    }
    const updateTime = performance.now() - updateStartTime;

    // Performance assertion - should update objects efficiently
    expect(updateTime).toBeLessThan(50); // Less than 50ms
  });

  it('should handle frustumRaycast efficiently with many objects', () => {
    const octree = new Octree(
      new Box3(new Vector3(-100, -100, -100), new Vector3(100, 100, 100)),
      { maxObjects: 16, maxDepth: 6 }
    );

    const numObjects = 3000;
    const objects: any[] = [];

    // Create and insert objects
    for (let i = 0; i < numObjects; i++) {
      const pos = new Vector3(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200
      );
      const obj = {
        box: createBoxFromCenterSize(pos, Math.random() * 5 + 1),
        id: i
      };
      objects.push(obj);
      octree.insert(obj);
    }

    // Create frustum and ray
    const frustum = createFrustum(
      new Vector3(0, 0, 0),
      new Vector3(1, 1, 1),
      new Vector3(0, 1, 0),
      Math.PI / 4,
      1,
      0.1,
      200
    );
    const ray = createRay(new Vector3(0, 0, 0), new Vector3(1, 1, 1).normalize());

    // Test frustumRaycast performance
    const frustumRaycastStartTime = performance.now();
    let visitCount = 0;
    octree.frustumRaycast(frustum, ray, ({ node, distance }) => {
      visitCount++;
      return false;
    });
    const frustumRaycastTime = performance.now() - frustumRaycastStartTime;

    // Performance assertion - should frustumRaycast in reasonable time
    expect(frustumRaycastTime).toBeLessThan(30); // Less than 30ms
    expect(visitCount).toBeGreaterThan(0);
  });

  it('should handle stress testing with rapid insertions and removals', () => {
    const octree = new Octree(
      new Box3(new Vector3(-100, -100, -100), new Vector3(100, 100, 100)),
      { maxObjects: 16, maxDepth: 6 }
    );

    const numOperations = 5000;
    const objects: any[] = [];

    // Perform rapid insertions and removals
    const startTime = performance.now();
    for (let i = 0; i < numOperations; i++) {
      if (i % 2 === 0 || objects.length === 0) {
        // Insert
        const pos = new Vector3(
          (Math.random() - 0.5) * 200,
          (Math.random() - 0.5) * 200,
          (Math.random() - 0.5) * 200
        );
        const obj = {
          box: createBoxFromCenterSize(pos, Math.random() * 5 + 1),
          id: i
        };
        objects.push(obj);
        octree.insert(obj);
      } else {
        // Remove
        const index = Math.floor(Math.random() * objects.length);
        const obj = objects.splice(index, 1)[0];
        octree.remove(obj);
      }
    }
    const operationTime = performance.now() - startTime;

    // Performance assertion - should perform operations efficiently
    expect(operationTime).toBeLessThan(200); // Less than 200ms for 5000 operations

    // Verify final state
    const foundIds: number[] = [];
    octree.aabbQuery(new Box3(new Vector3(-100, -100, -100), new Vector3(100, 100, 100)), (id) => foundIds.push(id));
    expect(foundIds.length).toBe(objects.length);
  });
});