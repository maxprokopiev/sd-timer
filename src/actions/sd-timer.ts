import { action, streamDeck, DialRotateEvent, DialUpEvent, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
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
		const quotient = Math.floor(count/60);
		const remainder = count % 60;
		return `${quotient}:${remainder < 10 ? '0' : ''}${remainder}`;
	}

	override async onDialRotate(ev: DialRotateEvent<TimerSettings>): Promise<void> {
		const { ticks } = ev.payload;
		const { settings } = ev.payload;
		settings.count = (settings.count ?? 0) + ticks*30;

		if (settings.count < 0) {
			return;
		}

		await ev.action.setSettings(settings);
		await ev.action.setTitle(`${settings.count}`);

		await ev.action.setFeedback({ value: this.convertToTime(settings.count), indicator: 0 });
	}

        override async onDialUp(ev: DialUpEvent<TimerSettings>): Promise<void> {
		function onTick(ev: DialUpEvent<TimerSettings>, that: SDTimer) {
		  const { settings } = ev.payload;
		  settings.count = (settings.count ?? 0) - 1;

		  streamDeck.logger.info(settings.interval);

		  if (settings.count <= 0) {
                    const command = spawn('osascript', ["-e", 'display notification "Timer done" sound name "Hero" with title "Timer"']);
		    clearInterval(settings.interval);
		  }

		  const indicator = 100 - settings.count*100/(settings.initialValue ?? 1);
	 	  ev.action.setFeedback({ value: that.convertToTime(settings.count), indicator: indicator });
		  ev.action.setSettings(settings);
		}

		const { settings } = ev.payload;
		if (settings.interval) {
		  clearInterval(settings.interval);
		  settings.interval = undefined;
		} else {
	          settings.initialValue = settings.count;
		  settings.interval = Number(setInterval(onTick, 1000, ev, this));
		}
		await ev.action.setSettings(settings);
	}
}

type TimerSettings = {
	initialValue?: number;
	count?: number;
	interval?: number;
};
