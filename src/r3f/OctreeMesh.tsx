import React, { JSX, forwardRef, useEffect, useRef, useImperativeHandle } from "react";
import { Box3, Mesh } from "three";
import { useOctree } from "./OctreeProvider";

export const OctreeMesh = forwardRef<Mesh, JSX.IntrinsicElements["mesh"]>(({ id: userId, children, ...meshProps }, ref) => {
  const meshRef = useRef<Mesh>(null!);
  const octree = useOctree();
  const objId = userId ?? meshRef.current?.id ?? React.useId(); // stable once

  // expose mesh ref to caller
  useImperativeHandle(ref, () => meshRef.current);

  /* --- mount / unmount --- */
  useEffect(() => {
    const onMatrixUpdate = () => {
      if (!meshRef.current) return;
      meshRef.current.updateMatrixWorld(true);
      const box = new Box3().setFromObject(meshRef.current);
      octree.update({ box, id: objId });
    };

    const mesh = meshRef.current;
    // mesh.addEventListener("afterMatrixUpdate", onMatrixUpdate); <- FIX THIS
    // initial insert
    onMatrixUpdate();

    return () => {
      // mesh.removeEventListener("afterMatrixUpdate", onMatrixUpdate); <- FIX THIS
      octree.remove({ box: new Box3(), id: objId });
    };
  }, [objId, octree]);

  return (
    <mesh {...meshProps} ref={meshRef}>
      {children}
    </mesh>
  );
});
