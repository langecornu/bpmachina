// The parts of the WebAssembly JavaScript API the Faust voices use (src/audio/faust, scripts/build-dsp.js). TypeScript
// declares WebAssembly only in its DOM and worker libraries, which this project's type check leaves out (tsconfig.json):
// Node and every browser have it.
declare namespace WebAssembly {
  class Module {
    constructor(bytes: BufferSource);
    static imports(module: Module): { module: string; name: string; kind: string }[];
  }
  class Instance {
    constructor(module: Module, imports?: Record<string, Record<string, unknown>>);
    readonly exports: Record<string, unknown>;
  }
  class Memory {
    readonly buffer: ArrayBuffer;
    grow(pages: number): number;
  }
  function compile(bytes: BufferSource): Promise<Module>;
}
