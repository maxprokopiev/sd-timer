import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@elgato/streamdeck', () => {
	function action(_opts: unknown) {
		return (_target: unknown) => {};
	}
	class SingletonAction<T = unknown> {
		onWillAppear(_ev: unknown): void | Promise<void> {}
		onDialRotate(_ev: unknown): Promise<void> { return Promise.resolve(); }
		onDialUp(_ev: unknown): Promise<void> { return Promise.resolve(); }
	}
	return { action, SingletonAction };
});

vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { SDTimer } from '../sd-timer';

function createMockAction(settings: Record<string, unknown> = {}) {
	return {
		isDial: vi.fn(() => true),
		setFeedbackLayout: vi.fn(),
		setTitle: vi.fn(),
		setSettings: vi.fn(),
		setFeedback: vi.fn(),
	};
}

function createDialRotateEvent(ticks: number, settings: Record<string, unknown> = {}) {
	const action = createMockAction(settings);
	return {
		action,
		payload: { ticks, settings },
	};
}

function createDialUpEvent(settings: Record<string, unknown> = {}) {
	const action = createMockAction(settings);
	return {
		action,
		payload: { settings },
	};
}

function createWillAppearEvent(isDial: boolean = true) {
	const action = createMockAction();
	action.isDial.mockReturnValue(isDial);
	action.setTitle.mockReturnValue(Promise.resolve());
	return { action };
}

describe('SDTimer', () => {
	let timer: SDTimer;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		timer = new SDTimer();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe('convertToTime', () => {
		it('formats zero as 0:00', () => {
			expect(timer.convertToTime(0)).toBe('0:00');
		});

		it('formats seconds under a minute', () => {
			expect(timer.convertToTime(30)).toBe('0:30');
			expect(timer.convertToTime(9)).toBe('0:09');
		});

		it('formats exact minutes', () => {
			expect(timer.convertToTime(60)).toBe('1:00');
			expect(timer.convertToTime(120)).toBe('2:00');
		});

		it('formats minutes and seconds', () => {
			expect(timer.convertToTime(90)).toBe('1:30');
			expect(timer.convertToTime(61)).toBe('1:01');
			expect(timer.convertToTime(605)).toBe('10:05');
		});

		it('clamps negative values to 0:00', () => {
			expect(timer.convertToTime(-1)).toBe('0:00');
			expect(timer.convertToTime(-60)).toBe('0:00');
		});
	});

	describe('onWillAppear', () => {
		it('sets feedback layout when action is a dial', () => {
			const ev = createWillAppearEvent(true);
			timer.onWillAppear(ev as any);

			expect(ev.action.setFeedbackLayout).toHaveBeenCalledWith('custom-layout.json');
			expect(ev.action.setTitle).toHaveBeenCalledWith('Timer');
		});

		it('skips feedback layout when action is not a dial', () => {
			const ev = createWillAppearEvent(false);
			timer.onWillAppear(ev as any);

			expect(ev.action.setFeedbackLayout).not.toHaveBeenCalled();
			expect(ev.action.setTitle).toHaveBeenCalledWith('Timer');
		});
	});

	describe('onDialRotate', () => {
		it('increments count by 30 per tick', async () => {
			const ev = createDialRotateEvent(2);
			await timer.onDialRotate(ev as any);

			expect(ev.payload.settings.count).toBe(60);
			expect(ev.action.setSettings).toHaveBeenCalledWith({ count: 60 });
			expect(ev.action.setFeedback).toHaveBeenCalledWith({ value: '1:00', indicator: 0 });
		});

		it('decrements count on negative ticks', async () => {
			const ev = createDialRotateEvent(-1, { count: 60 });
			await timer.onDialRotate(ev as any);

			expect(ev.payload.settings.count).toBe(30);
		});

		it('clamps count to zero', async () => {
			const ev = createDialRotateEvent(-1, { count: 0 });
			await timer.onDialRotate(ev as any);

			expect(ev.payload.settings.count).toBe(0);
			expect(ev.action.setFeedback).toHaveBeenCalledWith({ value: '0:00', indicator: 0 });
		});

		it('clamps when decrement would go below zero', async () => {
			const ev = createDialRotateEvent(-2, { count: 30 });
			await timer.onDialRotate(ev as any);

			expect(ev.payload.settings.count).toBe(0);
		});

		it('ignores rotation while timer is running', async () => {
			const ev = createDialRotateEvent(1, { count: 60, interval: 123 });
			await timer.onDialRotate(ev as any);

			expect(ev.action.setSettings).not.toHaveBeenCalled();
			expect(ev.payload.settings.count).toBe(60);
		});
	});

	describe('onDialUp', () => {
		it('does not start timer when count is zero', async () => {
			const ev = createDialUpEvent({ count: 0 });
			await timer.onDialUp(ev as any);

			expect(ev.payload.settings.interval).toBeUndefined();
		});

		it('does not start timer when count is undefined', async () => {
			const ev = createDialUpEvent({});
			await timer.onDialUp(ev as any);

			expect(ev.payload.settings.interval).toBeUndefined();
		});

		it('starts timer and sets initialValue', async () => {
			const ev = createDialUpEvent({ count: 90 });
			await timer.onDialUp(ev as any);

			expect(ev.payload.settings.initialValue).toBe(90);
			expect(ev.payload.settings.interval).toBeDefined();
			expect(ev.action.setSettings).toHaveBeenCalled();
		});

		it('stops timer on second press', async () => {
			const ev = createDialUpEvent({ count: 90, interval: 999 });
			await timer.onDialUp(ev as any);

			expect(ev.payload.settings.interval).toBeUndefined();
			expect(ev.action.setSettings).toHaveBeenCalledWith(
				expect.objectContaining({ interval: undefined })
			);
		});

		it('decrements count each second', async () => {
			const ev = createDialUpEvent({ count: 3 });
			await timer.onDialUp(ev as any);

			vi.advanceTimersByTime(1000);
			expect(ev.payload.settings.count).toBe(2);

			vi.advanceTimersByTime(1000);
			expect(ev.payload.settings.count).toBe(1);
		});

		it('updates feedback with progress indicator', async () => {
			const ev = createDialUpEvent({ count: 2 });
			await timer.onDialUp(ev as any);

			vi.advanceTimersByTime(1000);

			expect(ev.action.setFeedback).toHaveBeenCalledWith({
				value: '0:01',
				indicator: 50,
			});
		});

		it('stops at zero and spawns notification', async () => {
			const ev = createDialUpEvent({ count: 2 });
			await timer.onDialUp(ev as any);

			vi.advanceTimersByTime(2000);

			expect(ev.payload.settings.count).toBe(0);
			expect(ev.payload.settings.interval).toBeUndefined();
			expect(spawn).toHaveBeenCalledWith('osascript', [
				'-e',
				'display notification "Timer done" sound name "Hero" with title "Timer"',
			]);
		});

		it('does not tick after reaching zero', async () => {
			const ev = createDialUpEvent({ count: 1 });
			await timer.onDialUp(ev as any);

			vi.advanceTimersByTime(3000);

			expect(ev.payload.settings.count).toBe(0);
			expect(spawn).toHaveBeenCalledTimes(1);
		});

		it('shows 0:00 and 100% indicator at completion', async () => {
			const ev = createDialUpEvent({ count: 1 });
			await timer.onDialUp(ev as any);

			vi.advanceTimersByTime(1000);

			expect(ev.action.setFeedback).toHaveBeenCalledWith({
				value: '0:00',
				indicator: 100,
			});
		});
	});
});
