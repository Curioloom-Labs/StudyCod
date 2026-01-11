import Module from 'module';
import path from 'path';
import fs from 'fs';
const originalResolveFilename = (Module as any)._resolveFilename;
const backendSrc = path.resolve(__dirname, '../../backend/src');
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
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