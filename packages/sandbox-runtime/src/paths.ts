const PROJECT_ROOT = "/workspace";

function resolve(userPath: string): string {
  // Reject path traversal
  if (userPath.includes("..")) {
    throw new Error(`Path traversal not allowed: ${userPath}`);
  }
  // Reject absolute paths that aren't under /workspace
  if (userPath.startsWith("/") && !userPath.startsWith(PROJECT_ROOT)) {
    throw new Error(`Absolute paths must be under ${PROJECT_ROOT}: ${userPath}`);
  }
  // Make relative paths absolute under /workspace
  if (!userPath.startsWith("/")) {
    return `${PROJECT_ROOT}/${userPath}`;
  }
  return userPath;
}

function isUnderWorkspace(absPath: string): boolean {
  return absPath.startsWith(PROJECT_ROOT + "/") || absPath === PROJECT_ROOT;
}

export const pathUtils = { resolve, isUnderWorkspace, PROJECT_ROOT };
