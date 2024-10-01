import streamDeck, { LogLevel } from "@elgato/streamdeck";

import { SDTimer } from "./actions/sd-timer";

// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel(LogLevel.TRACE);

// Register the increment action.
streamDeck.actions.registerAction(new SDTimer());

// Finally, connect to the Stream Deck.
streamDeck.connect();
