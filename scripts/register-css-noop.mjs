import { registerHooks } from "node:module";

const cssNoopModule = "data:text/javascript,export default {};";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".css")) {
      return {
        shortCircuit: true,
        url: cssNoopModule,
      };
    }

    return nextResolve(specifier, context);
  },
});
