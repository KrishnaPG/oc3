import React, { useEffect, useRef, useState, useMemo, Suspense } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, Sphere, Box } from "@react-three/drei";
import { useControls, button } from "leva";
import { useOctreeProxy } from "../../../src/r3f";
import Explosion from "./Explosion";
import { InsertMsg } from "../../../src/worker-msg-types";

function Scene() {
  const { camera, gl } = useThree();
  const octree = useOctreeProxy();
  const [score, setScore] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [particles, setParticles] = useState([]); // {pos,color,id}

  const { gravity, speed } = useControls({
    gravity: { value: 12, min: 0, max: 30 },
    speed: { value: 8, min: 1, max: 20 },
    reset: button(() => setResetKey((k) => k + 1)),
  });

  const objects = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 30_000; i++) {
      const pos = [Math.random() * 500 - 250, Math.random() * 50, Math.random() * 500 - 250];
      arr.push({ id: i, type: "box", pos });
    }
    for (let i = 30_000; i < 60_000; i++) {
      const pos = [Math.random() * 500 - 250, Math.random() * 50, Math.random() * 500 - 250];
      arr.push({ id: i, type: "sphere", pos });
    }
    return arr;
  }, [resetKey]);

  useEffect(() => {
    const batch = objects.map(
      (o) =>
        ({
          cmd: "insert",
          id: o.id,
          min: o.pos.map((v) => v - 0.5),
          max: o.pos.map((v) => v + 0.5),
        } as InsertMsg)
    );
    // wait till webworker is ready
    octree.ready().then(() => {
      console.log("Posting Batch for Object insertion into Octree");
      octree.postBatch(batch);
    });
  }, [objects, octree]);

  const vel = useRef([0, 0, 0]);
  useEffect(() => {
    // gl.domElement.requestPointerLock()
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
  console.log("peoasdfa");

  useEffect(() => {
    const shoot = () => {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      octree.raycast(raycaster.ray).then((hits) => {
        if (hits.length) {
          const id = hits[0].id;
          octree.postBatch([{ cmd: "remove", id }]);
          setScore((s) => s + 1);
          const obj = objects.find((o) => o.id === id);
          if (obj) {
            const color = new THREE.Color(Math.random(), 0.5, 1);
            setParticles((p) => [...p, { pos: obj.pos, color, id: Date.now() + id }]);
          }
        }
      });
    };
    window.addEventListener("click", shoot);
    return () => window.removeEventListener("click", shoot);
  }, [camera, objects, octree]);

  const [visibleObjIds, setVisibleObjIds] = useState<number[]>([]);
  useFrame(() => {
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse)
    );
    octree.frustumQuery(frustum).then(setVisibleObjIds);
  });

  return (
    <>
      {/* <PointerLockControls /> */}
      <ambientLight intensity={0.4} />
      <pointLight position={[100, 100, 100]} intensity={1} />
      <Suspense fallback={<span>Loading...</span>}>
        {visibleObjIds.map((id) => {
          const o = objects[id];
          const [x, y, z] = o.pos;
          const key = o.id;
          return o.type === "box" ? (
            <Box key={key} args={[1, 1, 1]} position={[x, y, z]}>
              <meshStandardMaterial color="#0ff" />
            </Box>
          ) : (
            <Sphere key={key} args={[0.5, 16, 16]} position={[x, y, z]}>
              <meshStandardMaterial color="#f0f" />
            </Sphere>
          );
        })}
        {particles.map(({ pos, color, id }) => (
          <Explosion key={id} pos={pos} color={color} />
        ))}
      </Suspense>
    </>
  );
}

export default Scene;
