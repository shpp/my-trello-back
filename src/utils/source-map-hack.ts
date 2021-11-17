/* eslint-disable @typescript-eslint/no-explicit-any */
import { SourceMapConsumer } from 'source-map';

let rawSourceMap: any;
// Only install once if called multiple times
// const errorFormatterInstalled = false;
// const uncaughtShimInstalled = false;

// If true, the caches are reset before a stack trace formatting operation
// const emptyCacheBetweenOperations = false;

// Supports {browser, node, auto}
// const environment = 'auto';

// Maps a file path to a string containing the file contents
// const fileContentsCache = {};

// Maps a file path to a source map for that file
const sourceMapCache: {
  [s: string]: { url: string; map: SourceMapConsumer };
} = {};

/*
{
  "version": 3,
  "file": "worker.js",
  "sources": [
    "webpack://worker-typescript-template/./src/handler.ts",
    "webpack://worker-typescript-template/webpack/bootstrap",
    "webpack://worker-typescript-template/./src/index.ts"
  ],
  "sourcesContent": [
    "export async function handleRequest(request: Request): Promise<Response> {\n  try {\n    X.trim()\n  } catch (e) {\n    return new Response(`request method: ${e.stack}`)\n  }\n  return new Response(`request method: ${request.method}`)\n}\n",
    "// The module cache\nvar __webpack_module_cache__ = {};\n\n// The require function\nfunction __webpack_require__(moduleId) {\n\t// Check if module is in cache\n\tvar cachedModule = __webpack_module_cache__[moduleId];\n\tif (cachedModule !== undefined) {\n\t\treturn cachedModule.exports;\n\t}\n\t// Create a new module (and put it into the cache)\n\tvar module = __webpack_module_cache__[moduleId] = {\n\t\t// no module.id needed\n\t\t// no module.loaded needed\n\t\texports: {}\n\t};\n\n\t// Execute the module function\n\t__webpack_modules__[moduleId](module, module.exports, __webpack_require__);\n\n\t// Return the exports of the module\n\treturn module.exports;\n}\n\n",
    "import { handleRequest } from './handler'\n\naddEventListener('fetch', (event) => {\n  event.respondWith(handleRequest(event.request))\n})\n"
  ],
  "mappings": ";;;;;;;;;;;;;AAAA;AACA;AACA;AACA;AAAA;AACA;AACA;AACA;AACA;AAPA;;;A;;;;ACAA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;AACA;;;;;;;;;;;ACvBA;AAEA;AACA;AACA;;;;;A",
  "sourceRoot": ""
}
*/

declare global {
  let sourceMappingURL: string;
}

export function enableSourceMap(): void {
  (Error as any).prepareStackTrace = prepareStackTrace;
}

type StackFrame = {
  isNative: () => boolean;
  getFileName: () => string;
  getScriptNameOrSourceURL: () => string;
  getLineNumber: () => number;
  getColumnNumber: () => number;
  isEval: () => boolean;
  getFunctionName: () => string;
  getEvalOrigin: () => string;
  getMethodName: () => string;
  isConstructor: () => boolean;
  isToplevel: () => boolean;
  getTypeName: () => string;
};

function prepareStackTrace(error: Error, stack: StackFrame[]) {
  if (!rawSourceMap) rawSourceMap = JSON.parse(atob(sourceMappingURL.split('base64,')[1]));

  console.log({ error, stack });
  const name = error.name || 'Error';
  const message = error.message || '';
  const errorString = name + ': ' + message;

  const state = { nextPosition: null, curPosition: null };
  const processedStack = [];
  for (let i = stack.length - 1; i >= 0; i--) {
    processedStack.push('\n    at ' + wrapCallSite(stack[i], state));
    state.nextPosition = state.curPosition;
  }
  state.curPosition = state.nextPosition = null;
  return errorString + processedStack.reverse().join('');
  //+ ' //// ' + error + ' / ' + stack; //+" / "+JSON.stringify(sourceMapCache, undefined, 2);
}

type StackState = {
  nextPosition: { name: string } | null;
  curPosition: {
    source: string;
    line: number;
    column: number;
  } | null;
};

function wrapCallSite(frame: StackFrame, state: StackState) {
  // provides interface backward compatibility
  if (state === undefined) {
    state = { nextPosition: null, curPosition: null };
  }
  if (frame.isNative()) {
    state.curPosition = null;
    return frame;
  }

  // Most call sites will return the source file from getFileName(), but code
  // passed to eval() ending in "//# sourceURL=..." will return the source file
  // from getScriptNameOrSourceURL() instead
  const source = frame.getFileName() || frame.getScriptNameOrSourceURL();
  if (source) {
    const line = frame.getLineNumber();
    let column = frame.getColumnNumber() - 1;

    // Fix position in Node where some (internal) code is prepended.
    // See https://github.com/evanw/node-source-map-support/issues/36
    // Header removed in node at ^10.16 || >=11.11.0
    // v11 is not an LTS candidate, we can just test the one version with it.
    // Test node versions for: 10.16-19, 10.20+, 12-19, 20-99, 100+, or 11.11
    const noHeader = /^v(10\.1[6-9]|10\.[2-9][0-9]|10\.[0-9]{3,}|1[2-9]\d*|[2-9]\d|\d{3,}|11\.11)/;
    const headerLength = noHeader.test('dfdf') ? 0 : 62;
    if (line === 1 && column > headerLength && !frame.isEval()) {
      column -= headerLength;
    }

    const position = mapSourcePosition({
      source: source,
      line: line,
      column: column,
    });
    state.curPosition = position;
    frame = cloneCallSite(frame);
    const originalFunctionName = frame.getFunctionName;
    frame.getFunctionName = function () {
      if (state.nextPosition == null) {
        return originalFunctionName();
      }
      return state.nextPosition.name || originalFunctionName();
    };
    frame.getFileName = function () {
      return position.source;
    };
    frame.getLineNumber = function () {
      return position.line;
    };
    frame.getColumnNumber = function () {
      return position.column + 1;
    };
    frame.getScriptNameOrSourceURL = function () {
      return position.source;
    };
    return frame;
  }

  // Code called using eval() needs special handling
  let origin = frame.isEval() && frame.getEvalOrigin();
  if (origin) {
    origin = mapEvalOrigin(origin);
    frame = cloneCallSite(frame);
    (frame as any).getEvalOrigin = function () {
      return origin;
    };
    return frame;
  }

  // If we get here then we were unable to change the source position
  return frame;
}

function cloneCallSite(frame: StackFrame): StackFrame {
  const object: any = {};
  Object.getOwnPropertyNames(Object.getPrototypeOf(frame)).forEach(function (name) {
    object[name] = /^(?:is|get)/.test(name)
      ? function () {
          return (frame as any)[name].call(frame);
        }
      : (frame as any)[name];
  });
  object.toString = CallSiteToString;
  return object;
}

// This is copied almost verbatim from the V8 source code at
// https://code.google.com/p/v8/source/browse/trunk/src/messages.js. The
// implementation of wrapCallSite() used to just forward to the actual source
// code of CallSite.prototype.toString but unfortunately a new release of V8
// did something to the prototype chain and broke the shim. The only fix I
// could find was copy/paste.
function CallSiteToString(this: StackFrame) {
  let fileName;
  let fileLocation = '';
  if (this.isNative()) {
    fileLocation = 'native';
  } else {
    fileName = this.getScriptNameOrSourceURL();
    if (!fileName && this.isEval()) {
      fileLocation = this.getEvalOrigin();
      fileLocation += ', '; // Expecting source position to follow.
    }

    if (fileName) {
      fileLocation += fileName;
    } else {
      // Source code does not originate from a file and is not native, but we
      // can still get the source position inside the source string, e.g. in
      // an eval string.
      fileLocation += '<anonymous>';
    }
    const lineNumber = this.getLineNumber();
    if (lineNumber != null) {
      fileLocation += ':' + lineNumber;
      const columnNumber = this.getColumnNumber();
      if (columnNumber) {
        fileLocation += ':' + columnNumber;
      }
    }
  }

  let line = '';
  const functionName = this.getFunctionName();
  let addSuffix = true;
  const isConstructor = this.isConstructor();
  const isMethodCall = !(this.isToplevel() || isConstructor);
  if (isMethodCall) {
    let typeName = this.getTypeName();
    // Fixes shim to be backward compatable with Node v0 to v4
    if (typeName === '[object Object]') {
      typeName = 'null';
    }
    const methodName = this.getMethodName();
    if (functionName) {
      if (typeName && functionName.indexOf(typeName) != 0) {
        line += typeName + '.';
      }
      line += functionName;
      if (methodName && functionName.indexOf('.' + methodName) != functionName.length - methodName.length - 1) {
        line += ' [as ' + methodName + ']';
      }
    } else {
      line += typeName + '.' + (methodName || '<anonymous>');
    }
  } else if (isConstructor) {
    line += 'new ' + (functionName || '<anonymous>');
  } else if (functionName) {
    line += functionName;
  } else {
    line += fileLocation;
    addSuffix = false;
  }
  if (addSuffix) {
    line += ' (' + fileLocation + ')';
  }
  return line;
}

// Parses code generated by FormatEvalOrigin(), a function inside V8:
// https://code.google.com/p/v8/source/browse/trunk/src/messages.js
function mapEvalOrigin(origin: string): string {
  // Most eval() calls are in this format
  let match = /^eval at ([^(]+) \((.+):(\d+):(\d+)\)$/.exec(origin);
  if (match) {
    const position = mapSourcePosition({
      source: match[2],
      line: +match[3],
      column: +match[4] - 1,
    });
    return 'eval at ' + match[1] + ' (' + position.source + ':' + position.line + ':' + (position.column + 1) + ')';
  }

  // Parse nested eval() calls using recursion
  match = /^eval at ([^(]+) \((.+)\)$/.exec(origin);
  if (match) {
    return 'eval at ' + match[1] + ' (' + mapEvalOrigin(match[2]) + ')';
  }

  // Make sure we still return useful information if we didn't find anything
  return origin;
}

// Support URLs relative to a directory, but be careful about a protocol prefix
// in case we are in the browser (i.e. directories may start with "http://" or "file:///")
function supportRelativeURL(file: string, url: string) {
  console.log({ supportRelativeURL: file, url });
  if (!file) return url;
  const dirs = file.split(/\//g);
  const dir = dirs[dirs.length - 2] || file;
  const match = /^\w+:\/\/[^/]*/.exec(dir);
  let protocol = match ? match[0] : '';
  const startPath = dir.slice(protocol.length);
  if (protocol && /^\/\w:/.test(startPath)) {
    // handle file:///C:/ paths
    protocol += '/';
    return protocol + (dir.slice(protocol.length) + '/' + url).replace(/\\/g, '/');
  }
  return protocol + (dir.slice(protocol.length) + '/' + url);
}

function mapSourcePosition(position: { source: string; line: number; column: number }): {
  source: string;
  line: number;
  column: number;
} {
  let sourceMap = sourceMapCache[position.source];
  if (!sourceMap) {
    // Call the (overrideable) retrieveSourceMap function to get the source map.
    sourceMap = sourceMapCache[position.source] = {
      url: (rawSourceMap as any).file,
      map: new SourceMapConsumer(rawSourceMap),
    };
  }

  // Resolve the source URL relative to the URL of the source map
  if (sourceMap && sourceMap.map && typeof sourceMap.map.originalPositionFor === 'function') {
    const originalPosition = sourceMap.map.originalPositionFor(position);

    // Only return the original position if a matching line was found. If no
    // matching line is found then we return position instead, which will cause
    // the stack trace to print the path and line for the compiled file. It is
    // better to give a precise location in the compiled file than a vague
    // location in the original file.
    if (originalPosition.source !== null) {
      originalPosition.source = supportRelativeURL(sourceMap.url, originalPosition.source);
      return originalPosition;
    }
  }

  return position;
}
