// Labels the zone's places of interest (places.json): a name and its height on a pin over each
// summit, the same size on screen near or far, hidden behind the hills in front and faded out
// when too far off to matter or when right on top of it. L shows or hides them.

import * as THREE from 'three';
import type { Place } from '../sim/places';

/** Label height as a share of the view's height (at the 60° lens). */
const SCREEN_H = 0.06;
const W = 512, H = 144;
/** The pin's tip sits this far over the summit (m), clear of the ground it labels. */
const LIFT = 25;
/** Full strength out to `far`, gone by `gone`; fades in from `near` to `close` as you leave it (m). */
const FADE = { near: 150, close: 600, far: 30000, gone: 45000 };

function labelTexture(p: Place): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.lineJoin = 'round';
  g.fillStyle = g.strokeStyle = '#fff';
  // The pin: a line down to the summit with a dot at the top of it.
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(W / 2, H);
  g.lineTo(W / 2, 100);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H - 4, 4, 0, Math.PI * 2);
  g.fill();
  const text = (s: string, y: number, font: string) => {
    g.font = font;
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(10, 14, 20, 0.85)';
    g.strokeText(s, W / 2, y);
    g.fillText(s, W / 2, y);
  };
  text(p.n, 46, '600 40px system-ui, sans-serif');
  if (p.ele !== undefined) text(`${p.ele} m`, 88, '500 30px system-ui, sans-serif');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PlacesView {
  readonly group = new THREE.Group();
  private readonly labels: { sprite: THREE.Sprite; at: THREE.Vector3 }[] = [];

  constructor(places: Place[], extent: number, heightAt: (x: number, y: number) => number) {
    for (const p of places) {
      // OSM's summit height is surveyed; the map's, between its samples, can fall short of it.
      const z = Math.max(p.ele ?? -Infinity, heightAt(p.x, p.y)) + LIFT;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(p), sizeAttenuation: false, depthWrite: false, transparent: true, toneMapped: false }));
      sprite.center.set(0.5, 0);
      const h = SCREEN_H * 2 * Math.tan(THREE.MathUtils.degToRad(30));
      sprite.scale.set((h * W) / H, h, 1);
      sprite.position.set(p.x - extent / 2, z, extent / 2 - p.y);
      sprite.renderOrder = 10;
      this.group.add(sprite);
      this.labels.push({ sprite, at: sprite.position });
    }
  }

  update(eye: THREE.Vector3): void {
    if (!this.group.visible) return;
    for (const { sprite, at } of this.labels) {
      const d = eye.distanceTo(at);
      const fade = Math.min((d - FADE.near) / (FADE.close - FADE.near), (FADE.gone - d) / (FADE.gone - FADE.far), 1);
      sprite.visible = fade > 0;
      sprite.material.opacity = Math.max(fade, 0);
    }
  }

  get visible(): boolean {
    return this.group.visible;
  }

  set visible(on: boolean) {
    this.group.visible = on;
  }
}
