CREATE TABLE `admin_booking_inbox` (
	`admin_id` text PRIMARY KEY NOT NULL,
	`last_seen_id` integer NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `booking_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` text NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_notifications_booking_id_unique` ON `booking_notifications` (`booking_id`);--> statement-breakpoint
CREATE TABLE `deleted_booking_requests` (
	`key` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE INDEX `booking_idempotency_booking` ON `booking_idempotency` (`booking_id`);