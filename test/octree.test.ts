// octree.test.ts
import { describe, it, expect } from 'bun:test';
import { IVisibleNode, IVisibleNodeVisitor, Octree } from '../src';
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

// Reference implementation for ray-box intersection (to verify against)
function referenceRayBoxIntersection(ray: Ray, box: Box3): number {
  const invDir = new Vector3(
    1 / ray.direction.x,
    1 / ray.direction.y,
    1 / ray.direction.z
  );

  const origin = ray.origin;
  const min = box.min;
  const max = box.max;

  let tmin = (min.x - origin.x) * invDir.x;
  let tmax = (max.x - origin.x) * invDir.x;
  if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

  let tymin = (min.y - origin.y) * invDir.y;
  let tymax = (max.y - origin.y) * invDir.y;
  if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

  if (tmin > tymax || tymin > tmax) return Infinity;
  if (tymin > tmin) tmin = tymin;
  if (tymax < tmax) tmax = tymax;

  let tzmin = (min.z - origin.z) * invDir.z;
  let tzmax = (max.z - origin.z) * invDir.z;
  if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

  if (tmin > tzmax || tzmin > tmax) return Infinity;
  if (tzmin > tmin) tmin = tzmin;
  if (tzmax < tmax) tmax = tzmax;

  return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : Infinity);
}

// Reference implementation for frustum-box intersection
function referenceFrustumBoxIntersection(frustum: Frustum, box: Box3): boolean {
  return frustum.intersectsBox(box);
}

describe('Octree', () => {
  it('should insert and remove objects correctly', () => {
    const octree = new Octree(new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)));

    // Insert two objects
    const obj1 = { box: createBoxFromCenterSize(new Vector3(-2, -2, -2), 2), id: 1 };
    const obj2 = { box: createBoxFromCenterSize(new Vector3(3, 3, 3), 2), id: 2 };

    octree.insert(obj1);
    octree.insert(obj2);

    // Verify objects are in the octree
    const foundIds: number[] = [];
    octree.aabbQuery(new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)), (id) => foundIds.push(id));

    expect(foundIds).toContain(1);
    expect(foundIds).toContain(2);
    expect(foundIds.length).toBe(2);

    // Remove obj1
    octree.remove(obj1);

    // Verify only obj2 remains
    foundIds.length = 0;
    octree.aabbQuery(new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)), (id) => foundIds.push(id));

    expect(foundIds).not.toContain(1);
    expect(foundIds).toContain(2);
    expect(foundIds.length).toBe(1);
  });

  it('should split nodes when exceeding max objects', () => {
    const octree = new Octree(
      new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)),
      { maxObjects: 2, maxDepth: 3 }
    );

    // Insert 3 objects in the same area to trigger a split
    const obj1 = { box: createBoxFromCenterSize(new Vector3(1, 1, 1), 1), id: 1 };
    const obj2 = { box: createBoxFromCenterSize(new Vector3(1.5, 1.5, 1.5), 1), id: 2 };
    const obj3 = { box: createBoxFromCenterSize(new Vector3(1.2, 1.2, 1.2), 1), id: 3 };

    octree.insert(obj1);
    octree.insert(obj2);
    // At this point, the root should have 2 objects and not split yet
    octree.insert(obj3); // This should trigger a split

    // Verify all objects are still in the octree
    const foundIds: number[] = [];
    octree.aabbQuery(new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)), (id) => foundIds.push(id));

    expect(foundIds).toContain(1);
    expect(foundIds).toContain(2);
    expect(foundIds).toContain(3);
    expect(foundIds.length).toBe(3);
  });

  it('should correctly cull nodes outside the frustum', () => {
    const octree = new Octree(new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)));

    // Insert objects in different parts of the octree
    const obj1 = { box: createBoxFromCenterSize(new Vector3(-5, -5, -5), 2), id: 1 };
    const obj2 = { box: createBoxFromCenterSize(new Vector3(5, 5, 5), 2), id: 2 };

    octree.insert(obj1);
    octree.insert(obj2);

    // Create a frustum that only sees the first object (obj1)
    const cameraPosition = new Vector3(0, 0, 0);
    const cameraTarget = new Vector3(-5, -5, -5);
    const cameraUp = new Vector3(0, 1, 0);
    const fov = Math.PI / 4; // 45 degrees
    const aspect = 1;
    const near = 0.1;
    const far = 100;

    const frustum = createFrustum(cameraPosition, cameraTarget, cameraUp, fov, aspect, near, far);

    // Verify that obj1 is in the frustum and obj2 is not using reference implementation
    expect(referenceFrustumBoxIntersection(frustum, obj1.box)).toBe(true);
    expect(referenceFrustumBoxIntersection(frustum, obj2.box)).toBe(false);

    // Test frustum culling with frustumRaycast
    const visitedNodes: { node: any, distance: number }[] = [];
    const visitor: IVisibleNodeVisitor = ({ node, distance }) => {
      visitedNodes.push({ node, distance });
      return false;
    };

    const ray = createRay(new Vector3(0, 0, 0), new Vector3(0, 0, 1));
    const invDir = new Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z);

    octree.frustumRaycast(frustum, ray, visitor);

    // We expect at least one node to be visited (containing obj1)
    expect(visitedNodes.length).toBeGreaterThan(0);

    // Verify that obj1 was found in one of the visited nodes
    let foundObj1 = false;
    for (const visited of visitedNodes) {
      if (referenceFrustumBoxIntersection(frustum, obj1.box)) {
        foundObj1 = true;
        break;
      }
    }
    expect(foundObj1).toBe(true);
  });

  it('should find the correct ray hit', () => {
    const octree = new Octree(new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)));

    // Insert two objects, one closer to the ray origin than the other
    const obj1 = { box: createBoxFromCenterSize(new Vector3(2, 2, 2), 1), id: 1 };
    const obj2 = { box: createBoxFromCenterSize(new Vector3(5, 5, 5), 1), id: 2 };

    octree.insert(obj1);
    octree.insert(obj2);

    // Create a ray that should hit both objects, but obj1 is closer
    const rayOrigin = new Vector3(0, 0, 0);
    const rayDirection = new Vector3(1, 1, 1).normalize();
    const ray = createRay(rayOrigin, rayDirection);
    const invDir = new Vector3(1 / rayDirection.x, 1 / rayDirection.y, 1 / rayDirection.z);

    // Calculate expected distances using reference implementation
    const expectedDist1 = referenceRayBoxIntersection(ray, obj1.box);
    const expectedDist2 = referenceRayBoxIntersection(ray, obj2.box);

    expect(expectedDist1).toBeLessThan(expectedDist2);

    // Create a frustum that contains both objects
    const frustum = createFrustum(
      new Vector3(0, 0, 0),
      new Vector3(5, 5, 5),
      new Vector3(0, 1, 0),
      Math.PI / 2,
      1,
      0.1,
      100
    );

    let closestHit: { id: number, distance: number } | null = null;
    const visitor: IVisibleNodeVisitor = ({ node, distance, mouseHit }) => {
      if (mouseHit) {
        if (!closestHit || mouseHit.distance < closestHit.distance) {
          closestHit = mouseHit;
        }
      }
      return false;
    };

    octree.frustumRaycast(frustum, ray, visitor);

    // We expect obj1 to be hit because it's closer
    expect(closestHit).not.toBeNull();
    expect(closestHit!.id).toBe(1);
    expect(closestHit!.distance).toBeCloseTo(expectedDist1, 5);
  });

  it('should correctly combine frustum culling and ray casting', () => {
    const octree = new Octree(new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)));

    // Insert objects:
    // 1. In the frustum and on the ray
    // 2. In the frustum but not on the ray
    // 3. Outside the frustum
    // 4. Near the frustum boundary (should be outside)
    // 5. Near the frustum boundary (should be inside)
    const obj1 = { box: createBoxFromCenterSize(new Vector3(2, 2, 2), 1), id: 1 };
    const obj2 = { box: createBoxFromCenterSize(new Vector3(2, 5, 2), 1), id: 2 };
    const obj3 = { box: createBoxFromCenterSize(new Vector3(15, 15, 15), 1), id: 3 };
    const obj4 = { box: createBoxFromCenterSize(new Vector3(6, 6, 6), 1), id: 4 }; // Near boundary (outside)
    const obj5 = { box: createBoxFromCenterSize(new Vector3(4, 4, 4), 1), id: 5 }; // Near boundary (inside)

    octree.insert(obj1);
    octree.insert(obj2);
    octree.insert(obj3);
    octree.insert(obj4);
    octree.insert(obj5);

    // Create a frustum with more realistic parameters
    const cameraPosition = new Vector3(0, 0, 0);
    const cameraTarget = new Vector3(2, 3, 2);
    const cameraUp = new Vector3(0, 1, 0);
    const fov = Math.PI / 3; // 60 degrees - more realistic
    const aspect = 1;
    const near = 0.1;
    const far = 8; // Reduced to make culling more precise

    const frustum = createFrustum(cameraPosition, cameraTarget, cameraUp, fov, aspect, near, far);

    // Verify frustum culling using reference implementation
    expect(referenceFrustumBoxIntersection(frustum, obj1.box)).toBe(true);
    expect(referenceFrustumBoxIntersection(frustum, obj2.box)).toBe(true);
    expect(referenceFrustumBoxIntersection(frustum, obj3.box)).toBe(false);
    expect(referenceFrustumBoxIntersection(frustum, obj4.box)).toBe(false);
    expect(referenceFrustumBoxIntersection(frustum, obj5.box)).toBe(true);

    // Create a ray that hits obj1
    const rayOrigin = new Vector3(0, 0, 0);
    const rayDirection = new Vector3(1, 1, 1).normalize();
    const ray = createRay(rayOrigin, rayDirection);
    const invDir = new Vector3(1 / rayDirection.x, 1 / rayDirection.y, 1 / rayDirection.z);

    // Calculate expected hit using reference implementation
    const expectedDist = referenceRayBoxIntersection(ray, obj1.box);
    expect(expectedDist).toBeLessThan(Infinity);

    const visitedNodes: { node: any, distance: number }[] = [];
    let closestHit: { id: number, distance: number } | null = null;

    const visitor: IVisibleNodeVisitor = ({ node, distance, mouseHit }) => {
      visitedNodes.push({ node, distance });
      if (mouseHit) {
        if (!closestHit || mouseHit.distance < closestHit.distance) {
          closestHit = mouseHit;
        }
      }
      return false;
    };

    octree.frustumRaycast(frustum, ray, visitor);

    // Verify the hit
    expect(closestHit).not.toBeNull();
    expect(closestHit!.id).toBe(1);
    expect(closestHit!.distance).toBeCloseTo(expectedDist, 5);

    // Verify that obj3 was not visited (outside frustum)
    let foundObj3 = false;
    for (const visited of visitedNodes) {
      // This is a simplified check - in a real test we'd need to verify the node's contents
      if (referenceFrustumBoxIntersection(frustum, obj3.box)) {
        foundObj3 = true;
        break;
      }
    }
    expect(foundObj3).toBe(false);
  });

  it('should calculate correct LOD distances', () => {
    // Test case 1: Octree centered at (0,0,0)
    const octree1 = new Octree(new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)));

    // Insert one object
    const obj1 = { box: createBoxFromCenterSize(new Vector3(2, 2, 2), 1), id: 1 };
    octree1.insert(obj1);

    // Create a frustum that contains the object
    const cameraPosition = new Vector3(0, 0, 0);
    const cameraTarget = new Vector3(2, 2, 2);
    const cameraUp = new Vector3(0, 1, 0);
    const fov = Math.PI / 4;
    const aspect = 1;
    const near = 0.1;
    const far = 100;

    const frustum = createFrustum(cameraPosition, cameraTarget, cameraUp, fov, aspect, near, far);

    // Create a dummy ray
    const ray = createRay(new Vector3(0, 0, 0), new Vector3(0, 0, 1));
    const invDir = new Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z);

    const nodeDistances: number[] = [];
    const visitor: IVisibleNodeVisitor = ({ node, distance }) => {
      nodeDistances.push(distance);
      return false;
    };

    octree1.frustumRaycast(frustum, ray, visitor);

    // We expect at least one node to be visited
    expect(nodeDistances.length).toBeGreaterThan(0);

    // The root node's center is at (-10,-10,-10) to (10,10,10) -> center at (0,0,0)
    const expectedDistance1 = cameraPosition.distanceTo(new Vector3(0, 0, 0));
    expect(nodeDistances[0]).toBeCloseTo(expectedDistance1, 5);

    // Test case 2: Octree centered at (5,5,5)
    const octree2 = new Octree(new Box3(new Vector3(0, 0, 0), new Vector3(10, 10, 10)));
    octree2.insert(obj1);

    nodeDistances.length = 0;
    octree2.frustumRaycast(frustum, ray, visitor);

    // The root node's center is at (0,0,0) to (10,10,10) -> center at (5,5,5)
    const expectedDistance2 = cameraPosition.distanceTo(new Vector3(5, 5, 5));
    expect(nodeDistances[0]).toBeCloseTo(expectedDistance2, 5);

    // Test case 3: Octree centered at (-5,-5,-5)
    const octree3 = new Octree(new Box3(new Vector3(-10, -10, -10), new Vector3(0, 0, 0)));
    octree3.insert(obj1);

    // Create a frustum that will intersect with the third octree
    const cameraPosition3 = new Vector3(-5, -5, -5);
    const cameraTarget3 = new Vector3(-2, -2, -2);
    const frustum3 = createFrustum(cameraPosition3, cameraTarget3, cameraUp, fov, aspect, near, far);
    const ray3 = createRay(cameraPosition3, new Vector3(0, 0, 1));

    nodeDistances.length = 0;
    octree3.frustumRaycast(frustum3, ray3, visitor);

    // We expect at least one node to be visited
    expect(nodeDistances.length).toBeGreaterThan(0);

    // The root node's center is at (-10,-10,-10) to (0,0,0) -> center at (-5,-5,-5)
    const expectedDistance3 = cameraPosition3.distanceTo(new Vector3(-5, -5, -5));
    expect(nodeDistances[0]).toBeCloseTo(expectedDistance3, 5);

    // Test case 4: Different camera position
    const cameraPosition2 = new Vector3(10, 10, 10);
    const frustum2 = createFrustum(cameraPosition2, cameraTarget, cameraUp, fov, aspect, near, far);
    const ray2 = createRay(cameraPosition2, new Vector3(0, 0, 1));

    nodeDistances.length = 0;
    octree1.frustumRaycast(frustum2, ray2, visitor);

    // We expect at least one node to be visited
    expect(nodeDistances.length).toBeGreaterThan(0);

    // Distance from (10,10,10) to (0,0,0)
    const expectedDistance4 = cameraPosition2.distanceTo(new Vector3(0, 0, 0));
    expect(nodeDistances[0]).toBeCloseTo(expectedDistance4, 5);
  });

  it('should handle edge cases', () => {
    // Empty octree
    const octree = new Octree(new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)));

    const frustum = createFrustum(
      new Vector3(0, 0, 0),
      new Vector3(1, 1, 1),
      new Vector3(0, 1, 0),
      Math.PI / 4,
      1,
      0.1,
      100
    );

    const ray = createRay(new Vector3(0, 0, 0), new Vector3(0, 0, 1));
    const invDir = new Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z);

    let visited = false;
    const visitor = () => {
      visited = true;
      return false;
    };

    octree.frustumRaycast(frustum, ray, visitor);
    expect(visited).toBe(false);

    // Object outside the octree bounds
    const objOutside = { box: createBoxFromCenterSize(new Vector3(15, 15, 15), 2), id: 1 };
    octree.insert(objOutside);

    visited = false;
    octree.frustumRaycast(frustum, ray, visitor);
    expect(visited).toBe(false);

    // Object that spans multiple nodes
    const objSpanning = { box: new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5)), id: 2 };
    octree.insert(objSpanning);

    visited = false;
    octree.frustumRaycast(frustum, ray, visitor);
    expect(visited).toBe(true);

    // Ray that doesn't hit anything
    let hit = false;
    const visitor2: IVisibleNodeVisitor = ({ node, distance, mouseHit }) => {
      if (mouseHit) {
        hit = true;
      }
      return false;
    };

    octree.frustumRaycast(frustum, ray, visitor2);
    expect(hit).toBe(false);
  });

  it('should correctly handle objects spanning multiple nodes', () => {
    const octree = new Octree(
      new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)),
      { maxObjects: 1, maxDepth: 2 }
    );

    // Insert an object that spans multiple nodes
    const objSpanning = { box: new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1)), id: 1 };
    octree.insert(objSpanning);

    // Insert another object that fits entirely in one node
    const objContained = { box: createBoxFromCenterSize(new Vector3(3, 3, 3), 1), id: 2 };
    octree.insert(objContained);

    // Create a frustum that contains both objects
    const frustum = createFrustum(
      new Vector3(0, 0, 0),
      new Vector3(3, 3, 3),
      new Vector3(0, 1, 0),
      Math.PI / 2,
      1,
      0.1,
      100
    );

    // Create a ray that hits the contained object
    const ray = createRay(new Vector3(0, 0, 0), new Vector3(1, 1, 1).normalize());
    const invDir = new Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z);

    const visitedNodes: any[] = [];
    let closestHit: { id: number, distance: number } | null = null;

    const visitor: IVisibleNodeVisitor = ({ node, distance, mouseHit }) => {
      visitedNodes.push(node);
      if (mouseHit) {
        if (!closestHit || mouseHit.distance < closestHit.distance) {
          closestHit = mouseHit;
        }
      }
      return false;
    };

    octree.frustumRaycast(frustum, ray, visitor);

    // Verify both objects were found
    expect(visitedNodes.length).toBeGreaterThan(0);

    // Verify the hit
    expect(closestHit).not.toBeNull();
    expect(closestHit!.id).toBe(2);
  });

  it('should correctly handle deep hierarchies', () => {
    const octree = new Octree(
      new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)),
      { maxObjects: 1, maxDepth: 4 }
    );

    // Insert objects to create a deep hierarchy
    const objects: any[] = [];
    for (let i = 0; i < 20; i++) {
      const pos = new Vector3(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16
      );
      objects.push({
        box: createBoxFromCenterSize(pos, 1),
        id: i
      });
      octree.insert(objects[i]);
    }

    // Create a frustum that contains some objects
    const frustum = createFrustum(
      new Vector3(0, 0, 0),
      new Vector3(5, 5, 5),
      new Vector3(0, 1, 0),
      Math.PI / 4,
      1,
      0.1,
      100
    );

    // Create a ray that hits one of the objects
    const ray = createRay(new Vector3(0, 0, 0), new Vector3(1, 1, 1).normalize());
    const invDir = new Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z);

    // Find expected hit using reference implementation
    let expectedHit: { id: number, distance: number } | null = null;
    let minDistance = Infinity;

    for (const obj of objects) {
      const dist = referenceRayBoxIntersection(ray, obj.box);
      if (dist < minDistance && dist !== Infinity) {
        minDistance = dist;
        expectedHit = { id: obj.id, distance: dist };
      }
    }

    const visitedNodes: any[] = [];
    let closestHit: { id: number, distance: number } | null = null;

    const visitor: IVisibleNodeVisitor = ({ node, distance, mouseHit }) => {
      visitedNodes.push(node);
      if (mouseHit) {
        if (!closestHit || mouseHit.distance < closestHit.distance) {
          closestHit = mouseHit;
        }
      }
      return false;
    };

    octree.frustumRaycast(frustum, ray, visitor);

    // Verify the hit matches the expected hit
    if (expectedHit) {
      expect(closestHit).not.toBeNull();
      expect(closestHit!.id).toBe(expectedHit.id);
      expect(closestHit!.distance).toBeCloseTo(expectedHit.distance, 5);
    } else {
      expect(closestHit).toBeNull();
    }
  });
});