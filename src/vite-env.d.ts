/// <reference types="vite/client" />

// SVG files — imported as React components (via @vitejs/plugin-react + SVGR) or as URL strings.
declare module "*.svg" {
  import * as React from "react";
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;
  const src: string;
  export default src;
}

// Markdown files — imported as raw string content via Vite's ?raw suffix.
declare module "*.md?raw" {
  const content: string;
  export default content;
}
