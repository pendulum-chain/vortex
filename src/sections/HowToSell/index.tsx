import { useEffect, useRef } from 'preact/hooks';
import * as THREE from 'three';

const steps = [
  {
    id: 1,
    text: 'Connect your wallet and enter the amount in cryptocurrency you wish to sell.',
  },
  {
    id: 2,
    text: 'Continue to the partner site and provide your email and payment details.',
  },
  {
    id: 3,
    text: 'Return to VortexFinance.co and confirm the transaction in your wallet.',
  },
  {
    id: 4,
    text: 'Wait for the funds to arrive in your account.',
  },
];

export const HowToSell = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current });

    const vortexShader = {
      uniforms: {
        time: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;

        void main() {
          vec2 st = vUv * 2.0 - 1.0;

          float angle = atan(st.y, st.x);
          float radius = length(st);

          // Increased spiral intensity - repetition of pattern elements
          float spiral = sin(angle * 3.0 + radius * 4.0 - time * 0.9) * 1.2;

          // Adjusted fade for better visibility
          float fade = 1.0 - smoothstep(0.0, 0.95, radius);

          // Increased color intensity and brightness
          float finalColor = spiral * fade * 0.14;
          vec3 color = vec3(0.85, 0.95, 1.0) * finalColor;

          // Increased opacity
          gl_FragColor = vec4(color, 0.35);
        }
      `,
    };

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial(vortexShader);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      const { width, height } = canvasRef.current!.getBoundingClientRect();
      renderer.setSize(width, height, false);
    };

    window.addEventListener('resize', resize);
    resize();

    let animationFrameId: number;
    const animate = (time: number) => {
      material.uniforms.time.value = time * 0.001;
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate(0);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative py-20 overflow-hidden bg-blue-950">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="container relative z-10 px-4 mx-auto mb-12">
        <div className="mb-12 text-center">
          <h2 className="font-bold text-blue-700 ">HOW TO SELL</h2>
          <p className="text-5xl text-white">How to sell cryptocurrency online with Vortex Finance</p>
        </div>
        <div className="relative flex justify-center">
          <div className="relative flex flex-wrap justify-between w-full max-w-4xl gap-8">
            {steps.map((step) => (
              <div key={step.id} className="relative z-10 group">
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center w-20 h-20 mb-4 transition-all duration-300 bg-black border rounded-full shadow-lg group-hover:scale-105 ">
                    <span className="text-3xl font-bold text-white">{step.id}</span>
                  </div>
                  <div className="w-48 text-center transition-all duration-300 group-hover:transform group-hover:translate-y-1">
                    <h3 className="text-xs text-white">{step.text}</h3>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
