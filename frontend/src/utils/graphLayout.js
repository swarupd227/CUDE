// Force-directed graph layout algorithm — pure JavaScript, no dependencies
// Uses spring-electric model: connected nodes attract, all nodes repel

export function forceDirectedLayout(nodes, edges, options = {}) {
  const {
    width = 1600,
    height = 1000,
    iterations = 120,
    repulsionForce = 15000,
    attractionForce = 0.004,
    damping = 0.85,
    idealEdgeLength = 250,
    centerGravity = 0.008,
  } = options;

  if (!nodes.length) return [];

  // Initialize positions randomly within bounds (avoiding edges)
  const margin = 100;
  const positioned = nodes.map((node, i) => ({
    ...node,
    x: margin + Math.random() * (width - 2 * margin),
    y: margin + Math.random() * (height - 2 * margin),
    vx: 0,
    vy: 0,
  }));

  // Build adjacency lookup for fast neighbor check
  const nodeIndex = {};
  positioned.forEach((n, i) => { nodeIndex[n.id] = i; });

  const edgePairs = edges.map(e => ({
    source: nodeIndex[e.source],
    target: nodeIndex[e.target],
  })).filter(e => e.source !== undefined && e.target !== undefined);

  // Run simulation
  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations; // Cooling schedule

    // Reset forces
    const fx = new Float64Array(positioned.length);
    const fy = new Float64Array(positioned.length);

    // Repulsive forces — all pairs (Coulomb's law)
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const dx = positioned[j].x - positioned[i].x;
        const dy = positioned[j].y - positioned[i].y;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);
        const force = repulsionForce / distSq;
        const forceX = (dx / dist) * force;
        const forceY = (dy / dist) * force;
        fx[i] -= forceX;
        fy[i] -= forceY;
        fx[j] += forceX;
        fy[j] += forceY;
      }
    }

    // Attractive forces — connected edges (Hooke's law)
    for (const { source, target } of edgePairs) {
      const dx = positioned[target].x - positioned[source].x;
      const dy = positioned[target].y - positioned[source].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - idealEdgeLength) * attractionForce;
      const forceX = (dx / dist) * force;
      const forceY = (dy / dist) * force;
      fx[source] += forceX;
      fy[source] += forceY;
      fx[target] -= forceX;
      fy[target] -= forceY;
    }

    // Center gravity — pull nodes toward center
    const cx = width / 2;
    const cy = height / 2;
    for (let i = 0; i < positioned.length; i++) {
      fx[i] += (cx - positioned[i].x) * centerGravity;
      fy[i] += (cy - positioned[i].y) * centerGravity;
    }

    // Apply forces with damping and cooling
    for (let i = 0; i < positioned.length; i++) {
      positioned[i].vx = (positioned[i].vx + fx[i]) * damping * temp;
      positioned[i].vy = (positioned[i].vy + fy[i]) * damping * temp;

      // Clamp velocity
      const speed = Math.sqrt(positioned[i].vx * positioned[i].vx + positioned[i].vy * positioned[i].vy);
      const maxSpeed = 30 * temp;
      if (speed > maxSpeed) {
        positioned[i].vx = (positioned[i].vx / speed) * maxSpeed;
        positioned[i].vy = (positioned[i].vy / speed) * maxSpeed;
      }

      positioned[i].x += positioned[i].vx;
      positioned[i].y += positioned[i].vy;

      // Keep within bounds
      positioned[i].x = Math.max(margin, Math.min(width - margin, positioned[i].x));
      positioned[i].y = Math.max(margin, Math.min(height - margin, positioned[i].y));
    }
  }

  return positioned.map(n => ({ ...n, x: Math.round(n.x), y: Math.round(n.y) }));
}

// Highlight a subgraph (selected node + N-hop neighbors)
export function getNeighborhood(nodes, edges, selectedId, maxHops = 1) {
  if (!selectedId) return { nodeIds: new Set(nodes.map(n => n.id)), edgeIndices: new Set(edges.map((_, i) => i)) };

  const adjacency = {};
  edges.forEach((e, i) => {
    if (!adjacency[e.source]) adjacency[e.source] = [];
    if (!adjacency[e.target]) adjacency[e.target] = [];
    adjacency[e.source].push({ neighbor: e.target, edgeIdx: i });
    adjacency[e.target].push({ neighbor: e.source, edgeIdx: i });
  });

  const visited = new Set([selectedId]);
  const edgeIndices = new Set();
  let frontier = [selectedId];

  for (let hop = 0; hop < maxHops; hop++) {
    const nextFrontier = [];
    for (const nodeId of frontier) {
      for (const { neighbor, edgeIdx } of (adjacency[nodeId] || [])) {
        edgeIndices.add(edgeIdx);
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nextFrontier.push(neighbor);
        }
      }
    }
    frontier = nextFrontier;
  }

  return { nodeIds: visited, edgeIndices };
}
