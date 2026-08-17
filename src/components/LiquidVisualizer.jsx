import { useEffect, useRef } from 'react';

const LiquidVisualizer = ({ pitch, volume, isActive, aiState, waveform = [], spectrum = [] }) => {
  const canvasRef = useRef(null);
  const smoothedPitch = useRef(0);
  const smoothedVolume = useRef(0);
  const time = useRef(0);
  const nodes = useRef([]);
  const aiStateRef = useRef('Idle');
  const waveformRef = useRef([]);
  const spectrumRef = useRef([]);
  const reactorImageRef = useRef(null);

  useEffect(() => {
    aiStateRef.current = aiState;
    waveformRef.current = waveform;
    spectrumRef.current = spectrum;
  }, [aiState, waveform, spectrum]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    let animationFrameId;
    const reactorImage = new Image();
    reactorImage.src = '/reactor-core.png';
    reactorImage.onload = () => {
      reactorImageRef.current = reactorImage;
    };

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const resetNodes = () => {
      const w = canvas.width / (window.devicePixelRatio || 1) || window.innerWidth;
      nodes.current = Array.from({ length: 92 }, () => ({
        x: Math.random() * w,
        y: Math.random() * 260 - 130,
        size: 1 + Math.random() * 2.6,
        speed: 0.18 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const drawArcSegments = (cx, cy, radius, segments, phase, color, width, gapRatio = 0.55) => {
      for (let i = 0; i < segments; i++) {
        const start = phase + (Math.PI * 2 * i) / segments;
        const end = start + (Math.PI * 2 / segments) * gapRatio;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, end);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
    };

    const drawWave = (w, cy, amplitude, frequency, phase, color, width, glow) => {
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      for (let x = -10; x <= w + 10; x += 4) {
        const base = Math.sin(x * frequency + phase);
        const detail = Math.sin(x * frequency * 3.2 - phase * 0.7) * 0.25;
        const noise = Math.sin(x * 0.055 + time.current * 4.5) * 0.08;
        const y = cy + (base + detail + noise) * amplitude;
        if (x === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    };

    const render = () => {
      const ratio = window.devicePixelRatio || 1;
      const w = canvas.width / ratio;
      const h = canvas.height / ratio;
      const cx = w / 2;
      const cy = h * 0.47;

      const targetPitch = isActive && pitch > 0 ? Math.min(Math.max((pitch - 70) / 850, 0), 1) : 0.22;
      const targetVolume = isActive ? Math.min(volume * 9, 1.35) : 0.2;
      const currentState = aiStateRef.current;
      const currentWaveform = waveformRef.current;
      const currentSpectrum = spectrumRef.current;
      const stateBoost = currentState === 'Thinking' ? 0.2 : currentState === 'Responding' ? 0.34 : currentState === 'Listening' ? 0.12 : 0;
      smoothedPitch.current += (targetPitch - smoothedPitch.current) * 0.08;
      smoothedVolume.current += (targetVolume + stateBoost - smoothedVolume.current) * 0.12;

      const energy = smoothedVolume.current;
      const speed = 1 + energy * 2.4 + smoothedPitch.current * 1.2;
      time.current += 0.014 * speed;

      ctx.clearRect(0, 0, w, h);

      const vignette = ctx.createRadialGradient(cx, cy, 80, cx, cy, Math.max(w, h) * 0.62);
      vignette.addColorStop(0, 'rgba(42, 214, 255, 0.18)');
      vignette.addColorStop(0.38, 'rgba(0, 82, 168, 0.08)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalAlpha = 0.44;
      for (let i = 0; i < 36; i++) {
        const x = (w / 36) * i;
        const bin = currentSpectrum.length ? currentSpectrum[Math.floor((i / 36) * currentSpectrum.length)] / 255 : 0;
        const height = 70 + Math.sin(i * 0.74 + time.current * 3) * 28 + energy * 88 + bin * 170;
        const alpha = 0.04 + (1 - Math.abs(x - cx) / cx) * 0.12;
        const bar = ctx.createLinearGradient(x, cy - height, x, cy + height);
        bar.addColorStop(0, 'rgba(0, 220, 255, 0)');
        bar.addColorStop(0.5, `rgba(0, 220, 255, ${alpha})`);
        bar.addColorStop(1, 'rgba(0, 220, 255, 0)');
        ctx.beginPath();
        ctx.strokeStyle = bar;
        ctx.lineWidth = 6;
        ctx.moveTo(x, cy - height);
        ctx.lineTo(x, cy + height);
        ctx.stroke();
      }
      ctx.restore();

      const waveGradient = ctx.createLinearGradient(0, cy, w, cy);
      waveGradient.addColorStop(0, 'rgba(0, 174, 255, 0.14)');
      waveGradient.addColorStop(0.18, 'rgba(31, 218, 255, 0.92)');
      waveGradient.addColorStop(0.5, 'rgba(238, 255, 255, 1)');
      waveGradient.addColorStop(0.82, 'rgba(25, 215, 255, 0.88)');
      waveGradient.addColorStop(1, 'rgba(0, 174, 255, 0.14)');

      if (currentWaveform.length) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 229, 255, 0.95)';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        const step = Math.max(1, Math.floor(currentWaveform.length / 220));
        let pointIndex = 0;
        for (let i = 0; i < currentWaveform.length; i += step) {
          const x = (pointIndex / 220) * w;
          const y = cy + currentWaveform[i] * (80 + energy * 130);
          if (pointIndex === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          pointIndex++;
        }
        ctx.strokeStyle = waveGradient;
        ctx.lineWidth = 4.8;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      } else {
        drawWave(w, cy, 30 + energy * 72, 0.008, -time.current * 4.1, waveGradient, 4.8, 'rgba(0, 220, 255, 0.96)');
      }
      drawWave(w, cy + 6, 22 + energy * 52, 0.012, time.current * 3.3, 'rgba(82, 243, 255, 0.48)', 2.2, 'rgba(0, 185, 255, 0.62)');
      drawWave(w, cy - 8, 15 + energy * 34, 0.017, -time.current * 5.1, 'rgba(143, 235, 255, 0.35)', 1.3, 'rgba(0, 209, 255, 0.55)');

      ctx.save();
      ctx.strokeStyle = 'rgba(0, 188, 255, 0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, 160 + i * 52, 52 + i * 15, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      nodes.current.forEach((node) => {
        node.x -= node.speed * (1 + energy * 3);
        if (node.x < -20) node.x = w + 20;
        const y = cy + node.y * 0.42 + Math.sin(time.current * 3 + node.phase) * 18;
        ctx.beginPath();
        ctx.fillStyle = `rgba(71, 216, 255, ${0.32 + Math.sin(time.current * 5 + node.phase) * 0.18})`;
        ctx.shadowColor = 'rgba(0, 212, 255, 0.8)';
        ctx.shadowBlur = 10;
        ctx.arc(node.x, y, node.size + energy * 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.shadowBlur = 0;

      const baseRadius = Math.min(w, h) < 720 ? 132 : 176;
      const stateScale = currentState === 'Listening' ? 10 : currentState === 'Thinking' ? 18 : currentState === 'Responding' ? 28 : 0;
      const pulse = baseRadius + energy * 20 + stateScale + Math.sin(time.current * 3) * 3;
      const bass = currentSpectrum.length
        ? currentSpectrum.slice(0, 18).reduce((sum, value) => sum + value, 0) / (18 * 255)
        : 0;
      const treble = currentSpectrum.length
        ? currentSpectrum.slice(80, 190).reduce((sum, value) => sum + value, 0) / (110 * 255)
        : 0;
      const reactorRadius = baseRadius;

      ctx.save();
      ctx.translate(cx, cy);

      for (let i = 0; i < 7; i++) {
        const r = pulse + 42 + i * 28;
        const alpha = Math.max(0.04, 0.2 - i * 0.02 + (currentState === 'Thinking' ? 0.05 : 0));
        drawArcSegments(0, 0, r, 28 + i * 4, time.current * (0.45 + i * 0.04 + (currentState === 'Thinking' ? 0.18 : 0)) + i, `rgba(0, 229, 255, ${alpha})`, i % 2 ? 2 : 1.2, 0.42);
      }

      if (currentState === 'Responding') {
        for (let i = 0; i < 3; i++) {
          const progress = ((time.current * 0.9 + i * 0.33) % 1);
          ctx.beginPath();
          ctx.arc(0, 0, pulse + progress * 190, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(216, 255, 255, ${(1 - progress) * 0.34})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      drawArcSegments(0, 0, pulse + 92, 13, -time.current * 0.9, 'rgba(41, 211, 255, 0.72)', 6, 0.26);
      drawArcSegments(0, 0, pulse + 134, 10, time.current * 0.62, 'rgba(0, 129, 255, 0.48)', 8, 0.2);

      const halo = ctx.createRadialGradient(0, 0, pulse * 0.32, 0, 0, pulse * 1.95);
      halo.addColorStop(0, 'rgba(216, 255, 255, 0.36)');
      halo.addColorStop(0.28, 'rgba(0, 229, 255, 0.28)');
      halo.addColorStop(0.64, 'rgba(0, 135, 255, 0.10)');
      halo.addColorStop(1, 'rgba(0, 135, 255, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, pulse * 1.95, 0, Math.PI * 2);
      ctx.fill();

      const reactorImageAsset = reactorImageRef.current;
      if (reactorImageAsset) {
        const imageSize = reactorRadius * 2.16;
        const glow = 18 + energy * 34 + bass * 24;

        // Static embedded reactor plate. This image never rotates or scales as a unit.
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, imageSize * 0.49, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalAlpha = 0.98;
        ctx.filter = `drop-shadow(0 0 ${glow}px rgba(0, 229, 255, ${0.58 + energy * 0.18}))`;
        ctx.drawImage(reactorImageAsset, -imageSize / 2, -imageSize / 2, imageSize, imageSize);
        ctx.restore();

        // Layer A: outer mechanical ring, slow clockwise rotation.
        ctx.save();
        ctx.rotate(time.current * 0.16);
        drawArcSegments(0, 0, imageSize * 0.49, 42, 0, `rgba(0, 229, 255, ${0.2 + bass * 0.34})`, 2 + bass * 2, 0.34);
        drawArcSegments(0, 0, imageSize * 0.455, 18, Math.PI / 18, `rgba(82, 243, 255, ${0.12 + bass * 0.2})`, 1, 0.18);
        ctx.restore();

        // Layer B: inner ring, counter-clockwise rotation.
        ctx.save();
        ctx.rotate(-time.current * 0.34);
        drawArcSegments(0, 0, imageSize * 0.355, 24, 0, `rgba(82, 243, 255, ${0.18 + energy * 0.28})`, 1.5 + energy * 1.2, 0.36);
        drawArcSegments(0, 0, imageSize * 0.292, 12, Math.PI / 12, `rgba(216, 255, 255, ${0.1 + treble * 0.22})`, 1, 0.22);
        ctx.restore();

        // Layer C: large triangular frame, tiny independent mechanical drift.
        ctx.save();
        ctx.rotate(Math.sin(time.current * 0.42) * 0.018 + (currentState === 'Thinking' ? Math.sin(time.current * 1.2) * 0.012 : 0));
        ctx.lineJoin = 'round';
        ctx.strokeStyle = `rgba(0, 229, 255, ${0.2 + energy * 0.18})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(0, 229, 255, 0.8)';
        ctx.shadowBlur = 10 + energy * 14;
        ctx.beginPath();
        ctx.moveTo(0, -imageSize * 0.245);
        ctx.lineTo(imageSize * 0.265, imageSize * 0.19);
        ctx.lineTo(-imageSize * 0.265, imageSize * 0.19);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -imageSize * 0.18);
        ctx.lineTo(imageSize * 0.19, imageSize * 0.13);
        ctx.lineTo(-imageSize * 0.19, imageSize * 0.13);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Layer E: traveling cyan energy along reactor pathways.
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = `rgba(216, 255, 255, ${0.22 + energy * 0.28})`;
        ctx.lineWidth = 2.2 + energy * 1.2;
        ctx.shadowColor = 'rgba(0, 229, 255, 1)';
        ctx.shadowBlur = 16 + energy * 28;
        ctx.setLineDash([imageSize * 0.05, imageSize * 0.18]);
        ctx.lineDashOffset = -time.current * (46 + energy * 140);
        [
          [[0, -0.24], [0.255, 0.19], [-0.255, 0.19], [0, -0.24]],
          [[-0.21, -0.06], [0, -0.15], [0.21, -0.06]],
          [[-0.18, 0.15], [0, 0.07], [0.18, 0.15]],
        ].forEach((path) => {
          ctx.beginPath();
          path.forEach(([px, py], index) => {
            const x = px * imageSize;
            const y = py * imageSize;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.restore();

        if (currentState === 'Thinking' || currentState === 'Responding') {
          ctx.save();
          ctx.rotate(-time.current * 1.4);
          drawArcSegments(0, 0, imageSize * 0.52, 3, 0, `rgba(216, 255, 255, ${0.22 + treble * 0.32})`, 3, 0.22);
          ctx.restore();
        }

        if (currentState === 'Responding') {
          const triangleGlow = ctx.createRadialGradient(0, -imageSize * 0.03, 0, 0, 0, imageSize * 0.24);
          triangleGlow.addColorStop(0, `rgba(216, 255, 255, ${0.22 + treble * 0.34})`);
          triangleGlow.addColorStop(1, 'rgba(0, 229, 255, 0)');
          ctx.fillStyle = triangleGlow;
          ctx.beginPath();
          ctx.moveTo(0, -imageSize * 0.22);
          ctx.lineTo(imageSize * 0.22, imageSize * 0.16);
          ctx.lineTo(-imageSize * 0.22, imageSize * 0.16);
          ctx.closePath();
          ctx.fill();
        }

        // Layer D: center triangle, voice-reactive pulse scale and glow.
        const trianglePulse = 1 + Math.min(energy * 0.16 + treble * 0.1, 0.24) + Math.sin(time.current * (3.2 + energy * 5)) * (0.018 + energy * 0.02);
        ctx.save();
        ctx.scale(trianglePulse, trianglePulse);
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = `rgba(216, 255, 255, ${0.16 + treble * 0.34 + energy * 0.18})`;
        ctx.fillStyle = `rgba(82, 243, 255, ${0.06 + treble * 0.12 + energy * 0.08})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(0, 229, 255, 0.95)';
        ctx.shadowBlur = 16 + treble * 24 + energy * 18;
        ctx.beginPath();
        ctx.moveTo(0, -imageSize * 0.205);
        ctx.lineTo(imageSize * 0.205, imageSize * 0.15);
        ctx.lineTo(-imageSize * 0.205, imageSize * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    const handleResize = () => {
      resize();
      resetNodes();
    };

    window.addEventListener('resize', handleResize);
    resize();
    resetNodes();
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [pitch, volume, isActive]);

  return <div className="canvas-container"><canvas ref={canvasRef} /></div>;
};

export default LiquidVisualizer;
