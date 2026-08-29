import React from 'react';

export const isCameraAvailable = false;

export function useCameraPermissions() {
  return [{ granted: false, canAskAgain: false, status: 'undetermined' }, async () => ({ granted: false })];
}

export function CameraView() {
  return null;
}
