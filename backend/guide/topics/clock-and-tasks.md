---
id: clock-and-tasks
title: Clock and tasks
summary: Alarms, one-time reminders, recurring routines, and the Clock tab.
tags: [clock, alarms, reminders, tasks, routines, schedule]
related: [tools-and-approvals, voice, troubleshooting]
order: 120
---
# Clock and tasks

Aether can schedule alarms, one-time reminders, daily routines, and routines that stop after an end date. Tasks are stored locally and run from the daemon even when the island is collapsed.

Open the **Clock** tab to see alarms, tasks, weather, and their controls. You can also create and edit them by asking.

## What you can schedule

- **Alarm** — an audible alert at a time you choose. Alarms can be one-time or daily.
- **One-time task** — an AI instruction that runs once at an exact date and time.
- **Daily routine** — an AI instruction that runs every day at an hour and minute.
- **Custom routine** — a daily routine that starts at one date/time and stops after an end date/time.

Examples:

- “Set an alarm for 7:30 tomorrow morning.”
- “Remind me at 6 pm to stretch.”
- “Every weekday at 9 am, summarize my schedule.” — use a daily routine; Aether does not have a separate weekday-only picker.
- “Every day at 8 am until December 31, give me a weather briefing.”
- “Move my 6 pm reminder to 7 pm.”
- “Pause my morning routine.”
- “Cancel the alarm called ‘stand up’.”

## Editing and cancelling

Ask Aether to list tasks first when you are not sure of the exact name or ID. The assistant uses the real task ID before editing, cancelling, completing, pausing, or resuming. This avoids changing the wrong task.

- **Pause** stops a recurring task without deleting it.
- **Resume** restarts a paused recurring task.
- **Complete** marks a task done and stops future runs.
- **Cancel** deletes the task.

One-time tasks can be completed; recurring tasks can be paused and resumed. Alarms appear in the Clock tab’s alarm panel.

## How scheduled turns behave

When a task is due, the daemon runs the instruction as a background turn. The result is saved to the task’s session and appears in chat history. Background turns do not stream into the open chat bubble, so they will not interrupt what you are typing.

Scheduled tasks need the daemon to be running. If Aether is closed at the scheduled time, the task cannot run; it is not a Windows Task Scheduler replacement.

## Time zone

Use local times in requests. Aether includes the current local date and time in the prompt so “tomorrow”, “tonight”, and “in two hours” resolve against your clock. If you travel or change the Windows time zone, review recurring tasks afterward.

## Weather

The Clock tab shows a weather snapshot for the configured location. Refresh it from the tab. Weather is display-only; it does not require the Clock tool group.
