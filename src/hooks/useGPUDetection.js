/**
 * GPU Detection Hook for NimbusOS
 * Detects GPU capabilities and recommends performance level
 * 
 * Returns:
 *   - gpuInfo: { vendor, renderer, tier, dedicated }
 *   - recommendedLevel: 'full' | 'balanced' | 'performance'
 *   - isLoading: boolean
 */

import { useState, useEffect } from 'react';

// Known dedicated GPU patterns
const DEDICATED_GPU_PATTERNS = [
  /NVIDIA/i,
  /GeForce/i,
  /Quadro/i,
  /RTX/i,
  /GTX/i,
  /AMD Radeon(?! Graphics)/i,  // AMD Radeon but NOT "AMD Radeon Graphics" (integrated)
  /Radeon RX/i,
  /Radeon Pro/i,
  /Radeon VII/i,
  /Vega \d+/i,                  // Vega 56, 64, etc (dedicated)
];

// Known integrated GPU patterns
const INTEGRATED_GPU_PATTERNS = [
  /Intel.*HD Graphics/i,
  /Intel.*UHD Graphics/i,
  /Intel.*Iris/i,
  /Intel.*Xe/i,
  /AMD Radeon Graphics/i,       // APU integrated
  /AMD Radeon Vega \d+ Graphics/i, // Ryzen APU
  /Adreno/i,                    // Mobile
  /Mali/i,                      // Mobile
  /PowerVR/i,                   // Mobile
  /Apple GPU/i,                 // M1/M2 (capable but integrated)
  /Apple M\d/i,
];

// Very weak / software renderers
const SOFTWARE_PATTERNS = [
  /SwiftShader/i,
  /llvmpipe/i,
  /Microsoft Basic/i,
  /Software/i,
  /Mesa.*softpipe/i,
];

function detectGPU() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
      return {
        vendor: 'Unknown',
        renderer: 'No WebGL',
        tier: 'none',
        dedicated: false,
        rawVendor: null,
        rawRenderer: null,
      };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    let vendor = 'Unknown';
    let renderer = 'Unknown';

    if (debugInfo) {
      vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown';
      renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown';
    } else {
      // Fallback
      vendor = gl.getParameter(gl.VENDOR) || 'Unknown';
      renderer = gl.getParameter(gl.RENDERER) || 'Unknown';
    }

    // Determine tier
    let tier = 'integrated';
    let dedicated = false;

    // Check for software rendering first
    if (SOFTWARE_PATTERNS.some(p => p.test(renderer) || p.test(vendor))) {
      tier = 'software';
      dedicated = false;
    }
    // Check for dedicated GPU
    else if (DEDICATED_GPU_PATTERNS.some(p => p.test(renderer) || p.test(vendor))) {
      tier = 'dedicated';
      dedicated = true;
    }
    // Check for integrated
    else if (INTEGRATED_GPU_PATTERNS.some(p => p.test(renderer) || p.test(vendor))) {
      tier = 'integrated';
      dedicated = false;
    }
    // Apple Silicon special case - capable but integrated
    else if (/Apple/.test(vendor) || /Apple/.test(renderer)) {
      tier = 'apple-silicon';
      dedicated = false; // Technically integrated but very capable
    }

    // Clean up canvas
    canvas.remove();

    return {
      vendor: cleanVendorName(vendor),
      renderer: cleanRendererName(renderer),
      tier,
      dedicated,
      rawVendor: vendor,
      rawRenderer: renderer,
    };
  } catch (e) {
    console.warn('GPU detection failed:', e);
    return {
      vendor: 'Unknown',
      renderer: 'Detection failed',
      tier: 'unknown',
      dedicated: false,
      rawVendor: null,
      rawRenderer: null,
    };
  }
}

function cleanVendorName(vendor) {
  if (/NVIDIA/i.test(vendor)) return 'NVIDIA';
  if (/AMD|ATI/i.test(vendor)) return 'AMD';
  if (/Intel/i.test(vendor)) return 'Intel';
  if (/Apple/i.test(vendor)) return 'Apple';
  if (/Qualcomm/i.test(vendor)) return 'Qualcomm';
  if (/ARM/i.test(vendor)) return 'ARM';
  return vendor;
}

function cleanRendererName(renderer) {
  // Remove "ANGLE (...)" wrapper if present
  const angleMatch = renderer.match(/ANGLE \(([^)]+)\)/);
  if (angleMatch) {
    renderer = angleMatch[1];
  }
  // Remove "Direct3D11" etc suffixes
  renderer = renderer.replace(/,?\s*Direct3D\d*/gi, '');
  renderer = renderer.replace(/,?\s*vs_\d+_\d+/gi, '');
  renderer = renderer.replace(/,?\s*ps_\d+_\d+/gi, '');
  // Trim
  return renderer.trim();
}

function getRecommendedLevel(gpuInfo) {
  // Additional heuristics
  const cores = navigator.hardwareConcurrency || 2;
  const memory = navigator.deviceMemory || 4; // GB, if available
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isLowEndDevice = cores <= 2 || memory <= 2;

  // Software rendering = always performance mode
  if (gpuInfo.tier === 'software' || gpuInfo.tier === 'none') {
    return 'performance';
  }

  // Dedicated GPU = full effects
  if (gpuInfo.dedicated) {
    return 'full';
  }

  // Apple Silicon = full (very capable)
  if (gpuInfo.tier === 'apple-silicon') {
    return 'full';
  }

  // Mobile devices = balanced or performance
  if (isMobile) {
    return isLowEndDevice ? 'performance' : 'balanced';
  }

  // Integrated GPU
  if (gpuInfo.tier === 'integrated') {
    // Intel Xe and Iris Plus are decent
    if (/Iris|Xe/i.test(gpuInfo.renderer)) {
      return 'balanced';
    }
    // Old Intel HD = performance
    if (/HD Graphics [1-5]\d{2}/i.test(gpuInfo.renderer)) {
      return 'performance';
    }
    // AMD APU Vega = balanced
    if (/Vega/i.test(gpuInfo.renderer)) {
      return 'balanced';
    }
    // Default integrated = balanced
    return isLowEndDevice ? 'performance' : 'balanced';
  }

  // Unknown = balanced (safe default)
  return 'balanced';
}

export function useGPUDetection() {
  const [state, setState] = useState({
    gpuInfo: null,
    recommendedLevel: null,
    isLoading: true,
  });

  useEffect(() => {
    // Small delay to not block initial render
    const timer = setTimeout(() => {
      const gpuInfo = detectGPU();
      const recommendedLevel = getRecommendedLevel(gpuInfo);
      
      setState({
        gpuInfo,
        recommendedLevel,
        isLoading: false,
      });

      // Log for debugging
      console.log('[NimbusOS] GPU Detection:', {
        ...gpuInfo,
        recommendedLevel,
        cores: navigator.hardwareConcurrency,
        memory: navigator.deviceMemory,
      });
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return state;
}

// Standalone function for immediate detection (used in ThemeContext init)
export function detectGPUSync() {
  const gpuInfo = detectGPU();
  return {
    gpuInfo,
    recommendedLevel: getRecommendedLevel(gpuInfo),
  };
}

export default useGPUDetection;
