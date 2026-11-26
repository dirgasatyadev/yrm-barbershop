CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_sessions_token_hash_unique` ON `admin_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_expires` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `admins` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admins_username_unique` ON `admins` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `admins_email_unique` ON `admins` (`email`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_created` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `barbers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`photo_url` text NOT NULL,
	`description` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `booking_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` text NOT NULL,
	`barber_id` text NOT NULL,
	`booking_date` text NOT NULL,
	`slot_start` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "slot_grid" CHECK("booking_slots"."slot_start" >= 0 and "booking_slots"."slot_start" < 1440 and "booking_slots"."slot_start" % 5 = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slot_barber_date_start` ON `booking_slots` (`barber_id`,`booking_date`,`slot_start`);--> statement-breakpoint
CREATE INDEX `slot_booking` ON `booking_slots` (`booking_id`);--> statement-breakpoint
CREATE INDEX `slot_date` ON `booking_slots` (`booking_date`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_code` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`customer_notes` text NOT NULL,
	`service_id` text NOT NULL,
	`barber_id` text NOT NULL,
	`service_name_snapshot` text NOT NULL,
	`barber_name_snapshot` text NOT NULL,
	`price_snapshot` integer NOT NULL,
	`duration_snapshot` integer NOT NULL,
	`booking_date` text NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "booking_status" CHECK("bookings"."status" in ('confirmed','completed','cancelled','no_show')),
	CONSTRAINT "booking_bounds" CHECK("bookings"."start_time" >= 0 and "bookings"."end_time" <= 1440 and "bookings"."end_time"-"bookings"."start_time" = "bookings"."duration_snapshot" and "bookings"."duration_snapshot" between 5 and 480 and "bookings"."start_time" % 5 = 0 and "bookings"."duration_snapshot" % 5 = 0 and "bookings"."price_snapshot" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_booking_code_unique` ON `bookings` (`booking_code`);--> statement-breakpoint
CREATE INDEX `bookings_date_start` ON `bookings` (`booking_date`,`start_time`);--> statement-breakpoint
CREATE INDEX `bookings_created` ON `bookings` (`created_at`);--> statement-breakpoint
CREATE INDEX `bookings_barber_date` ON `bookings` (`barber_id`,`booking_date`);--> statement-breakpoint
CREATE TABLE `booking_idempotency` (
	`key` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`response` text NOT NULL,
	`booking_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`hits` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_expiry` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `barber_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`barber_id` text NOT NULL,
	`shift_id` text,
	`schedule_date` text NOT NULL,
	`start_time` integer,
	`end_time` integer,
	`is_day_off` integer DEFAULT false NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "schedule_range" CHECK(("barber_schedules"."start_time" is null and "barber_schedules"."end_time" is null) or ("barber_schedules"."start_time" is not null and "barber_schedules"."end_time" is not null and "barber_schedules"."start_time" >= 0 and "barber_schedules"."end_time" <= 1440 and "barber_schedules"."start_time" < "barber_schedules"."end_time" and "barber_schedules"."start_time" % 5 = 0 and "barber_schedules"."end_time" % 5 = 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_barber_date` ON `barber_schedules` (`barber_id`,`schedule_date`);--> statement-breakpoint
CREATE INDEX `schedule_date` ON `barber_schedules` (`schedule_date`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`price` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "services_price" CHECK("services"."price" >= 0),
	CONSTRAINT "services_duration" CHECK("services"."duration_minutes" between 5 and 480 and "services"."duration_minutes" % 5 = 0)
);
--> statement-breakpoint
CREATE TABLE `business_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "shift_bounds" CHECK("shifts"."start_time" >= 0 and "shifts"."end_time" <= 1440 and "shifts"."start_time" < "shifts"."end_time" and "shifts"."start_time" % 5 = 0 and "shifts"."end_time" % 5 = 0)
);
--> statement-breakpoint
CREATE TABLE `state_version` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL
);
