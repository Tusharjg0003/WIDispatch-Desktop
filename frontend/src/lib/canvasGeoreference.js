/* canvasGeoreference
   --------------------------------------------------------------------------
   Maps the schematic Network Canvas (Cytoscape model pixels) to real-world
   geography and back, from a set of "anchor" nodes the user has pinned to a
   known latitude/longitude.

   The canvas has no inherent geography — a node's position is abstract model
   space. Once >= 2 anchors exist we fit a transform T so every other node and
   every pipe vertex gets a derived (lat, lng), which is what lets the Map view
   and the KMZ export place the drawing on the earth.

   Representation: a single 2D affine, applied as
       lng = A*x + B*y + C
       lat = D*x + E*y + F
   `geoToPixel` inverts the 2x2 [[A,B],[D,E]]. Both the exact 2-anchor case and
   the least-squares >=3-anchor case are reduced to these six coefficients so
   there is one forward/inverse code path.

   Screen y grows downward while latitude grows upward; the fit handles the flip
   because it solves directly on the anchor (pixel, geo) pairs. The 2-anchor
   solution folds the y-flip in explicitly (see below) so a north-up drawing
   stays north-up on the map.
   -------------------------------------------------------------------------- */

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Normalize an anchor to { px:{x,y}, geo:{lat,lng} } or null if incomplete. */
export const normalizeAnchor = (a) => {
  if (!a) return null;
  const x = Number(a.px?.x ?? a.x);
  const y = Number(a.px?.y ?? a.y);
  const lat = Number(a.geo?.lat ?? a.lat);
  const lng = Number(a.geo?.lng ?? a.lng);
  if (![x, y, lat, lng].every(isFiniteNum)) return null;
  return { px: { x, y }, geo: { lat, lng } };
};

/**
 * Fit a transform from anchor points.
 * @param {Array} rawAnchors  [{ px:{x,y}, geo:{lat,lng} }] (or flat {x,y,lat,lng})
 * @returns {{A,B,C,D,E,F, anchorCount} | null} null when < 2 usable anchors or degenerate.
 */
export const computeTransform = (rawAnchors) => {
  const anchors = (rawAnchors || []).map(normalizeAnchor).filter(Boolean);
  if (anchors.length < 2) return null;

  if (anchors.length === 2) {
    // Exact similarity (rotation + uniform scale + translation) fitted on the
    // y-flipped pixel frame Y = -y, so screen-up maps to north.
    const [p, q] = anchors;
    const X1 = p.px.x, Y1 = -p.px.y, X2 = q.px.x, Y2 = -q.px.y;
    const dX = X1 - X2, dY = Y1 - Y2;
    const det = dX * dX + dY * dY;
    if (!det) return null; // coincident anchors
    const dLng = p.geo.lng - q.geo.lng;
    const dLat = p.geo.lat - q.geo.lat;
    const a = (dX * dLng + dY * dLat) / det;
    const b = (dX * dLat - dY * dLng) / det;
    const c = p.geo.lng - (a * X1 - b * Y1);
    const d = p.geo.lat - (b * X1 + a * Y1);
    // Fold Y = -y into affine coefficients on the raw pixel (x, y):
    //   lng = a*x - b*(-y) + c = a*x + b*y + c
    //   lat = b*x + a*(-y) + d = b*x - a*y + d
    const T = { A: a, B: b, C: c, D: b, E: -a, F: d, anchorCount: 2 };
    if (!Number.isFinite(T.A * T.E - T.B * T.D) || (T.A * T.E - T.B * T.D) === 0) return null;
    return T;
  }

  // >= 3 anchors: least-squares affine. Solve the 3x3 normal equations once for
  // the shared design matrix [x y 1], reused for the lng and lat right-hand sides.
  let Sxx = 0, Sxy = 0, Sx = 0, Syy = 0, Sy = 0, S1 = 0;
  let Txlng = 0, Tylng = 0, Tlng = 0, Txlat = 0, Tylat = 0, Tlat = 0;
  anchors.forEach(({ px, geo }) => {
    const { x, y } = px;
    Sxx += x * x; Sxy += x * y; Sx += x;
    Syy += y * y; Sy += y; S1 += 1;
    Txlng += x * geo.lng; Tylng += y * geo.lng; Tlng += geo.lng;
    Txlat += x * geo.lat; Tylat += y * geo.lat; Tlat += geo.lat;
  });
  const M = [
    [Sxx, Sxy, Sx],
    [Sxy, Syy, Sy],
    [Sx, Sy, S1],
  ];
  const inv = invert3x3(M);
  if (!inv) return null;
  const [A, B, C] = mul3x3Vec(inv, [Txlng, Tylng, Tlng]);
  const [D, E, F] = mul3x3Vec(inv, [Txlat, Tylat, Tlat]);
  const T = { A, B, C, D, E, F, anchorCount: anchors.length };
  const det = A * E - B * D;
  if (!Number.isFinite(det) || det === 0) return null;
  return T;
};

/** Pixel model position -> { lat, lng }. */
export const pixelToGeo = (pos, T) => {
  if (!T || !pos) return null;
  const x = Number(pos.x), y = Number(pos.y);
  if (!isFiniteNum(x) || !isFiniteNum(y)) return null;
  return {
    lng: T.A * x + T.B * y + T.C,
    lat: T.D * x + T.E * y + T.F,
  };
};

/** { lat, lng } -> pixel model position { x, y } (exact inverse of pixelToGeo). */
export const geoToPixel = (geo, T) => {
  if (!T || !geo) return null;
  const lat = Number(geo.lat), lng = Number(geo.lng);
  if (!isFiniteNum(lat) || !isFiniteNum(lng)) return null;
  const det = T.A * T.E - T.B * T.D;
  if (!det) return null;
  const u = lng - T.C;
  const v = lat - T.F;
  return {
    x: (T.E * u - T.B * v) / det,
    y: (-T.D * u + T.A * v) / det,
  };
};

/** Status of the current anchor set, for UI messaging. */
export const transformStatus = (rawAnchors) => {
  const count = (rawAnchors || []).map(normalizeAnchor).filter(Boolean).length;
  if (count === 0) return { ok: false, count, message: 'Set 2 geo anchors to enable the map' };
  if (count === 1) return { ok: false, count, message: 'Add 1 more geo anchor to enable the map' };
  return { ok: true, count, message: `${count} geo anchors — map enabled` };
};

/* ── tiny linear-algebra helpers (3x3) ──────────────────────────────────── */
function invert3x3(m) {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det || !Number.isFinite(det)) return null;
  const invDet = 1 / det;
  return [
    [A * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
    [B * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
    [C * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet],
  ];
}

function mul3x3Vec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}
