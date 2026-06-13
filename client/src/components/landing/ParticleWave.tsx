import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Animated particle-wave background for the landing hero.
 * A grid of points undulates like a market surface; mostly dim gold with
 * sparse bright amber/emerald "signal" particles. Respects reduced motion.
 */
export default function ParticleWave() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0c0c0d, 0.045);

    const camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      100
    );
    camera.position.set(0, 4.6, 12);
    camera.lookAt(0, -0.5, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    mount.appendChild(renderer.domElement);

    const COLS = 160;
    const ROWS = 56;
    const SPACING = 0.42;
    const count = COLS * ROWS;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const dim = new THREE.Color('#574a23');
    const amber = new THREE.Color('#f59e0b');
    const bright = new THREE.Color('#fcd34d');
    const emerald = new THREE.Color('#10b981');

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        positions[i * 3] = (c - COLS / 2) * SPACING;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = (r - ROWS / 2) * SPACING;

        const roll = Math.random();
        const col = roll > 0.985 ? emerald : roll > 0.96 ? bright : roll > 0.88 ? amber : dim;
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;

    const mouse = { x: 0, y: 0 };
    const onMouseMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove);

    const waveAt = (x: number, z: number, t: number) =>
      Math.sin(x * 0.32 + t * 0.9) * 0.5 +
      Math.cos(z * 0.38 + t * 0.6) * 0.4 +
      Math.sin((x + z) * 0.18 + t * 0.4) * 0.3;

    let raf = 0;
    const renderFrame = (t: number) => {
      for (let i = 0; i < count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        posAttr.setY(i, waveAt(x, z, t));
      }
      posAttr.needsUpdate = true;

      camera.position.x += (mouse.x * 1.2 - camera.position.x) * 0.04;
      camera.position.y += (4.6 - mouse.y * 0.8 - camera.position.y) * 0.04;
      camera.lookAt(0, -0.5, 0);

      renderer.render(scene, camera);
    };

    if (reduceMotion) {
      renderFrame(0);
    } else {
      const animate = (now: number) => {
        renderFrame(now / 1000);
        raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);
    }

    const onResize = () => {
      const w = mount.clientWidth;
      const h = Math.max(mount.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (reduceMotion) renderFrame(0);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />;
}
