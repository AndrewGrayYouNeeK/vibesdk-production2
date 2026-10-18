/**
 * agents' default hung-interval recovery window. A running interval is left
 * alone until this many seconds have passed, then the alarm is brought back
 * to reset it.
 */
export const AGENT_HUNG_SCHEDULE_TIMEOUT_SECONDS = 30;

/** Think caps workflow-notification retries at five minutes. */
export const WORKFLOW_NOTIFICATION_MAX_DELAY_MS = 300_000;

export interface IdleAlarmInput {
	nowMs: number;
	/** Active `keepAlive()` holders. While this is positive the heartbeat must stay. */
	keepAliveRefs: number;
	/** Next due `cf_agents_schedules.time`, in unix seconds. */
	readyScheduleTimeSeconds: number | null;
	/** `execution_started_at` of an interval that is still inside the hung window. */
	hungIntervalStartedAtSeconds: number | null;
	/**
	 * Attempts on the oldest undelivered workflow notification.
	 * `null` means there is no pending row.
	 */
	pendingNotificationAttempts: number | null;
}

export type IdleAlarmDecision =
	| { action: 'leave' }
	| { action: 'delete' }
	| { action: 'set'; atMs: number };

/**
 * Decide what to do with the single Durable Object alarm slot after an alarm
 * has run. A positive keep-alive count means in-flight work already refreshed
 * the heartbeat, so the slot is left as-is. Otherwise the next alarm is the
 * earliest real deadline, and an idle object deletes the slot.
 */
export function decideIdleAlarm(input: IdleAlarmInput): IdleAlarmDecision {
	if (input.keepAliveRefs > 0) return { action: 'leave' };

	let next: number | null = null;
	if (input.readyScheduleTimeSeconds !== null) {
		next = Math.max(input.readyScheduleTimeSeconds * 1000, input.nowMs + 1);
	}
	if (input.hungIntervalStartedAtSeconds !== null) {
		const recoveryMs =
			(input.hungIntervalStartedAtSeconds + AGENT_HUNG_SCHEDULE_TIMEOUT_SECONDS) * 1000;
		next = next === null ? recoveryMs : Math.min(next, recoveryMs);
	}
	if (input.pendingNotificationAttempts !== null) {
		const exponent = Math.min(Math.max(input.pendingNotificationAttempts, 0), 8);
		const delayMs = Math.min(WORKFLOW_NOTIFICATION_MAX_DELAY_MS, 1000 * 2 ** exponent);
		const atMs = input.nowMs + delayMs;
		next = next === null ? atMs : Math.min(next, atMs);
	}
	if (next === null) return { action: 'delete' };
	return { action: 'set', atMs: next };
}
