import React, { createContext, useContext } from "react";
import { OctreeProxy } from "../worker-proxy";
import { Octree } from "../core/Octree";

export const OctreeContext = createContext<Octree | null>(null);
export const OctreeProxyContext = createContext<OctreeProxy | null>(null);

export const OctreeProvider: React.FC<{ octree?: Octree; children: React.ReactNode }> = ({
  octree = new Octree(),
  children,
}) => {
  return <OctreeContext.Provider value={octree}>{children}</OctreeContext.Provider>;
};

export const OctreeProxyProvider: React.FC<{ octreeProxy: OctreeProxy; children: React.ReactNode }> = ({
  octreeProxy,
  children,
}) => {
  return <OctreeProxyContext.Provider value={octreeProxy}>{children}</OctreeProxyContext.Provider>;
};


export function useOctree(): Octree {
  const oct = useContext(OctreeContext);
  if (!oct) throw new Error("useOctree must be used inside <OctreeProvider>");
  return oct;
}

export function useOctreeProxy(): OctreeProxy {
  const oct = useContext(OctreeProxyContext);
  if (!oct) throw new Error("useOctreeProxy must be used inside <OctreeProxyProvider>");
  return oct;
}