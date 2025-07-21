import React, { useEffect, useRef, useState, useMemo, Suspense } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import { useControls, button } from "leva";
import { useOctreeProxy } from "../../../src/r3f";
import Explosion from "./Explosion";
import { InsertMsg } from "../../../src/worker-msg-types";

const BOX_COUNT = 30_000;
const SPHERE_COUNT = 30_000;
const TOTAL_OBJECTS = BOX_COUNT + SPHERE_COUNT;

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
const boxMaterial = new THREE.MeshStandardMaterial({ color: "#0ff" });
const sphereMaterial = new THREE.MeshStandardMaterial({ color: "#f0f" });

function Scene() {
  const { camera, gl, scene } = useThree();
  const octree = useOctreeProxy();
  const [score, setScore] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [particles, setParticles] = useState([]);

  const { gravity, speed } = useControls({
    gravity: { value: 12, min: 0, max: 30 },
    speed: { value: 8, min: 1, max: 20 },
    reset: button(() => setResetKey((k) => k + 1)),
  });

  const { objects, boxInst, sphereInst } = useMemo(() => {
    const arr = [];
    const boxInst = new THREE.InstancedMesh(boxGeometry, boxMaterial, BOX_COUNT);
    const sphereInst = new THREE.InstancedMesh(sphereGeometry, sphereMaterial, SPHERE_COUNT);
    const matrix = new THREE.Matrix4();

    for (let i = 0; i < BOX_COUNT; i++) {
      const pos = new THREE.Vector3(Math.random() * 500 - 250, Math.random() * 50, Math.random() * 500 - 250);
      arr.push({ id: i, type: "box", pos });
      matrix.setPosition(pos);
      boxInst.setMatrixAt(i, matrix);
    }
    for (let i = 0; i < SPHERE_COUNT; i++) {
      const id = BOX_COUNT + i;
      const pos = new THREE.Vector3(Math.random() * 500 - 250, Math.random() * 50, Math.random() * 500 - 250);
      arr.push({ id, type: "sphere", pos });
      matrix.setPosition(pos);
      sphereInst.setMatrixAt(i, matrix);
    }
    boxInst.instanceMatrix.needsUpdate = true;
    sphereInst.instanceMatrix.needsUpdate = true;
    return { objects: arr, boxInst, sphereInst };
  }, [resetKey]);

  // A set to locally and synchronously track removed object IDs.
  // This is necessary to compensate for the latency of the async web worker.
  // It prevents a visual glitch where a removed object might reappear for a frame
  // if the frustum query result arrives before the worker has processed the removal.
  const removedIds = useMemo(() => new Set(), [resetKey]);

  useEffect(() => {
    const batch = objects.map(
      (o) =>
        ({
          cmd: "insert",
          id: o.id,
          min: [o.pos.x - 0.5, o.pos.y - 0.5, o.pos.z - 0.5],
          max: [o.pos.x + 0.5, o.pos.y + 0.5, o.pos.z + 0.5],
        } as InsertMsg)
    );
    octree.ready().then(() => {
      octree.postBatch(batch);
    });
  }, [objects, octree]);

  const vel = useRef([0, 0, 0]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space") vel.current[1] = speed;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [speed, gl]);

  useFrame((_, dt) => {
    const [, y] = vel.current;
    vel.current[1] = Math.max(y - gravity * dt, 0);
    camera.position.y += y * dt;
    if (camera.position.y < 2) camera.position.y = 2;
  });

  useEffect(() => {
    const shoot = () => {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      octree.raycast(raycaster.ray).then((hits) => {
        if (hits.length) {
          const hit = hits.sort((a, b) => a.distance - b.distance)[0];
          if (removedIds.has(hit.id)) return;

          const id = hit.id;
          removedIds.add(id);
          octree.postBatch([{ cmd: "remove", id }]);
          setScore((s) => s + 1);

          const obj = objects[id];
          if (obj) {
            const color = new THREE.Color(Math.random(), 0.5, 1);
            setParticles((p) => [...p, { pos: obj.pos, color, id: Date.now() + id }]);
            const mesh = obj.type === 'box' ? boxInst : sphereInst;
            const instanceId = obj.type === 'box' ? id : id - BOX_COUNT;
            const matrix = new THREE.Matrix4().makeScale(0,0,0);
            mesh.setMatrixAt(instanceId, matrix);
            mesh.instanceMatrix.needsUpdate = true;
          }
        }
      });
    };
    window.addEventListener("click", shoot);
    return () => window.removeEventListener("click", shoot);
  }, [camera, objects, octree, removedIds, boxInst, sphereInst]);

  useFrame(() => {
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse)
    );
    octree.frustumQuery(frustum).then(visibleIds => {
        let boxVisibleCount = 0;
        let sphereVisibleCount = 0;
        const tempMatrix = new THREE.Matrix4();

        for (const id of visibleIds) {
            if (removedIds.has(id)) continue;
            const obj = objects[id];
            if (obj.type === 'box') {
                tempMatrix.setPosition(obj.pos);
                boxInst.setMatrixAt(boxVisibleCount++, tempMatrix);
            } else {
                tempMatrix.setPosition(obj.pos);
                sphereInst.setMatrixAt(sphereVisibleCount++, tempMatrix);
            }
        }
        boxInst.count = boxVisibleCount;
        sphereInst.count = sphereVisibleCount;
        boxInst.instanceMatrix.needsUpdate = true;
        sphereInst.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[100, 100, 100]} intensity={1} />
      <primitive object={boxInst} />
      <primitive object={sphereInst} />
      <Suspense fallback={null}>
        {particles.map(({ pos, color, id }) => (
          <Explosion key={id} pos={pos} color={color} />
        ))}
      </Suspense>
    </>
  );
}

export default Scene;