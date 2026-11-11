import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useTheme } from '../context/ThemeContext';

export const ThreeBackground: React.FC = () => {
  const {
    resolvedTheme,
    wallpaperEnabled,
    wallpaperStyle,
    wallpaperIntensity,
    wallpaperOpacity
  } = useTheme();

  const mountRef = useRef<HTMLDivElement>(null);
  const [hasWebGL, setHasWebGL] = useState<boolean>(true);

  useEffect(() => {
    // If wallpaper is disabled or static style, we don't need active WebGL loop
    if (!wallpaperEnabled || wallpaperStyle === 'static') {
      return;
    }

    const container = mountRef.current;
    if (!container) return;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Detect WebGL capability and Software WebGL
    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (!gl) {
        setHasWebGL(false);
        return;
      }
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : (gl as WebGLRenderingContext).RENDERER;
      const gpu = String((gl as WebGLRenderingContext).getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      setHasWebGL(false);
      return;
    }

    // 1. Scene setup
    const scene = new THREE.Scene();
    const isDark = resolvedTheme === 'dark';

    // Set fog matching the theme
    const fogColor = isDark ? 0x060814 : 0xf8fafc;
    scene.fog = new THREE.FogExp2(fogColor, 0.035);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 16);

    // 3. Renderer setup
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance'
      });
    } catch {
      setHasWebGL(false);
      return;
    }

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDark ? 1.0 : 0.85;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Speed multiplier based on intensity
    const speedFactor =
      wallpaperIntensity === 'low' ? 0.35 : wallpaperIntensity === 'high' ? 1.35 : 0.75;

    // Disposables tracking
    const disposables: { dispose: () => void }[] = [];

    // 4. Lighting Rig
    const ambientLight = new THREE.AmbientLight(
      isDark ? 0x0f172a : 0xe2e8f0,
      isDark ? 2.2 : 2.8
    );
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(
      isDark ? 0x00d2ff : 0x0284c7,
      isDark ? 4.5 : 2.5,
      35
    );
    pointLight1.position.set(-9, 6, 7);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(
      isDark ? 0xa855f7 : 0x8b5cf6,
      isDark ? 5.0 : 2.8,
      35
    );
    pointLight2.position.set(9, -5, 5);
    scene.add(pointLight2);

    const dirLight = new THREE.DirectionalLight(
      isDark ? 0x38bdf8 : 0x60a5fa,
      isDark ? 1.2 : 0.8
    );
    dirLight.position.set(0, 10, -5);
    scene.add(dirLight);

    // 5. Build geometry according to wallpaperStyle
    const animObjects: Array<{
      update: (elapsed: number) => void;
    }> = [];

    if (wallpaperStyle === 'gradient') {
      // Style 1: Flowing Crystal Geometric Gradients
      const group = new THREE.Group();
      scene.add(group);

      // Geometry 1: Icosahedron
      const icoGeo = new THREE.IcosahedronGeometry(2.3, 0);
      disposables.push(icoGeo);
      const icoMat = new THREE.MeshPhysicalMaterial({
        color: isDark ? 0x0284c7 : 0x38bdf8,
        metalness: isDark ? 0.25 : 0.1,
        roughness: 0.15,
        transparent: true,
        opacity: isDark ? 0.35 : 0.22,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1
      });
      disposables.push(icoMat);
      const icoMesh = new THREE.Mesh(icoGeo, icoMat);
      icoMesh.position.set(-6, 2, -2);
      group.add(icoMesh);

      // Wireframe overlay
      const icoWireMat = new THREE.MeshBasicMaterial({
        color: isDark ? 0x38bdf8 : 0x0284c7,
        wireframe: true,
        transparent: true,
        opacity: isDark ? 0.35 : 0.18
      });
      disposables.push(icoWireMat);
      const icoWire = new THREE.Mesh(icoGeo, icoWireMat);
      icoMesh.add(icoWire);

      // Geometry 2: Torus Knot
      const knotGeo = new THREE.TorusKnotGeometry(1.5, 0.4, 96, 16);
      disposables.push(knotGeo);
      const knotMat = new THREE.MeshPhysicalMaterial({
        color: isDark ? 0x7c3aed : 0xa78bfa,
        metalness: isDark ? 0.35 : 0.15,
        roughness: 0.2,
        transparent: true,
        opacity: isDark ? 0.38 : 0.24,
        clearcoat: 0.8
      });
      disposables.push(knotMat);
      const knotMesh = new THREE.Mesh(knotGeo, knotMat);
      knotMesh.position.set(6.5, -2, -3);
      group.add(knotMesh);

      // Geometry 3: Dodecahedron
      const dodecGeo = new THREE.DodecahedronGeometry(1.4, 0);
      disposables.push(dodecGeo);
      const dodecMat = new THREE.MeshPhysicalMaterial({
        color: isDark ? 0x2563eb : 0x60a5fa,
        metalness: 0.3,
        roughness: 0.2,
        transparent: true,
        opacity: isDark ? 0.3 : 0.2
      });
      disposables.push(dodecMat);
      const dodecMesh = new THREE.Mesh(dodecGeo, dodecMat);
      dodecMesh.position.set(4, 4, -4);
      group.add(dodecMesh);

      // Geometry 4: Crystal Octahedron
      const octaGeo = new THREE.OctahedronGeometry(1.7, 0);
      disposables.push(octaGeo);
      const octaMat = new THREE.MeshPhysicalMaterial({
        color: isDark ? 0xc084fc : 0xc4b5fd,
        metalness: 0.4,
        roughness: 0.1,
        transparent: true,
        opacity: isDark ? 0.32 : 0.2
      });
      disposables.push(octaMat);
      const octaMesh = new THREE.Mesh(octaGeo, octaMat);
      octaMesh.position.set(-5, -4, -1);
      group.add(octaMesh);

      // Geometry 5: Ring
      const ringGeo = new THREE.TorusGeometry(3.2, 0.05, 16, 64);
      disposables.push(ringGeo);
      const ringMat = new THREE.MeshBasicMaterial({
        color: isDark ? 0x06b6d4 : 0x38bdf8,
        transparent: true,
        opacity: isDark ? 0.3 : 0.2
      });
      disposables.push(ringMat);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(0, 0, -6);
      group.add(ringMesh);

      animObjects.push({
        update: (elapsed: number) => {
          icoMesh.rotation.x = elapsed * 0.12 * speedFactor;
          icoMesh.rotation.y = elapsed * 0.16 * speedFactor;
          icoMesh.position.y = 2 + Math.sin(elapsed * 0.7 * speedFactor) * 0.35;

          knotMesh.rotation.x = elapsed * 0.15 * speedFactor;
          knotMesh.rotation.y = elapsed * 0.18 * speedFactor;
          knotMesh.position.y = -2 + Math.cos(elapsed * 0.6 * speedFactor) * 0.3;

          dodecMesh.rotation.y = elapsed * 0.14 * speedFactor;
          dodecMesh.rotation.z = elapsed * 0.1 * speedFactor;
          dodecMesh.position.x = 4 + Math.sin(elapsed * 0.5 * speedFactor) * 0.4;

          octaMesh.rotation.x = elapsed * 0.16 * speedFactor;
          octaMesh.rotation.z = elapsed * 0.12 * speedFactor;

          ringMesh.rotation.x = 1.1 + Math.sin(elapsed * 0.3 * speedFactor) * 0.1;
          ringMesh.rotation.y = elapsed * 0.08 * speedFactor;
        }
      });
    } else if (wallpaperStyle === 'aurora') {
      // Style 2: Luminous Aurora Wave Ribbons
      const ribbonsGroup = new THREE.Group();
      scene.add(ribbonsGroup);

      const ribbonCount = 5;
      const ribbons: THREE.Mesh[] = [];

      for (let r = 0; r < ribbonCount; r++) {
        const segX = 80;
        const segY = 12;
        const width = 38;
        const height = 4.5;
        const planeGeo = new THREE.PlaneGeometry(width, height, segX, segY);
        disposables.push(planeGeo);

        const colorHex = isDark
          ? r % 2 === 0
            ? 0x00d2ff
            : r % 3 === 0
            ? 0xa855f7
            : 0x10b981
          : r % 2 === 0
          ? 0x38bdf8
          : r % 3 === 0
          ? 0xc084fc
          : 0x34d399;

        const planeMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          wireframe: true,
          transparent: true,
          opacity: isDark ? 0.22 - r * 0.025 : 0.14 - r * 0.015,
          side: THREE.DoubleSide
        });
        disposables.push(planeMat);

        const mesh = new THREE.Mesh(planeGeo, planeMat);
        mesh.position.set(0, (r - ribbonCount / 2) * 2.2, -3 - r * 1.5);
        mesh.rotation.x = 0.3 + r * 0.12;
        mesh.rotation.z = -0.05 * (r + 1);
        ribbonsGroup.add(mesh);
        ribbons.push(mesh);
      }

      animObjects.push({
        update: (elapsed: number) => {
          ribbons.forEach((mesh, idx) => {
            const geo = mesh.geometry as THREE.PlaneGeometry;
            const posAttr = geo.attributes.position;
            const time = elapsed * speedFactor * 0.8 + idx * 1.5;

            for (let i = 0; i < posAttr.count; i++) {
              const x = posAttr.getX(i);
              const z = Math.sin(x * 0.25 + time) * 1.2 + Math.cos(x * 0.12 - time * 0.5) * 0.8;
              posAttr.setZ(i, z);
            }
            posAttr.needsUpdate = true;
            mesh.rotation.y = Math.sin(elapsed * 0.1 * speedFactor + idx) * 0.08;
          });
        }
      });
    }

    // 6. Subtle Floating Particles (Data Constellations)
    const particleCount =
      wallpaperStyle === 'particles'
        ? isSoftwareGl
          ? 140
          : 320
        : isSoftwareGl
        ? 60
        : 140;

    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 36;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 26;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 2;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    disposables.push(particleGeo);

    // Procedural soft glowing particle texture
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 32;
    pCanvas.height = 32;
    const pCtx = pCanvas.getContext('2d')!;
    const gradient = pCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    if (isDark) {
      gradient.addColorStop(0, 'rgba(56, 189, 248, 1)');
      gradient.addColorStop(0.35, 'rgba(168, 85, 247, 0.6)');
      gradient.addColorStop(1, 'rgba(6, 8, 20, 0)');
    } else {
      gradient.addColorStop(0, 'rgba(2, 132, 199, 0.9)');
      gradient.addColorStop(0.35, 'rgba(124, 58, 237, 0.45)');
      gradient.addColorStop(1, 'rgba(248, 250, 252, 0)');
    }
    pCtx.fillStyle = gradient;
    pCtx.fillRect(0, 0, 32, 32);

    const pTexture = new THREE.CanvasTexture(pCanvas);
    pTexture.colorSpace = THREE.SRGBColorSpace;
    disposables.push(pTexture);

    const particleMat = new THREE.PointsMaterial({
      size: wallpaperStyle === 'particles' ? 0.75 : 0.5,
      map: pTexture,
      transparent: true,
      opacity: isDark ? (wallpaperStyle === 'particles' ? 0.75 : 0.55) : (wallpaperStyle === 'particles' ? 0.5 : 0.35),
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false
    });
    disposables.push(particleMat);

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 7. Mouse Parallax handling
    let targetMouseX = 0;
    let targetMouseY = 0;
    let mouseX = 0;
    let mouseY = 0;

    const onPointerMove = (e: MouseEvent) => {
      targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
      targetMouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    // 8. Resize handling
    const onResize = () => {
      if (!renderer || !camera) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // 9. Animation Loop
    let animId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      // Smooth mouse damping
      mouseX += (targetMouseX - mouseX) * 0.035;
      mouseY += (targetMouseY - mouseY) * 0.035;

      camera.position.x = mouseX * 1.5;
      camera.position.y = mouseY * 1.0;
      camera.lookAt(0, 0, 0);

      if (!prefersReducedMotion) {
        // Animate registered objects
        animObjects.forEach(obj => obj.update(elapsed));

        // Gentle particle drift
        particles.rotation.y = elapsed * 0.02 * speedFactor;
        particles.rotation.x = elapsed * 0.01 * speedFactor;
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      disposables.forEach(d => d.dispose());
      renderer.dispose();
    };
  }, [resolvedTheme, wallpaperEnabled, wallpaperStyle, wallpaperIntensity]);

  // If wallpaper is completely disabled
  if (!wallpaperEnabled) {
    return (
      <div
        className="fixed inset-0 pointer-events-none -z-10 transition-colors duration-500"
        style={{
          background: resolvedTheme === 'dark' ? '#060814' : '#f8fafc'
        }}
      />
    );
  }

  // Dynamic background style based on theme & style
  const darkGradient =
    wallpaperStyle === 'aurora'
      ? 'radial-gradient(ellipse 100% 70% at 50% -10%, #082f49 0%, #060814 65%, #020408 100%)'
      : 'radial-gradient(ellipse 90% 80% at 50% -10%, #0d1538 0%, #060814 60%, #03040a 100%)';

  const lightGradient =
    wallpaperStyle === 'aurora'
      ? 'radial-gradient(ellipse 100% 70% at 50% -10%, #e0f2fe 0%, #f8fafc 65%, #f1f5f9 100%)'
      : 'radial-gradient(ellipse 90% 80% at 50% -10%, #f0fdf4 0%, #f8fafc 50%, #eff6ff 100%)';

  return (
    <div
      className="fixed inset-0 pointer-events-none -z-10 overflow-hidden transition-colors duration-500"
      style={{
        background: resolvedTheme === 'dark' ? darkGradient : lightGradient
      }}
    >
      {/* Three.js canvas container with custom opacity */}
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full transition-opacity duration-300"
        style={{ opacity: wallpaperOpacity }}
      />

      {/* Futuristic soft grid vignette */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        style={{
          opacity: resolvedTheme === 'dark' ? 0.035 : 0.02,
          backgroundImage:
            resolvedTheme === 'dark'
              ? 'linear-gradient(rgba(56, 189, 248, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.3) 1px, transparent 1px)'
              : 'linear-gradient(rgba(2, 132, 199, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(2, 132, 199, 0.3) 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }}
      />

      {/* Ambient gradient wash */}
      {resolvedTheme === 'dark' ? (
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-950/15 via-transparent to-purple-950/20 pointer-events-none" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-100/20 via-transparent to-purple-100/25 pointer-events-none" />
      )}

      {/* Fallback glow if WebGL fails */}
      {!hasWebGL && (
        <div
          className={`absolute inset-0 ${
            resolvedTheme === 'dark'
              ? 'bg-gradient-to-tr from-cyan-950/20 via-transparent to-purple-950/25'
              : 'bg-gradient-to-tr from-cyan-100/30 via-transparent to-purple-100/35'
          }`}
        />
      )}
    </div>
  );
};
