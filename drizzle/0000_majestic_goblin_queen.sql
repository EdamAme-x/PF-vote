CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`server_fingerprint` text NOT NULL,
	`client_fingerprint` text NOT NULL,
	`vote` text,
	`created_at` integer NOT NULL
);
