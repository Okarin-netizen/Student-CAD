import { draw, drawCircle, type Shape3D } from "replicad";
import type { SolvedSketch } from "../sketch/plateSketch";

export interface BuildOptions {
  thickness: number;
  cornerRadius: number;
}

/**
 * 拘束計算で決まったスケッチから立体を作る。
 * 手順は Onshape と同じ: スケッチ → 押し出し(くっつける) → フィレット。
 * 穴はスケッチの段階で「けずる」形として入れる。
 */
export function buildPlate(sketch: SolvedSketch, opts: BuildOptions): Shape3D {
  const [c0, c1, c2, c3] = sketch.corners;
  let profile = draw(c0).lineTo(c1).lineTo(c2).lineTo(c3).close();
  if (sketch.hole && sketch.hole.r > 0) {
    profile = profile.cut(drawCircle(sketch.hole.r).translate(sketch.hole.cx, sketch.hole.cy));
  }
  let solid = profile.sketchOnPlane("XY").extrude(opts.thickness) as Shape3D;
  if (opts.cornerRadius > 0) {
    // 厚み方向(Z)に平行な辺 = 四隅の縦の辺だけを丸める
    solid = solid.fillet(opts.cornerRadius, (e) => e.inDirection("Z"));
  }
  return solid;
}

export interface MeshData {
  /** xyz を並べた頂点座標 */
  vertices: Float32Array;
  normals: Float32Array;
  /** 三角形の頂点番号 */
  triangles: Uint32Array;
  /** 輪郭線(xyz の組を2点ずつ) */
  edges: Float32Array;
}

export const MESH_TOLERANCE = { tolerance: 0.05, angularTolerance: 15 };

export function meshShape(shape: Shape3D): MeshData {
  const m = shape.mesh(MESH_TOLERANCE);
  const e = shape.meshEdges(MESH_TOLERANCE);
  return {
    vertices: Float32Array.from(m.vertices),
    normals: Float32Array.from(m.normals),
    triangles: Uint32Array.from(m.triangles),
    edges: Float32Array.from(e.lines),
  };
}
