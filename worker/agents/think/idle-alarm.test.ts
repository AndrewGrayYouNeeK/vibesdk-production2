import { describe, expect, it } from 'vitest';
import { decideIdleAlarm } from './idle-alarm';

const nowMs = 1_700_000_000_000;

function idle(overrides: Partial<Parameters<typeof decideIdleAlarm>[0]> = {}) {
	return decideIdleAlarm({
		nowMs,
		keepAliveRefs: 0,
		readyScheduleTimeSeconds: null,
		hungIntervalStartedAtSeconds: null,
		pendingNotificationAttempts: null,
		...overrides,
	});
}

describe('decideIdleAlarm', () => {
	it('leaves the slot alone while keep-alive work is running', () => {
		expect(idle({ keepAliveRefs: 1 })).toEqual({ action: 'leave' });
	});

	it('deletes the alarm when nothing is pending', () => {
		expect(idle()).toEqual({ action: 'delete' });
	});

	it('keeps a future schedule at its timestamp', () => {
		const readyScheduleTimeSeconds = Math.floor(nowMs / 1000) + 120;
		expect(idle({ readyScheduleTimeSeconds })).toEqual({
			action: 'set',
			atMs: readyScheduleTimeSeconds * 1000,
		});
	});

	it('fires an overdue schedule on the next tick', () => {
		expect(idle({ readyScheduleTimeSeconds: Math.floor(nowMs / 1000) - 10 })).toEqual({
			action: 'set',
			atMs: nowMs + 1,
		});
	});

	it('uses the earlier of a schedule and hung-interval recovery', () => {
		const started = Math.floor(nowMs / 1000) - 5;
		const recoveryMs = (started + 30) * 1000;
		const soonerSchedule = Math.floor(nowMs / 1000) + 10;
		expect(
			idle({
				readyScheduleTimeSeconds: soonerSchedule,
				hungIntervalStartedAtSeconds: started,
			}),
		).toEqual({ action: 'set', atMs: soonerSchedule * 1000 });

		const laterSchedule = Math.floor(nowMs / 1000) + 120;
		expect(
			idle({
				readyScheduleTimeSeconds: laterSchedule,
				hungIntervalStartedAtSeconds: started,
			}),
		).toEqual({ action: 'set', atMs: recoveryMs });
	});

	it('retries a pending workflow notification with Think backoff', () => {
		expect(idle({ pendingNotificationAttempts: 0 })).toEqual({
			action: 'set',
			atMs: nowMs + 1000,
		});
		expect(idle({ pendingNotificationAttempts: 3 })).toEqual({
			action: 'set',
			atMs: nowMs + 8000,
		});
		// Exponent is capped at 8 (256s), which is inside the 300s ceiling.
		expect(idle({ pendingNotificationAttempts: 8 })).toEqual({
			action: 'set',
			atMs: nowMs + 256_000,
		});
		expect(idle({ pendingNotificationAttempts: 20 })).toEqual({
			action: 'set',
			atMs: nowMs + 256_000,
		});
	});

	it('prefers the earlier of a schedule and a notification retry', () => {
		expect(
			idle({
				readyScheduleTimeSeconds: Math.floor(nowMs / 1000) + 120,
				pendingNotificationAttempts: 0,
			}),
		).toEqual({ action: 'set', atMs: nowMs + 1000 });
	});
});
