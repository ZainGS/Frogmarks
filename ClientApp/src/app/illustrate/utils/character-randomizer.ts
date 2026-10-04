import ShapeManager from '@zaings/salsa/shape-manager';

/** Procedural-character defaults and the "random character" generator. Pure — extracted from
 *  illustration.component (refactor-plan 2.5a). */

export const HAIR_PARAM_DEFAULTS = {
  verticalOffset: 0.62,
  capThickness: 0.00,
  backLength: 4.0,
  crownRound: 0.00,
  hairlineFront: 0.11,
  partingStyle: 'parted',
  partingPosition: 0.10,
  partingWidth: 0.25,
  bangCount: 12,
  bangLength: 0.60,
  bangCurve: 1.00,
  bangPointiness: 1.00,
  bangOffset: -0.18,
  sideLock: false,
  tailStyle: 'twin',
  tailHeight: 0.80,
  tailSpread: 0.70,
  tailLength: 4.2,
  tailThickness: 0.60,
  tailTaper: 1.00,
  tailCurl: 1.00,
  tailTip: 'point',
  rootColor: '#80bc80',
  tipColor: '#000000',
  gradient: true,
  tipFade: 1.00,
  chunkiness: 1.00,
};

export const EYE_PARAM_DEFAULTS = {
  pixelResolution: 50,
  spacing: 0.40,
  verticalPos: 0.60,
  width: 0.50,
  height: 0.34,
  tilt: 0.50,
  roundness: 1.0,
  irisRadius: 0.90,
  irisGradient: true,
  irisColorTop: '#6d523b',
  irisColorBottom: '#b8853d',
  irisColor: '#96693c',
  pupilRadius: 0.60,
  pupilColor: '#3a2010',
  upperLashThickness: 0.08,
  upperLashColor: '#111111',
  outerLashLength: 0.25,
  lowerLash: false,
  doubleEyelid: false,
  underDeco: true,
  underDecoColor: '#80bc80',
  underDecoCount: 3,
  closed: false,
};

// ── Original default character (keep for revert) ──────────────────────
export const CHAR_BODY_DEFAULTS = {
  height:      0.50,
  legLength:   1.00,
  limbThick:   0.85,
  torsoThick:  0.90,
  torsoLength: 1.00,
  headSize:    1.25,
  waist:       0.90,
  hipFront:    0.75,
  skinTone:    '#f5c5a3',
  hairRoot:    '#80bc80',
  hairTip:     '#000000',
  eyeIrisColor:'#96693c',
  topColor:    '#419041',
  topTrim:     '#315e31',
  bottomColor: '#404763',
  bottomTrim:  '#030407',
} as const;

export function rnd(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function varyColorLightness(hex: string, delta: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0, l = (max+min)/2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    if (max === r) h = ((g-b)/d + (g<b?6:0))/6;
    else if (max === g) h = ((b-r)/d + 2)/6;
    else h = ((r-g)/d + 4)/6;
  }
  l = Math.max(0.10, Math.min(0.90, l + delta));
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p+(q-p)*6*t;
    if (t < 1/2) return q;
    if (t < 2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  };
  let nr: number, ng: number, nb: number;
  if (s === 0) { nr = ng = nb = l; }
  else {
    const q = l < 0.5 ? l*(1+s) : l+s-l*s;
    const p = 2*l - q;
    nr = hue2rgb(p,q,h+1/3); ng = hue2rgb(p,q,h); nb = hue2rgb(p,q,h-1/3);
  }
  const toHex = (x: number) => Math.round(x*255).toString(16).padStart(2,'0');
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

/** Random part params for a new character; biased toward a reference body's clothing when one is given. */
export function randomizeCharacterInputs(sm: ShapeManager, biasBodyId?: string | null) {

  const skinTones    = ['#f5c5a3','#e8b492','#d9956b','#c07846','#8d5633','#6b3a22','#f2d5b0','#fce4cc','#a0724f','#7a4f2d'] as const;
  const hairColors   = ['#1a0a00','#3d1a00','#6b3a1f','#9b6b3a','#c49a6c','#e8c87a','#f5e6c8','#cc3300','#990033','#4a0066','#1a1a66','#005533','#444444','#888888','#cccccc','#80bc80','#ff6699','#ff9900'] as const;
  const eyeColors    = ['#6d523b','#4a7c59','#3a5f8a','#6b4a8a','#8a6a3a','#2a5a3a','#5a3a6b','#8a4a2a','#3a6b8a','#1a6b4a'] as const;
  const accentColors = ['#80bc80','#bc8080','#8080bc','#bc80bc','#80bcbc','#bcbc80','#bc9060','#60bc90'] as const;
  const shoeColors   = ['#1a1a1a','#2d2d2d','#4a3728','#6b4c35','#8b6848','#c4a882','#f5f5f5','#2c3e6b','#8b4513','#d2691e'] as const;
  const sockColors   = ['#ffffff','#f5f5f5','#e0e0e0','#cccccc','#1a1a1a','#2d2d2d','#8b3a3a','#3a5a8b','#3a6b3a','#6b3a6b','#d4a574'] as const;
  const clothPairs   = [
    ['#419041','#315e31'], ['#404763','#030407'], ['#c0392b','#8e2020'],
    ['#2980b9','#1a5276'], ['#8e44ad','#4a235a'], ['#e67e22','#7d5a0a'],
    ['#16a085','#0e6655'], ['#2c3e50','#1a1a2e'], ['#f39c12','#876500'],
    ['#d35400','#7a2e00'], ['#1abc9c','#0a6b50'], ['#e74c3c','#6b1010'],
    ['#9b59b6','#5b2c6f'], ['#3498db','#1a4a7a'], ['#f1c40f','#7d6608'],
    ['#e8d5b0','#9a8060'], ['#34495e','#1a2530'], ['#bdc3c7','#7f8c8d'],
  ] as const;

  const eyeIris    = pick(eyeColors);
  const [topColor, topTrim]       = pick(clothPairs);
  const [bottomColor, bottomTrim] = pick(clothPairs);
  const tailStyle   = pick(['none','twin','pony','pig'] as const);
  const bottomStyle = pick(['skirt','shorts','pants'] as const);
  const bottomLen   = bottomStyle === 'shorts' ? rnd(0.35, 0.50)
                    : bottomStyle === 'pants'  ? rnd(0.60, 1.00)
                    :                            rnd(0.60, 1.40);

  const hairOverride = {
    hairMode:        'cards' as const,
    cardifyCap:      true,
    capLayers:       6,
    verticalOffset:  rnd(0.60, 0.80),
    capThickness:    rnd(-0.20, 0.15),
    backLength:      rnd(0.00, 4.00),
    crownRound:      rnd(0.00, 0.40),
    hairlineFront:   rnd(0.00, 0.40),
    partingStyle:    pick(['fringe','parted','swept'] as const),
    partingPosition: rnd(-0.50, 0.50),
    partingWidth:    rnd(0.10, 0.40),
    bangCount:       0,
    sideLock:        Math.random() < 0.5,
    sideLockLength:  rnd(0.30, 2.00),
    sideLockWidth:   rnd(0.05, 0.25),
    sideLockCount:   Math.round(rnd(1, 4)),
    tailStyle,
    tailHeight:      rnd(-0.20, 0.70),
    tailSpread:      rnd(0.20, 0.90),
    tailLength:      rnd(1.00, 5.50),
    tailThickness:   rnd(0.15, 0.70),
    tailTaper:       rnd(0.20, 1.00),
    tailCurl:        rnd(-0.80, 0.80),
    tailTip:         pick(['point','flare','blunt'] as const),
    rootColor:       pick(hairColors),
    tipColor:        pick(hairColors),
    gradient:        true,
    tipFade:         rnd(0.30, 1.00),
    chunkiness:      rnd(0.30, 1.00),
  };
  // Salsa hair STYLES (hair-locks.ts, 2026-10-04): a random anime lock style (bob / long / side-swept / ponytail /
  // twintails / short messy / bun / hime) with the colours drawn above; the fringe stays above the eyes. Older engines
  // without the API keep the card hair above.
  const hairStyles: { name: string }[] = sm?.getHairStyles3D() ?? [];
  if (hairStyles.length) {
    const styled = sm?.getHairStylePreset3D(pick(hairStyles).name, Math.floor(Math.random() * 10000));
    if (styled) Object.assign(hairOverride, styled, {
      rootColor: hairOverride.rootColor, tipColor: hairOverride.tipColor, tipFade: hairOverride.tipFade,
      gradient: Math.random() < 0.3,
    });
  }

  // Salsa polish round 3 (T6): random eyes sit near 0.4 × 0.2 with no bottom lash — the wide range made bad eyes.
  const eyeWidth = rnd(0.37, 0.43);
  const eyeOverride = {
    spacing:            rnd(0.30, 0.50),
    verticalPos:        rnd(0.35, 0.75),
    width:              eyeWidth,
    height:             rnd(0.18, 0.22),
    tilt:               rnd(-0.30, 0.30),
    roundness:          rnd(0.30, 1.00),
    irisRadius:         rnd(0.50, 0.90),
    irisGradient:       true,
    irisColorTop:       eyeIris,
    irisColorBottom:    eyeIris,
    irisColor:          eyeIris,
    pupilRadius:        rnd(0.30, 0.60),
    upperLashThickness: rnd(0.03, 0.09),
    outerLashLength:    rnd(0.10, 0.60),
    lowerLash:          false,
    doubleEyelid:       Math.random() < 0.50,
    underDeco:          Math.random() < 0.60,
    underDecoColor:     pick(accentColors),
    underDecoCount:     Math.round(rnd(1, 5)),
  };

  const topOverride = {
    hemHeight: rnd(-0.10, 0),   // never cropped: the belly stays covered (T6)
    gradient:  true,
    trimWidth: rnd(0.10, 0.45),
    baseColor: topColor,
    trimColor: topTrim,
  };

  const bottomOverride = {
    bottomStyle,
    waistWidth:  rnd(0.05, 0.45),
    waistHeight: rnd(-0.20, 0.30),
    thickness:   rnd(0.016, 0.020),   // looseness > 0.014 (T6)
    length:      bottomLen,
    gradient:    true,
    trimWidth:   rnd(0.10, 0.45),
    baseColor:   bottomColor,
    trimColor:   bottomTrim,
  };

  const shoeStyle  = pick(['sneaker','sneaker','sneaker','boot','boot','heel'] as const);
  const shoeBase   = pick(shoeColors);
  const shoesOverride = {
    shoeStyle,
    soleThickness: 0.010,
    topCover:      rnd(0.30, 0.80),
    shaftHeight:   shoeStyle === 'boot' ? rnd(0.40, 1.20) : rnd(0.00, 0.25),
    heelHeight:    shoeStyle === 'heel' ? rnd(0.20, 0.70) : 0.10,
    toePoint:      rnd(0.00, 0.40),
    ankleCollar:   rnd(0.20, 0.70),
    thickness:     rnd(0.005, 0.015),
    baseColor:     shoeBase,
    trimColor:     varyColorLightness(shoeBase, rnd(-0.20, 0.20)),
    gradient:      Math.random() < 0.5,
    trimWidth:     rnd(0.10, 0.35),
    chunkiness:    rnd(0.30, 0.80),
  };

  const sockBase   = pick(sockColors);
  const sockTrimDelta = Math.random() < 0.5 ? rnd(0.15, 0.25) : rnd(-0.25, -0.15);
  const socksOverride = {
    sockStyle:  pick(['ankle','crew','tube'] as const),
    legHeight:  rnd(0.00, 0.50),
    thickness:  0.008,
    baseColor:  sockBase,
    trimColor:  varyColorLightness(sockBase, sockTrimDelta),
    gradient:   Math.random() < 0.4,
    trimWidth:  rnd(0.10, 0.30),
  };

  // Bias clothing color + silhouette from a reference character
  if (biasBodyId) {
    const refTop    = sm.getClothingParams3D(biasBodyId, 'top') as any;
    const refBottom = sm.getClothingParams3D(biasBodyId, 'bottom') as any;
    const nudge = () => rnd(-0.12, 0.12);
    if (refTop) {
      if (refTop.baseColor) (topOverride as any).baseColor = varyColorLightness(refTop.baseColor, rnd(-0.15, 0.15));
      if (refTop.trimColor)  (topOverride as any).trimColor  = varyColorLightness(refTop.trimColor,  rnd(-0.15, 0.15));
      if (refTop.hemHeight  != null) (topOverride as any).hemHeight = Math.max(-0.10, Math.min(0, refTop.hemHeight  + nudge()));
      if (refTop.trimWidth   != null) (topOverride as any).trimWidth  = Math.max(0.10,  Math.min(0.45, refTop.trimWidth   + nudge()));
    }
    if (refBottom) {
      if (refBottom.baseColor) (bottomOverride as any).baseColor = varyColorLightness(refBottom.baseColor, rnd(-0.15, 0.15));
      if (refBottom.trimColor) (bottomOverride as any).trimColor  = varyColorLightness(refBottom.trimColor, rnd(-0.15, 0.15));
      if (refBottom.length    != null) (bottomOverride as any).length    = Math.max(0.35, Math.min(1.40, refBottom.length    + nudge()));
      if (refBottom.trimWidth != null) (bottomOverride as any).trimWidth = Math.max(0.10, Math.min(0.45, refBottom.trimWidth + nudge()));
    }
    const refShoes = sm.getClothingParams3D(biasBodyId, 'shoes');
    if (refShoes?.baseColor) {
      const biasedShoeBase = varyColorLightness(refShoes.baseColor, rnd(-0.15, 0.15));
      (shoesOverride as any).baseColor = biasedShoeBase;
      (shoesOverride as any).trimColor = varyColorLightness(biasedShoeBase, rnd(-0.20, 0.20));
    }
    const refSocks = sm.getClothingParams3D(biasBodyId, 'socks');
    if (refSocks?.baseColor) {
      const biasedSockBase = varyColorLightness(refSocks.baseColor, rnd(-0.15, 0.15));
      const delta = Math.random() < 0.5 ? rnd(0.15, 0.25) : rnd(-0.25, -0.15);
      (socksOverride as any).baseColor = biasedSockBase;
      (socksOverride as any).trimColor = varyColorLightness(biasedSockBase, delta);
    }
  }

  return {
    waist:    rnd(0.75, 1.05),
    hipFront: rnd(0.60, 0.90),
    skinTone: pick(skinTones),
    hairOverride, eyeOverride, topOverride, bottomOverride, shoesOverride, socksOverride,
  };
}
