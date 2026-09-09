import Module from 'module';
import path from 'path';
import fs from 'fs';
type ResolveFilename = (request: string, parent: NodeModule | null, isMain: boolean, options?: unknown) => string;
type ModuleWithResolveFilename = typeof Module & { _resolveFilename: ResolveFilename };
const runtimeModule = Module as ModuleWithResolveFilename;
const originalResolveFilename = runtimeModule._resolveFilename;
runtimeModule._resolveFilename = function (request: string, parent: NodeModule | null, isMain: boolean, options?: unknown) {
  if (request.startsWith('../') || request.startsWith('./')) {
    const parentFilename = parent?.filename || parent?.id;
    if (parentFilename && parentFilename.includes('backend/src')) {
      const parentDir = path.dirname(parentFilename);
      const resolvedPath = path.resolve(parentDir, request);
      if (fs.existsSync(resolvedPath) || fs.existsSync(resolvedPath + '.ts') || fs.existsSync(resolvedPath + '.js')) {
        return originalResolveFilename.call(this, resolvedPath, parent, isMain, options);
      }
      const withTs = resolvedPath + '.ts';
      if (fs.existsSync(withTs)) {
        return originalResolveFilename.call(this, withTs, parent, isMain, options);
      }
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
