// The Buggy's decal: the Piratas Aéreos Lanzarote badge, white on transparent so it reads on the
// black paint (public/decals/piratas-aereos.png).

import * as THREE from 'three';

let texture: THREE.Texture | null = null;

export function logoTexture(): THREE.Texture {
  if (texture) return texture;
  texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}decals/piratas-aereos.png`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
