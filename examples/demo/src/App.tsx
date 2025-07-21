import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { OctreeProxyProvider } from "../../../src/r3f";
import { OctreeProxy } from '../../../src/worker-proxy'
import Scene from './Scene'
import UI from './UI'
import { OrbitControls } from '@react-three/drei';

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
const octree = new OctreeProxy(worker)

function App() {
  return (
    <>
      <Canvas shadows camera={{ fov: 75, near: 0.1, far: 10000, position: [3, 5, 3] }}>
        <OrbitControls />
        <axesHelper />
        <gridHelper args={[10, 10, "green", "blue"]} />
        <OctreeProxyProvider octreeProxy={octree}>
          <Suspense fallback={null}>
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

export default App
