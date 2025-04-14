import type { FC } from '../../lib/teact/teact';
import React, {
  memo, useEffect, useRef, useState, useCallback,
} from '../../lib/teact/teact';

import { requestMutation } from '../../lib/fasterdom/fasterdom';
import { useThrottleForHeavyAnimation } from '../../hooks/useHeavyAnimation';
import useLastCallback from '../../hooks/useLastCallback';
import useResizeObserver from '../../hooks/useResizeObserver';
import useDevicePixelRatio from '../../hooks/window/useDevicePixelRatio';
import { addActionHandler } from '../../global';
import { ActionReturnType } from '../../global/types/globalState';

import './GradientWallpaper.scss';
import buildClassName from '../../util/buildClassName';

const VERTEX_SHADER = `attribute vec4 a_position;
void main() {
  gl_Position = a_position;
}`;

const FRAGMENT_SHADER = `precision highp float;

uniform vec2 resolution;

uniform vec3 color1;
uniform vec3 color2;
uniform vec3 color3;
uniform vec3 color4;

uniform vec2 color1Pos;
uniform vec2 color2Pos;
uniform vec2 color3Pos;
uniform vec2 color4Pos;

void main() {
  vec2 position = gl_FragCoord.xy / resolution.xy;
  position.y = 1.0 - position.y;

  float dp1 = distance(position, color1Pos);
  float dp2 = distance(position, color2Pos);
  float dp3 = distance(position, color3Pos);
  float dp4 = distance(position, color4Pos);
  float minD = min(dp1, min(dp2, min(dp3, dp4)));
  float p = 3.0;

  dp1 = pow(1.0 - (dp1 - minD), p);
  dp2 = pow(1.0 - (dp2 - minD), p);
  dp3 = pow(1.0 - (dp3 - minD), p);
  dp4 = pow(1.0 - (dp4 - minD), p);
  float dpt = abs(dp1 + dp2 + dp3 + dp4);

  gl_FragColor =
    (vec4(color1 / 255.0, 1.0) * dp1 / dpt) +
    (vec4(color2 / 255.0, 1.0) * dp2 / dpt) +
    (vec4(color3 / 255.0, 1.0) * dp3 / dpt) +
    (vec4(color4 / 255.0, 1.0) * dp4 / dpt);
}`;

const KEY_POINTS: [number, number][] = [
  [0.265, 0.582], //0
  [0.176, 0.918], //1
  [1 - 0.585, 1 - 0.164], //0
  [0.644, 0.755], //1
  [1 - 0.265, 1 - 0.582], //0
  [1 - 0.176, 1 - 0.918], //1
  [0.585, 0.164], //0
  [1 - 0.644, 1 - 0.755] //1
];

type Uniforms = {
  resolution: WebGLUniformLocation;
  color: WebGLUniformLocation[];
  position: WebGLUniformLocation[];
};

function hexToVec3(
  hex: string
): readonly [r: number, g: number, b: number] {
  if (hex.startsWith('#')) {
    hex = hex.slice(1)
  }

  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)

  return [r, g, b] as const
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function distance(p1: number[], p2: number[]) {
  // Weird distance function
  return Math.abs(p1[1] - p2[1]);
}

type OwnProps = {
  colors: string,
  rotateOnSend?: boolean,
  className?: string,
  dark?: boolean,
  opacity?: number,
};

function createSharedCanvas(): [HTMLCanvasElement, WebGLRenderingContext, Uniforms] | [null, null, null] {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  if (!gl) return [null, null, null];
  const uniforms = prepareCanvas(gl);
  if (!uniforms) return [null, null, null];
  return [canvas, gl, uniforms];
}

function prepareCanvas(gl: WebGLRenderingContext): Uniforms | null {
  const program = gl.createProgram();
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!program || !vertexShader || !fragmentShader) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.useProgram(program);
  
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  if (positionLocation === -1) return null;

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
  ]), gl.STATIC_DRAW);
  
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  return {
    resolution: gl.getUniformLocation(program, 'resolution')!,
    color: [
      gl.getUniformLocation(program, 'color1')!,
      gl.getUniformLocation(program, 'color2')!,
      gl.getUniformLocation(program, 'color3')!,
      gl.getUniformLocation(program, 'color4')!,
    ],
    position: [
      gl.getUniformLocation(program, 'color1Pos')!,
      gl.getUniformLocation(program, 'color2Pos')!,
      gl.getUniformLocation(program, 'color3Pos')!,
      gl.getUniformLocation(program, 'color4Pos')!,
    ],
  };
}

const [sharedCanvas, sharedGl, sharedUniforms] = createSharedCanvas();

const GradientWallpaper: FC<OwnProps> = ({
  colors,
  rotateOnSend = false,
  className,
  dark = false,
  opacity = 1,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = useDevicePixelRatio();
  const [isVisible, setIsVisible] = useState(false);
  
  const uniformsRef = useRef<Uniforms | null>(null);

  const useSharedCanvas = !rotateOnSend;
  
  const stateRef = useRef({
    keyShift: 0,
    targets: [[0, 0], [0, 0], [0, 0], [0, 0]] as [number, number][],
    positions: [[0, 0], [0, 0], [0, 0], [0, 0]] as [number, number][],
    speed: 0.1,
    animating: false
  });

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl = useSharedCanvas ? sharedGl : canvas.getContext('webgl')!;
    let uniforms = useSharedCanvas ? sharedUniforms : uniformsRef.current;
    if (!uniforms) return;

    if (useSharedCanvas) {
      sharedCanvas!.width = canvas.width;
      sharedCanvas!.height = canvas.height;
    }

    const { width, height } = canvas;

    if (!gl) return;

    gl.viewport(0, 0, width, height);

    gl.uniform2f(uniforms.resolution, width, height);
    for (let i = 0; i < 4; i++) {
      gl.uniform3fv(uniforms.color[i], hexToVec3(colors.split(',')[i]));
      gl.uniform2fv(uniforms.position[i], stateRef.current.positions[i]);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (useSharedCanvas) {
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(sharedCanvas!, 0, 0);
    }
  }, [colors]);

  function rotateTargets() {
    for (let i = 0; i < 4; i++) {
      stateRef.current.targets[i] = [...KEY_POINTS[(stateRef.current.keyShift + i * 2) % KEY_POINTS.length]];
    }
    stateRef.current.keyShift = (stateRef.current.keyShift + 1) % KEY_POINTS.length;
  }

  function updatePositions() {
    for (let i = 0; i < 4; i++) {
      stateRef.current.positions[i] = stateRef.current.targets[i];
    }
  }

  function animate() {
    stateRef.current.animating = true;
    if (stateRef.current.positions.some((p, i) => distance(p, stateRef.current.targets[i]) > 0.01)) {
      for (let i = 0; i < 4; i++) {
        stateRef.current.positions[i][0] = stateRef.current.positions[i][0] * (1 - stateRef.current.speed) + stateRef.current.targets[i][0] * stateRef.current.speed;
        stateRef.current.positions[i][1] = stateRef.current.positions[i][1] * (1 - stateRef.current.speed) + stateRef.current.targets[i][1] * stateRef.current.speed;
      }
      render();
      requestAnimationFrame(animate)
    } else {
      stateRef.current.animating = false;
    }
  }

  useEffect(() => {
    rotateTargets();
    updatePositions();
  }, []);

  if (rotateOnSend) {
    addActionHandler('sendMessage', (global, actions, payload): ActionReturnType => {
      rotateTargets();
      if (!stateRef.current.animating) requestAnimationFrame(animate);
    });
  }

  useEffect(() => {
    render();
  }, [colors]);

  if (!useSharedCanvas) {
    useEffect(() => {
      const gl = canvasRef.current!.getContext('webgl')!;
      if (!gl) return;
      uniformsRef.current = prepareCanvas(gl);
      render();
    }, []);
  }

  const updateCanvas = useLastCallback(render);
  const updateCanvasAfterHeavyAnimation = useThrottleForHeavyAnimation(updateCanvas, [updateCanvas]);
  useEffect(() => {
    updateCanvasAfterHeavyAnimation();
  }, [updateCanvasAfterHeavyAnimation]);

  const updateCanvasSize = useThrottleForHeavyAnimation((parentWidth: number, parentHeight: number) => {
    requestMutation(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = parentWidth * dpr;
      canvas.height = parentHeight * dpr;

      canvas.style.width = `${parentWidth}px`;
      canvas.style.height = `${parentHeight}px`;

      render();
      setIsVisible(true);
    });
  }, [dpr]);

  const handleResize = useThrottleForHeavyAnimation((entry: ResizeObserverEntry) => {
    const { width, height } = entry.contentRect;

    updateCanvasSize(width, height);
  }, [updateCanvasSize]);

  useResizeObserver(ref, handleResize);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const { width, height } = container.getBoundingClientRect();

    updateCanvasSize(width, height);
  }, [updateCanvasSize]);

  return (
    <div
      ref={ref}
      className={buildClassName('GradientWallpaper', className, !isVisible && 'hidden', dark && 'dark')}
      style={`--pattern-opacity: ${opacity}`}
    >
      <canvas
        ref={canvasRef}
        className="GradientWallpaper-canvas"
      />
    </div>
  );
};

export default memo(GradientWallpaper);
