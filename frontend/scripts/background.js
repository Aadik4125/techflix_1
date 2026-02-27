// 3D Neural Network Background
    function init3DBackground() {
      const canvas = document.getElementById('bg-canvas');
      if (!canvas || !window.THREE) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.z = 250;

      const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);

      const particleCount = 200;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);

      for (let i = 0; i < particleCount * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 600;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 3.5,
        transparent: true,
        opacity: 0.95,
      });

      const particles = new THREE.Points(geometry, material);

      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.15
      });

      const lineGeometry = new THREE.BufferGeometry();
      const linePositions = [];

      for (let i = 0; i < particleCount; i++) {
        for (let j = i + 1; j < particleCount; j++) {
          const idx1 = i * 3;
          const idx2 = j * 3;
          const dx = positions[idx1] - positions[idx2];
          const dy = positions[idx1 + 1] - positions[idx2 + 1];
          const dz = positions[idx1 + 2] - positions[idx2 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 80) {
            linePositions.push(
              positions[idx1], positions[idx1 + 1], positions[idx1 + 2],
              positions[idx2], positions[idx2 + 1], positions[idx2 + 2]
            );
          }
        }
      }

      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      const lines = new THREE.LineSegments(lineGeometry, lineMaterial);

      const group = new THREE.Group();
      group.add(particles);
      group.add(lines);
      scene.add(group);

      let mouseX = 0;
      let mouseY = 0;
      document.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX - window.innerWidth / 2) * 0.05;
        mouseY = (e.clientY - window.innerHeight / 2) * 0.05;
      });

      const clock = new THREE.Clock();

      function animate() {
        requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();

        group.rotation.y += 0.005;
        group.rotation.x += 0.0025;

        camera.position.x += (mouseX - camera.position.x) * 0.05;
        camera.position.y += (-mouseY - camera.position.y) * 0.05;
        camera.lookAt(scene.position);

        material.size = 2 + Math.sin(elapsedTime * 2) * 0.5;

        renderer.render(scene, camera);
      }

      window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });

      animate();
    }

    window.addEventListener('DOMContentLoaded', () => {
      init3DBackground();
    });
