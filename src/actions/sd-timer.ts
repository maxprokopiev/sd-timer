import { action, DialRotateEvent, DialUpEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { spawn } from 'node:child_process'

@action({ UUID: "com.max-prokopyev.sd-timer.timer" })
export class SDTimer extends SingletonAction<TimerSettings> {
	override onWillAppear(ev: WillAppearEvent<TimerSettings>): void | Promise<void> {
		if (ev.action.isDial()) {
			ev.action.setFeedbackLayout("custom-layout.json");
		}
		return ev.action.setTitle("Timer");
	}

	convertToTime(count: number): string {
		count = Math.max(0, count);
		const minutes = Math.floor(count / 60);
		const seconds = count % 60;
		return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
	}

	override async onDialRotate(ev: DialRotateEvent<TimerSettings>): Promise<void> {
		const { ticks } = ev.payload;
		const { settings } = ev.payload;

		// Ignore rotation while timer is running
		if (settings.interval) {
			return;
		}

		settings.count = Math.max(0, (settings.count ?? 0) + ticks * 30);

		await ev.action.setSettings(settings);
		await ev.action.setTitle(`${settings.count}`);
		await ev.action.setFeedback({ value: this.convertToTime(settings.count), indicator: 0 });
	}

	override async onDialUp(ev: DialUpEvent<TimerSettings>): Promise<void> {
		const { settings } = ev.payload;

		if (settings.interval) {
			clearInterval(settings.interval);
			settings.interval = undefined;
			await ev.action.setSettings(settings);
			return;
		}

		if (!settings.count || settings.count <= 0) {
			return;
		}

		settings.initialValue = settings.count;
		settings.interval = Number(setInterval(() => {
			settings.count = (settings.count ?? 0) - 1;

			if (settings.count <= 0) {
				settings.count = 0;
				clearInterval(settings.interval);
				settings.interval = undefined;
				spawn('osascript', ["-e", 'display notification "Timer done" sound name "Hero" with title "Timer"']);
			}

			const indicator = 100 - settings.count * 100 / (settings.initialValue ?? 1);
			ev.action.setFeedback({ value: this.convertToTime(settings.count), indicator });
			ev.action.setSettings(settings);
		}, 1000));

		await ev.action.setSettings(settings);
	}
}

type TimerSettings = {
	initialValue?: number;
	count?: number;
	interval?: number;
};
