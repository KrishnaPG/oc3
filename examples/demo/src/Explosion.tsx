import React, { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Box } from '@react-three/drei'

function Explosion({ pos, color }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.children.forEach(c => {
        c.position.addScaledVector(c.userData.vel, dt)
        c.scale.multiplyScalar(0.95)
      })
    }
  })
  return (
    <group ref={ref} position={pos}>
      {Array.from({ length: 20 }).map((_, i) => {
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize()
        return (
          <Box key={i} args={[0.2, 0.2, 0.2]} position={[0, 0, 0]} userData={{ vel: dir.multiplyScalar(10) }}>
            <meshBasicMaterial color={color} />
          </Box>
        )
      })}
    </group>
  )
}

export default Explosion
