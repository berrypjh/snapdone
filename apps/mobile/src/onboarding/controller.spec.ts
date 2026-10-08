import { describe, expect, it, vi } from 'vitest';

import { createOnboardingController } from './controller';
import { initialProgress, type OnboardingProgress } from './model';
import type { ProgressStore } from './progress';

/** 서버를 대신하는 메모리 저장소. */
const memoryStore = (saved: OnboardingProgress | null = null) => {
  const state = { saved };
  const store = {
    load: vi.fn(async () => state.saved),
    save: vi.fn(async (progress: OnboardingProgress) => {
      state.saved = progress;
    }),
  } satisfies ProgressStore;
  return { store, state };
};

const ready = async (store: ProgressStore) => {
  const controller = createOnboardingController({ store });
  await controller.load();
  return controller;
};

const progressOf = (controller: ReturnType<typeof createOnboardingController>) => {
  const snapshot = controller.getSnapshot();
  if (snapshot.status !== 'ready') throw new Error('not loaded');
  return snapshot.progress;
};

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('load', () => {
  it('is loading until the server answers', () => {
    const { store } = memoryStore();

    expect(createOnboardingController({ store }).getSnapshot()).toEqual({ status: 'loading' });
  });

  it('starts at the intro when nothing is saved', async () => {
    const { store } = memoryStore();

    expect(progressOf(await ready(store))).toEqual(initialProgress);
  });

  it('resumes the saved progress, including progress made on the web', async () => {
    const progress = { step: 'first-image' } as const;
    const { store } = memoryStore(progress);

    expect(progressOf(await ready(store))).toEqual(progress);
  });

  it('starts over when the progress cannot be read', async () => {
    const store: ProgressStore = {
      load: vi.fn(async () => {
        throw new Error('offline');
      }),
      save: vi.fn(async () => undefined),
    };

    expect(progressOf(await ready(store))).toEqual(initialProgress);
  });

  it('keeps progress made after the first load when a second load finishes late', async () => {
    const { store } = memoryStore();
    const controller = createOnboardingController({ store });
    const first = controller.load();
    const second = controller.load();
    await first;
    controller.dispatch({ type: 'start' });
    await second;

    expect(progressOf(controller).step).toBe('first-image');
  });
});

describe('dispatch', () => {
  it('publishes and saves each change', async () => {
    const { store, state } = memoryStore();
    const controller = await ready(store);
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.dispatch({ type: 'start' });
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(state.saved).toEqual({ step: 'first-image' });
  });

  it('neither publishes nor saves a repeated event', async () => {
    const { store } = memoryStore();
    const controller = await ready(store);
    controller.dispatch({ type: 'start' });
    await flush();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.dispatch({ type: 'start' });
    await flush();

    expect(listener).not.toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it('ignores events before the saved progress is loaded', () => {
    const { store } = memoryStore();
    const controller = createOnboardingController({ store });

    controller.dispatch({ type: 'start' });

    expect(controller.getSnapshot()).toEqual({ status: 'loading' });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('keeps going when saving fails, and the next launch starts from the last saved step', async () => {
    const { store, state } = memoryStore();
    const controller = await ready(store);
    store.save.mockRejectedValueOnce(new Error('offline'));

    controller.dispatch({ type: 'start' });
    await flush();

    expect(progressOf(controller).step).toBe('first-image');
    expect(state.saved).toBeNull();
  });

  it('resumes at the first image after the intro, carrying no image', async () => {
    const { store } = memoryStore();
    const controller = await ready(store);
    controller.dispatch({ type: 'start' });
    await flush();

    expect(progressOf(await ready(store))).toEqual({ step: 'first-image' });
  });
});
