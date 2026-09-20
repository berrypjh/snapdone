import type { ImagePickerAsset, ImagePickerResult } from 'expo-image-picker';
import { describe, expect, it, vi } from 'vitest';

import { type CaptureDeps, createImageCapture, toCaptureResult } from './capture';

const asset = (overrides: Partial<ImagePickerAsset> = {}): ImagePickerAsset => ({
  uri: 'file:///cache/photo.jpg',
  width: 1170,
  height: 2532,
  ...overrides,
});

const picked = (...assets: ImagePickerAsset[]): ImagePickerResult => ({ canceled: false, assets });
const cancelled: ImagePickerResult = { canceled: true, assets: null };

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const fakeDeps = (overrides: Partial<CaptureDeps> = {}) => ({
  requestCameraPermission: vi.fn(async () => ({ granted: true, canAskAgain: true })),
  launchCamera: vi.fn(async () => picked(asset())),
  launchLibrary: vi.fn(async () => picked(asset())),
  ...overrides,
});

describe('toCaptureResult', () => {
  it('keeps only the file address of the picked photo', () => {
    const result = toCaptureResult(
      picked(asset({ base64: 'AAAA', exif: { GPSLatitude: 37.5 }, fileName: 'IMG_1.HEIC' })),
      'library',
    );

    expect(result).toEqual({ type: 'selected', image: { uri: 'file:///cache/photo.jpg' } });
  });

  it('treats a cancel as a normal end, not an error', () => {
    expect(toCaptureResult(cancelled, 'camera')).toEqual({ type: 'cancelled' });
  });

  it('fails when nothing usable came back', () => {
    expect(toCaptureResult(picked(), 'library')).toEqual({ type: 'failed', source: 'library' });
    expect(toCaptureResult(picked(asset({ uri: '' })), 'camera')).toEqual({
      type: 'failed',
      source: 'camera',
    });
  });
});

describe('createImageCapture', () => {
  it('asks for the camera permission only when the camera is chosen', async () => {
    const deps = fakeDeps();
    const capture = createImageCapture(deps);

    await capture('library');
    expect(deps.requestCameraPermission).not.toHaveBeenCalled();
    expect(deps.launchLibrary).toHaveBeenCalledTimes(1);

    await capture('camera');
    expect(deps.requestCameraPermission).toHaveBeenCalledTimes(1);
    expect(deps.launchCamera).toHaveBeenCalledTimes(1);
  });

  it('does not open the camera when the permission is refused', async () => {
    const deps = fakeDeps({
      requestCameraPermission: vi.fn(async () => ({ granted: false, canAskAgain: true })),
    });

    expect(await createImageCapture(deps)('camera')).toEqual({
      type: 'camera-denied',
      canAskAgain: true,
    });
    expect(deps.launchCamera).not.toHaveBeenCalled();
  });

  it('reports when the permission can only be changed in settings', async () => {
    const deps = fakeDeps({
      requestCameraPermission: vi.fn(async () => ({ granted: false, canAskAgain: false })),
    });

    expect(await createImageCapture(deps)('camera')).toEqual({
      type: 'camera-denied',
      canAskAgain: false,
    });
  });

  it('turns a picker or permission failure into a failed result', async () => {
    const camera = fakeDeps({
      launchCamera: vi.fn(async () => {
        throw new Error('camera unavailable');
      }),
    });
    const permission = fakeDeps({
      requestCameraPermission: vi.fn(async () => {
        throw new Error('permissions module missing');
      }),
    });

    expect(await createImageCapture(camera)('camera')).toEqual({
      type: 'failed',
      source: 'camera',
    });
    expect(await createImageCapture(permission)('camera')).toEqual({
      type: 'failed',
      source: 'camera',
    });
  });

  it('ignores a second request while a picker is open', async () => {
    const open = deferred<ImagePickerResult>();
    const deps = fakeDeps({ launchLibrary: vi.fn(() => open.promise) });
    const capture = createImageCapture(deps);

    const first = capture('library');
    expect(await capture('library')).toBeNull();
    expect(await capture('camera')).toBeNull();
    open.resolve(picked(asset()));

    expect(await first).toEqual({ type: 'selected', image: { uri: 'file:///cache/photo.jpg' } });
    expect(deps.launchLibrary).toHaveBeenCalledTimes(1);
    expect(deps.launchCamera).not.toHaveBeenCalled();
  });

  it('can open again after a cancel or a failure', async () => {
    const deps = fakeDeps({
      launchLibrary: vi
        .fn<CaptureDeps['launchLibrary']>()
        .mockResolvedValueOnce(cancelled)
        .mockRejectedValueOnce(new Error('io'))
        .mockResolvedValueOnce(picked(asset())),
    });
    const capture = createImageCapture(deps);

    expect(await capture('library')).toEqual({ type: 'cancelled' });
    expect(await capture('library')).toEqual({ type: 'failed', source: 'library' });
    expect((await capture('library'))?.type).toBe('selected');
  });
});
