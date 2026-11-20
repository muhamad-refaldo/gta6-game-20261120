// Solara City 3D — pedestrians: sidewalk walkers who flee from gunfire and cars.
import * as THREE from 'three';
import { G, rand, randi, pick, dist2, clamp } from './state.js';

const SHIRTS = [0xe84a5f, 0x4a90e8, 0x7bc47f, 0xe8b84a, 0x9b59b6, 0xeeeeee, 0x2ecc71];

export function spawnPeds(n = 22) {
  for (let k = 0; k < n; k++) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRTS) });
    const skin = new THREE.MeshLambertMaterial({ color: pick([0xd9a066, 0x8a5a3b, 0xf0c8a0, 0x5a3a28]) });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2b2f38 });
    const mk = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
    };
    mk(0.8, 0.9, 0.45, shirt, 0, 1.3, 0);
    mk(0.5, 0.5, 0.5, skin, 0, 2.05, 0);
    const legL = mk(0.3, 0.85, 0.36, pants, -0.2, 0.42, 0);
    const legR = mk(0.3, 0.85, 0.36, pants, 0.2, 0.42, 0);
    const x = rand(-170, 170), z = rand(-170, 190);
    g.position.set(x, 0, z);
    G.scene.add(g);
    G.peds.push({
      group: g, legL, legR, x, z, yaw: rand(0, Math.PI * 2),
      speed: rand(1.2, 2.4), phase: rand(0, 6), fleeing: 0, target: null,
    });
  }
}

export function scarePeds(x, z, radius = 22) {
  for (const p of G.peds) {
    if (dist2(p.x, p.z, x, z) < radius) p.fleeing = 3 + Math.random() * 3;
  }
}

export function updatePeds(dt) {
  const px = G.player.pos.x, pz = G.player.pos.z;
  for (const p of G.peds) {
    if (p.fleeing > 0) {
      p.fleeing -= dt;
      const dx = p.x - px, dz = p.z - pz;
      const d = Math.hypot(dx, dz) || 1;
      p.x += (dx / d) * 5.5 * dt; p.z += (dz / d) * 5.5 * dt;
      p.yaw = Math.atan2(dx, dz);
      p.phase += dt * 14;
    } else {
      p.phase += dt * 6;
      p.x += Math.sin(p.yaw) * p.speed * dt;
      p.z += Math.cos(p.yaw) * p.speed * dt;
      if (Math.random() < 0.004) p.yaw = rand(0, Math.PI * 2);
      if (Math.abs(p.x) > 185 || Math.abs(p.z - 20) > 200) p.yaw += Math.PI;
    }
    p.x = clamp(p.x, -190, 395); p.z = clamp(p.z, -190, 255);
    const sw = Math.sin(p.phase) * 0.5;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    p.group.position.set(p.x, 0, p.z);
    p.group.rotation.y = p.yaw;
  }
}
