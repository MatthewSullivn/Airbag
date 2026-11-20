# Third-party code in the page

## tweenly

The chart kit and several small components come from [tweenly](https://trytweenly.vercel.app) ([source](https://github.com/mirukullacode/tweenly)), pulled from its public registry on Nov 18, 2026:

- `src/lib/chart-kit.tsx`
- `src/hooks/use-reduced-motion.ts`
- the files in `src/components/ui/` that name tweenly at the top (the segmented control, the fade-in and the other small pieces)

Each file says so at the top. Our own changes inside those files are marked with `Airbag:`. Our charts (`src/charts/`) are written on top of the kit.

```
MIT License

Copyright (c) 2026 Manjunath Irukulla

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Magic UI

Three small components come from [Magic UI](https://magicui.design) ([source](https://github.com/magicuidesign/magicui), also on 21st.dev), pulled from its public registry on Nov 18, 2026:

- `src/components/ui/animated-beam.tsx` (the light that travels along the money map)
- `src/components/ui/border-beam.tsx` (the beam round a card while the loan is at risk)
- `src/components/ui/dot-pattern.tsx` (the field of dots on the first screen)

Each file says so at the top and lists our changes. MIT License, Copyright (c) Magic UI, with the same permission and warranty text as above.

## Written here, after components on 21st.dev

Matthew picked five components on 21st.dev for the look. They are our own code, written from how the originals look and move. No code from them is used. On Nov 20, 2026 the page was restyled to look less like a template, and most of them went:

- `src/components/ui/tilt-frame.tsx`, after the Container Scroll Animation (Aceternity UI). The frame is still on the page, now shown flat, without the tilt.
- `src/components/ui/spotlight-card.tsx`, after the Spotlight Card. No longer on the page.
- The Shiny Button and the Metallic Button (Hyperiux) were the looks of `.btn-shiny` / `.btn-metal` in `src/styles.css`. Those rules are now plain buttons of our own.
- The section built after Bounce Card Features was taken off on Nov 19, 2026, to shorten the page.

`src/components/gemini-market-card.tsx` is also ours. It is drawn to look like a market card on gemini.com and shows Gemini's live figures; it says it is not Gemini's and links to the real market.

## Fonts

Archivo (headings and big numbers, since Nov 20, 2026), Geist (text) and JetBrains Mono, through the `@fontsource` packages. All three are under the SIL Open Font License 1.1. (Bricolage Grotesque and Instrument Serif, also OFL, were used before that.)

## Packages

React, Motion, Tailwind CSS, Vite, lucide-react, clsx and tailwind-merge: see `package.json`. Each is MIT or ISC licensed.
