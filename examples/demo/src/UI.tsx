import React from 'react'
import { useControls } from 'leva'

function UI() {
  const { score } = useControls({ score: { value: 0, render: () => false } })
  return (
    <div style={{ position: 'absolute', top: 20, left: 20, color: 'white', fontSize: 32 }}>
      Hits: {score}
    </div>
  )
}

export default UI
