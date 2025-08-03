import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

import { OctreeProxyProvider } from "../../../src/r3f";
import { OctreeProxy } from "../../../src/worker-proxy";
import Scene from "./Scene";
import UI from "./UI";

const workerScriptURL = new URL('./worker.ts', import.meta.url); // "https://unpkg.com/oc3@latest/dist/worker-backend.js";

const worker = new Worker(workerScriptURL, { type: "module" });
const octree = new OctreeProxy(worker);

function App() {
  return (
    <>
      <Canvas shadows camera={{ fov: 75, near: 0.1, far: 10000, position: [3, 5, 3] }}>
        <OrbitControls />
        <axesHelper />
        <Stats />
        <gridHelper args={[10, 10, "green", "blue"]} />
        <OctreeProxyProvider octreeProxy={octree}>
          <Suspense fallback={<span>Loading ...</span>}>
            <Scene />
          </Suspense>
          <EffectComposer>
            <Bloom luminanceThreshold={0.2} intensity={1} />
          </EffectComposer>
        </OctreeProxyProvider>
      </Canvas>
      <UI />
    </>
  );
}

export default App;
